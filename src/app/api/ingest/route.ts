/**
 * POST /api/ingest
 *
 * Ingests a document into a KnowledgePackage for a given SKU.
 * Auto-creates a DRAFT KnowledgePackage if none exists.
 *
 * Request body:
 *   { skuId: string, title: string, content: string, type: DocumentType, sourceUrl?: string }
 *
 * Response:
 *   { documentId: string, chunksCreated: number, packageId: string, packageVersion: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocument, getOrCreateDraftPackage } from "@/lib/ingestion";

const ingestRequestSchema = z.object({
  skuId: z.string().min(1, "skuId is required"),
  title: z.string().min(1, "title is required"),
  content: z.string().min(10, "content must be at least 10 characters"),
  type: z.enum(["MANUAL", "TROUBLESHOOTING_KB", "WARRANTY", "SERVICE_BULLETIN"], {
    errorMap: () => ({
      message:
        "type must be one of: MANUAL, TROUBLESHOOTING_KB, WARRANTY, SERVICE_BULLETIN",
    }),
  }),
  sourceUrl: z.string().url("sourceUrl must be a valid URL").optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = ingestRequestSchema.parse(body);

    // Get or create a DRAFT knowledge package for this SKU
    const { packageId, version } = await getOrCreateDraftPackage(validated.skuId);

    // Ingest the document
    const { documentId, chunksCreated } = await ingestDocument({
      skuId: validated.skuId,
      packageVersion: version,
      title: validated.title,
      content: validated.content,
      type: validated.type,
      sourceUrl: validated.sourceUrl,
    });

    return NextResponse.json({
      documentId,
      chunksCreated,
      packageId,
      packageVersion: version,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Ingestion error:", error);

    const message =
      error instanceof Error ? error.message : "Failed to ingest document";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
