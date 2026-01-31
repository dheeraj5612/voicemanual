import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSkuAnalytics, getBrandAnalytics, trackEvent } from "@/lib/analytics";

// ─── Validation ──────────────────────────────────────────────────────────────

const trackEventSchema = z.object({
  eventType: z.string().min(1, "eventType is required"),
  sessionId: z.string().min(1, "sessionId is required"),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/analytics
 *
 * Query params:
 *   - brandId (required): Filter analytics by brand
 *   - skuId (optional): Filter by specific SKU (takes priority over brandId)
 *   - from (optional): ISO date string for range start
 *   - to (optional): ISO date string for range end
 *
 * Returns: AnalyticsSummary
 */
export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get("brandId");
    const skuId = request.nextUrl.searchParams.get("skuId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!brandId && !skuId) {
      return NextResponse.json(
        { error: "brandId or skuId query parameter is required" },
        { status: 400 }
      );
    }

    const dateParams = {
      ...(from ? { from: new Date(from) } : {}),
      ...(to ? { to: new Date(to) } : {}),
    };

    // SKU-level analytics take priority if provided
    const summary = skuId
      ? await getSkuAnalytics(skuId, dateParams)
      : await getBrandAnalytics(brandId!, dateParams);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Analytics fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics
 *
 * Record an analytics event from the client.
 *
 * Body:
 *   - eventType (required): string
 *   - sessionId (required): string
 *   - metadata (optional): object
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = trackEventSchema.parse(body);

    await trackEvent({
      sessionId: validated.sessionId,
      eventType: validated.eventType,
      payload: validated.metadata ?? {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Analytics event error:", error);
    return NextResponse.json(
      { error: "Failed to record analytics event" },
      { status: 500 }
    );
  }
}
