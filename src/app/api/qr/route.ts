import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateQRCode } from "@/lib/qr";

const createQRSchema = z.object({
  productId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId } = createQRSchema.parse(body);

    await db.product.findUniqueOrThrow({ where: { id: productId } });

    const qr = await generateQRCode(productId);

    await db.qRCode.create({
      data: {
        productId,
        shortCode: qr.shortCode,
      },
    });

    return NextResponse.json({
      shortCode: qr.shortCode,
      scanUrl: qr.scanUrl,
      qrDataUrl: qr.qrDataUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }
    console.error("QR generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
