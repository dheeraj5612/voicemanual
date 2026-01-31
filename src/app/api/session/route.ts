import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createSessionSchema = z.object({
  skuId: z.string().min(1, "skuId is required"),
  qrCodeId: z.string().optional(),
  language: z.string().optional(),
  source: z.enum(["QR", "DIRECT"]).optional(),
});

const updateSessionSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  status: z.enum(["ACTIVE", "RESOLVED", "ESCALATED", "ABANDONED"]),
  resolvedAt: z.string().datetime().optional(),
});

// ─── POST: Create a new session ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createSessionSchema.parse(body);

    // Find the SKU with its product chain
    const sku = await db.sKU.findUnique({
      where: { id: validated.skuId },
      include: {
        productLine: {
          include: { brand: true },
        },
      },
    });

    if (!sku) {
      return NextResponse.json(
        { error: "SKU not found" },
        { status: 404 }
      );
    }

    // Find the active KnowledgePackage for this SKU
    const activeKP = await db.knowledgePackage.findFirst({
      where: {
        skuId: validated.skuId,
        status: "ACTIVE",
      },
      orderBy: { version: "desc" },
    });

    const kpVersion = activeKP?.version ?? 0;

    // Create the session
    const session = await db.session.create({
      data: {
        skuId: validated.skuId,
        knowledgePackageVersion: kpVersion,
        language: validated.language ?? sku.language ?? "en",
        source: validated.source ?? "DIRECT",
        qrCodeId: validated.qrCodeId,
        status: "ACTIVE",
      },
    });

    // Track session_start analytics event
    await db.analyticsEvent.create({
      data: {
        sessionId: session.id,
        eventType: "session_start",
        payload: {
          skuId: validated.skuId,
          source: validated.source ?? "DIRECT",
          language: validated.language ?? sku.language ?? "en",
          knowledgePackageVersion: kpVersion,
        },
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      productName: sku.productLine.name,
      brandName: sku.productLine.brand.name,
      sku: sku.sku,
      language: session.language,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Session creation error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

// ─── GET: Get session details ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        sku: {
          include: {
            productLine: {
              include: { brand: true },
            },
          },
        },
        case: true,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Session fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update session status ────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = updateSessionSchema.parse(body);

    const session = await db.session.findUnique({
      where: { id: validated.sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const updateData: {
      status: "ACTIVE" | "RESOLVED" | "ESCALATED" | "ABANDONED";
      resolvedAt?: Date;
    } = {
      status: validated.status,
    };

    // Set resolvedAt if status is RESOLVED
    if (validated.status === "RESOLVED") {
      updateData.resolvedAt = validated.resolvedAt
        ? new Date(validated.resolvedAt)
        : new Date();
    }

    await db.session.update({
      where: { id: validated.sessionId },
      data: updateData,
    });

    // Track analytics based on status change
    if (validated.status === "RESOLVED") {
      await db.analyticsEvent.create({
        data: {
          sessionId: validated.sessionId,
          eventType: "solved",
          payload: {
            resolvedAt: updateData.resolvedAt?.toISOString(),
          },
        },
      });
    } else if (validated.status === "ABANDONED") {
      await db.analyticsEvent.create({
        data: {
          sessionId: validated.sessionId,
          eventType: "not_solved",
          payload: {
            status: "ABANDONED",
            abandonedAt: new Date().toISOString(),
          },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Session update error:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
