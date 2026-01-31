/**
 * POST /api/ingest/publish
 *
 * Two actions:
 *
 * 1. Publish a KnowledgePackage (DRAFT -> ACTIVE):
 *    { packageId: string }
 *
 * 2. Rollback a SKU to its previous KnowledgePackage version:
 *    { skuId: string, action: "rollback" }
 *
 * Response:
 *   { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  publishKnowledgePackage,
  rollbackKnowledgePackage,
} from "@/lib/ingestion";

const publishSchema = z.object({
  packageId: z.string().min(1, "packageId is required"),
});

const rollbackSchema = z.object({
  skuId: z.string().min(1, "skuId is required"),
  action: z.literal("rollback"),
});

const requestSchema = z.union([publishSchema, rollbackSchema]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = requestSchema.parse(body);

    // Determine which action to take
    if ("action" in validated && validated.action === "rollback") {
      await rollbackKnowledgePackage(validated.skuId);
      return NextResponse.json({ success: true });
    }

    if ("packageId" in validated) {
      await publishKnowledgePackage(validated.packageId);
      return NextResponse.json({ success: true });
    }

    // This should never be reached due to Zod validation, but just in case
    return NextResponse.json(
      { error: "Invalid request: must provide packageId or { skuId, action: 'rollback' }" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Publish/rollback error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to process request";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
