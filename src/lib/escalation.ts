import { db } from "./db";
import type { CaseCreateRequest, StructuredResponse, Citation } from "@/types";

/**
 * Create an escalation case from a voice session.
 *
 * Loads the session and all its messages, builds a transcript,
 * extracts steps attempted and sources used from structured responses,
 * creates a Case record, tries to find an available agent for the brand,
 * and updates the session status to ESCALATED.
 */
export async function createCase(
  request: CaseCreateRequest
): Promise<{ caseId: string; agentAssigned: boolean }> {
  // Load session with messages and product chain
  const session = await db.session.findUniqueOrThrow({
    where: { id: request.sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      sku: {
        include: {
          productLine: {
            include: { brand: true },
          },
        },
      },
    },
  });

  // Build transcript from messages
  const transcript = session.messages
    .map((msg) => {
      const role = msg.role === "USER" ? "Customer" : msg.role === "ASSISTANT" ? "Assistant" : "System";
      return `[${role}] ${msg.content}`;
    })
    .join("\n\n");

  // Extract steps attempted from structured responses
  const stepsAttempted: string[] = [];
  const sourcesUsed: Citation[] = [];

  for (const msg of session.messages) {
    if (msg.structuredResponse) {
      const structured = msg.structuredResponse as unknown as StructuredResponse;

      if (structured.steps && Array.isArray(structured.steps)) {
        for (const step of structured.steps) {
          stepsAttempted.push(step.text);
        }
      }

      if (structured.citations && Array.isArray(structured.citations)) {
        for (const citation of structured.citations) {
          // Avoid duplicates by documentId + section
          const exists = sourcesUsed.some(
            (s) => s.documentId === citation.documentId && s.section === citation.section
          );
          if (!exists) {
            sourcesUsed.push(citation);
          }
        }
      }
    }
  }

  // Find available agent in the same brand
  const brandId = session.sku.productLine.brandId;
  const availableAgent = await db.agent.findFirst({
    where: {
      brandId,
      available: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Create the Case record
  const caseRecord = await db.case.create({
    data: {
      sessionId: request.sessionId,
      skuId: session.skuId,
      category: request.category,
      email: request.email,
      description: request.description,
      photoUrls: request.photoUrls ?? [],
      status: availableAgent ? "ASSIGNED" : "OPEN",
      assignedTo: availableAgent?.id,
      transcript,
      stepsAttempted,
      sourcesUsed: JSON.parse(JSON.stringify(sourcesUsed)),
      webhookSent: false,
    },
  });

  // Update session status to ESCALATED
  await db.session.update({
    where: { id: request.sessionId },
    data: { status: "ESCALATED" },
  });

  // Track analytics event
  await db.analyticsEvent.create({
    data: {
      sessionId: request.sessionId,
      eventType: "escalated",
      payload: {
        caseId: caseRecord.id,
        category: request.category,
        agentAssigned: !!availableAgent,
      },
    },
  });

  return {
    caseId: caseRecord.id,
    agentAssigned: !!availableAgent,
  };
}

/**
 * Resolve an escalation case and its associated session.
 *
 * Sets the case status to RESOLVED with a resolvedAt timestamp,
 * and also marks the parent session as RESOLVED.
 */
export async function resolveCase(caseId: string): Promise<void> {
  const now = new Date();

  const caseRecord = await db.case.update({
    where: { id: caseId },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
    },
  });

  await db.session.update({
    where: { id: caseRecord.sessionId },
    data: {
      status: "RESOLVED",
      resolvedAt: now,
    },
  });
}

/**
 * Get all cases for SKUs belonging to a brand.
 *
 * Includes session and SKU info. Optionally filters by case status.
 * Results are ordered by creation date descending (newest first).
 */
export async function getCasesForBrand(
  brandId: string,
  params?: { status?: string }
): Promise<Awaited<ReturnType<typeof db.case.findMany>>> {
  // Find all SKU IDs under this brand
  const skus = await db.sKU.findMany({
    where: {
      productLine: {
        brandId,
      },
    },
    select: { id: true },
  });

  const skuIds = skus.map((s) => s.id);

  return db.case.findMany({
    where: {
      skuId: { in: skuIds },
      ...(params?.status ? { status: params.status as "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" } : {}),
    },
    include: {
      session: {
        select: {
          id: true,
          language: true,
          source: true,
          status: true,
          createdAt: true,
        },
      },
      sku: {
        select: {
          id: true,
          sku: true,
          region: true,
          language: true,
          productLine: {
            select: {
              id: true,
              name: true,
              brand: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Send case details to a webhook URL for external integrations.
 *
 * POSTs case context (ID, SKU, category, transcript summary, email)
 * to the provided URL. Marks webhookSent = true on success.
 * Returns true/false without throwing on failure.
 */
export async function sendEscalationWebhook(
  caseId: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const caseRecord = await db.case.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        sku: {
          select: {
            sku: true,
            region: true,
            productLine: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Build a transcript summary (first 500 chars)
    const transcriptSummary =
      caseRecord.transcript.length > 500
        ? caseRecord.transcript.slice(0, 500) + "..."
        : caseRecord.transcript;

    const payload = {
      caseId: caseRecord.id,
      sku: caseRecord.sku.sku,
      productName: caseRecord.sku.productLine.name,
      region: caseRecord.sku.region,
      category: caseRecord.category,
      transcriptSummary,
      customerEmail: caseRecord.email,
      status: caseRecord.status,
      createdAt: caseRecord.createdAt.toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await db.case.update({
        where: { id: caseId },
        data: { webhookSent: true },
      });
      return true;
    }

    console.error(
      `Webhook failed for case ${caseId}: ${response.status} ${response.statusText}`
    );
    return false;
  } catch (error) {
    console.error(`Webhook error for case ${caseId}:`, error);
    return false;
  }
}
