import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateQRCode, resolveQRCode } from "@/lib/qr";

// ─── Validation Schemas ──────────────────────────────────────────────────────

const createQRSchema = z.object({
  skuId: z.string().min(1, "skuId is required"),
  brandId: z.string().min(1, "brandId is required"),
  productId: z.string().min(1, "productId is required"),
  region: z.string().optional(),
  language: z.string().optional(),
  firmware: z.string().optional(),
});

// ─── POST: Create a QR code ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createQRSchema.parse(body);

    // Validate SKU exists
    const sku = await db.sKU.findUnique({
      where: { id: validated.skuId },
    });

    if (!sku) {
      return NextResponse.json(
        { error: "SKU not found" },
        { status: 404 }
      );
    }

    // Generate QR code with parameters
    const qr = await generateQRCode({
      skuId: validated.skuId,
      brandId: validated.brandId,
      productId: validated.productId,
      region: validated.region,
      language: validated.language,
      firmware: validated.firmware,
    });

    // Store in database
    await db.qRCode.create({
      data: {
        skuId: validated.skuId,
        shortCode: qr.shortCode,
        parameters: JSON.parse(JSON.stringify(qr.parameters)),
        scanCount: 0,
        active: true,
      },
    });

    return NextResponse.json({
      shortCode: qr.shortCode,
      scanUrl: qr.scanUrl,
      qrDataUrl: qr.qrDataUrl,
      parameters: qr.parameters,
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

// ─── GET: Resolve a QR code by shortCode ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "code query parameter is required" },
        { status: 400 }
      );
    }

    const result = await resolveQRCode(code);

    if (!result) {
      return NextResponse.json(
        { error: "QR code not found or inactive" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      qrCode: result.qrCode,
      sku: result.sku,
      productLine: result.productLine,
      brand: result.brand,
    });
  } catch (error) {
    console.error("QR resolve error:", error);
    return NextResponse.json(
      { error: "Failed to resolve QR code" },
      { status: 500 }
    );
  }
}
