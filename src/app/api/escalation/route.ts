import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveEscalation } from "@/lib/escalation";
import { db } from "@/lib/db";

const resolveSchema = z.object({
  escalationId: z.string(),
});

/** List pending escalations for an organization */
export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("organizationId");
  if (!orgId) {
    return NextResponse.json(
      { error: "organizationId query param required" },
      { status: 400 }
    );
  }

  const escalations = await db.escalation.findMany({
    where: {
      status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
      session: { product: { organizationId: orgId } },
    },
    include: {
      session: {
        include: {
          product: { select: { name: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
      agent: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(escalations);
}

/** Resolve an escalation */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { escalationId } = resolveSchema.parse(body);

    await resolveEscalation(escalationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Escalation resolve error:", error);
    return NextResponse.json(
      { error: "Failed to resolve escalation" },
      { status: 500 }
    );
  }
}
