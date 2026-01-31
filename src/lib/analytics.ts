import { db } from "@/lib/db";
import type { AnalyticsSummary } from "@/types";

// ─── Track a single analytics event ──────────────────────────────────────────

export async function trackEvent(params: {
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { sessionId, eventType, payload } = params;

  try {
    await db.analyticsEvent.create({
      data: {
        sessionId,
        eventType,
        payload: payload as object,
      },
    });
  } catch (error) {
    // Fire-and-forget: log the error but do not throw
    console.error(
      `[analytics] Failed to track event type="${eventType}" session="${sessionId}":`,
      error instanceof Error ? error.message : error
    );
  }
}

// ─── Get all events for a session ─────────────────────────────────────────────

export async function getSessionAnalytics(sessionId: string) {
  return db.analyticsEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Aggregate analytics for a single SKU ─────────────────────────────────────

export async function getSkuAnalytics(
  skuId: string,
  params?: { from?: Date; to?: Date }
): Promise<AnalyticsSummary> {
  const dateFilter = buildDateFilter(params?.from, params?.to);

  // Get all sessions for this SKU
  const sessions = await db.session.findMany({
    where: { skuId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  if (sessionIds.length === 0) {
    return emptyAnalyticsSummary();
  }

  // Fetch all analytics events for these sessions within the date range
  const events = await db.analyticsEvent.findMany({
    where: {
      sessionId: { in: sessionIds },
      ...dateFilter,
    },
  });

  return computeAnalyticsSummary(events);
}

// ─── Aggregate analytics for an entire brand ──────────────────────────────────

export async function getBrandAnalytics(
  brandId: string,
  params?: { from?: Date; to?: Date }
): Promise<AnalyticsSummary> {
  const dateFilter = buildDateFilter(params?.from, params?.to);

  // Get all SKUs for this brand (through product lines)
  const productLines = await db.productLine.findMany({
    where: { brandId },
    select: { id: true },
  });
  const productLineIds = productLines.map((pl) => pl.id);

  if (productLineIds.length === 0) {
    return emptyAnalyticsSummary();
  }

  const skus = await db.sKU.findMany({
    where: { productLineId: { in: productLineIds } },
    select: { id: true },
  });
  const skuIds = skus.map((s) => s.id);

  if (skuIds.length === 0) {
    return emptyAnalyticsSummary();
  }

  // Get all sessions across all SKUs
  const sessions = await db.session.findMany({
    where: { skuId: { in: skuIds } },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  if (sessionIds.length === 0) {
    return emptyAnalyticsSummary();
  }

  const events = await db.analyticsEvent.findMany({
    where: {
      sessionId: { in: sessionIds },
      ...dateFilter,
    },
  });

  return computeAnalyticsSummary(events);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface AnalyticsEventRow {
  id: string;
  sessionId: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
}

function buildDateFilter(from?: Date, to?: Date): object {
  if (!from && !to) return {};
  const filter: Record<string, Date> = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return { createdAt: filter };
}

function emptyAnalyticsSummary(): AnalyticsSummary {
  return {
    totalScans: 0,
    totalSessions: 0,
    resolutionRate: 0,
    escalationRate: 0,
    avgResponseTime: 0,
    topIntents: [],
    unresolvedQuestions: [],
    deflectionEstimate: 0,
  };
}

function computeAnalyticsSummary(
  events: AnalyticsEventRow[]
): AnalyticsSummary {
  const totalScans = events.filter((e) => e.eventType === "qr_scan").length;
  const totalSessions = events.filter(
    (e) => e.eventType === "session_start"
  ).length;

  const solved = events.filter((e) => e.eventType === "solved").length;
  const notSolved = events.filter((e) => e.eventType === "not_solved").length;
  const escalated = events.filter((e) => e.eventType === "escalated").length;

  const totalOutcomes = solved + notSolved + escalated;
  const resolutionRate = totalOutcomes > 0 ? solved / totalOutcomes : 0;
  const escalationRate = totalSessions > 0 ? escalated / totalSessions : 0;

  // Average response time: computed from answer events that have responseTimeMs in payload
  const answerEvents = events.filter((e) => e.eventType === "answer");
  let avgResponseTime = 0;
  if (answerEvents.length > 0) {
    const responseTimes = answerEvents
      .map((e) => {
        const payload = e.payload as Record<string, unknown> | null;
        return typeof payload?.responseTimeMs === "number"
          ? payload.responseTimeMs
          : null;
      })
      .filter((t): t is number => t !== null);

    if (responseTimes.length > 0) {
      avgResponseTime =
        responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    }
  }

  // Top intents: group question events by their content, count occurrences
  const intentCounts = new Map<string, number>();
  const questionEvents = events.filter((e) => e.eventType === "question");
  for (const event of questionEvents) {
    const payload = event.payload as Record<string, unknown> | null;
    const content =
      typeof payload?.content === "string" ? payload.content : "unknown";
    intentCounts.set(content, (intentCounts.get(content) || 0) + 1);
  }

  const topIntents = Array.from(intentCounts.entries())
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Unresolved questions: questions that led to not_solved or escalated outcomes
  // We match by sessionId — if a session has a not_solved or escalated event,
  // all questions from that session are considered unresolved.
  const unresolvedSessionIds = new Set(
    events
      .filter((e) => e.eventType === "not_solved" || e.eventType === "escalated")
      .map((e) => e.sessionId)
  );

  const unresolvedCounts = new Map<string, number>();
  for (const event of questionEvents) {
    if (unresolvedSessionIds.has(event.sessionId)) {
      const payload = event.payload as Record<string, unknown> | null;
      const content =
        typeof payload?.content === "string" ? payload.content : "unknown";
      unresolvedCounts.set(content, (unresolvedCounts.get(content) || 0) + 1);
    }
  }

  const unresolvedQuestions = Array.from(unresolvedCounts.entries())
    .map(([question, count]) => ({ question, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Deflection estimate: proportion of sessions that were solved by AI
  const deflectionEstimate = totalSessions > 0 ? solved / totalSessions : 0;

  return {
    totalScans,
    totalSessions,
    resolutionRate,
    escalationRate,
    avgResponseTime,
    topIntents,
    unresolvedQuestions,
    deflectionEstimate,
  };
}
