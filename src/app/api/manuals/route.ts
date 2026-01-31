import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseManualText } from "@/lib/manual-parser";

const uploadManualSchema = z.object({
  productId: z.string(),
  title: z.string().min(1),
  content: z.string().min(10),
  sourceUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, title, content, sourceUrl } =
      uploadManualSchema.parse(body);

    // Verify product exists
    await db.product.findUniqueOrThrow({ where: { id: productId } });

    // Parse manual into chunks
    const chunks = parseManualText(content);

    // Create manual and chunks in a transaction
    const manual = await db.$transaction(async (tx) => {
      const manual = await tx.manual.create({
        data: { productId, title, content, sourceUrl },
      });

      if (chunks.length > 0) {
        await tx.manualChunk.createMany({
          data: chunks.map((chunk) => ({
            manualId: manual.id,
            content: chunk.content,
            section: chunk.section,
            pageNum: chunk.pageNum,
            embedding: "[]", // placeholder — compute real embeddings in production
          })),
        });
      }

      return manual;
    });

    return NextResponse.json({
      id: manual.id,
      title: manual.title,
      chunksCreated: chunks.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Manual upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload manual" },
      { status: 500 }
    );
  }
}
