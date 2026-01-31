import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCase, resolveCase, getCasesForBrand } from "@/lib/escalation";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createCaseSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
  email: z.string().email().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  photoUrls: z.array(z.string().url()).optional(),
});

const resolveCaseSchema = z.object({
  caseId: z.string().min(1, "caseId is required"),
});

// ─── POST: Create a case ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createCaseSchema.parse(body);

    const result = await createCase(validated);

    return NextResponse.json({
      caseId: result.caseId,
      agentAssigned: result.agentAssigned,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Case creation error:", error);
    return NextResponse.json(
      { error: "Failed to create case" },
      { status: 500 }
    );
  }
}

// ─── GET: List cases for a brand ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get("brandId");
    const status = request.nextUrl.searchParams.get("status");

    if (!brandId) {
      return NextResponse.json(
        { error: "brandId query parameter is required" },
        { status: 400 }
      );
    }

    const cases = await getCasesForBrand(brandId, {
      ...(status ? { status } : {}),
    });

    return NextResponse.json(cases);
  } catch (error) {
    console.error("Case listing error:", error);
    return NextResponse.json(
      { error: "Failed to list cases" },
      { status: 500 }
    );
  }
}

// ─── PATCH: Resolve a case ───────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId } = resolveCaseSchema.parse(body);

    await resolveCase(caseId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Case resolve error:", error);
    return NextResponse.json(
      { error: "Failed to resolve case" },
      { status: 500 }
    );
  }
}
