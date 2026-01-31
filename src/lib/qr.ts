import QRCode from "qrcode";
import { nanoid } from "./utils";
import { db } from "./db";
import type { QRParameters, QRCodeResult } from "@/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Generate a QR code with SKU-aware deep-link parameters.
 *
 * Creates an 8-character short code, encodes all product parameters,
 * and produces a PNG data URL at 512px with error correction level M.
 */
export async function generateQRCode(params: {
  skuId: string;
  brandId: string;
  productId: string;
  region?: string;
  language?: string;
  firmware?: string;
}): Promise<QRCodeResult> {
  const shortCode = nanoid(8);

  const parameters: QRParameters = {
    brandId: params.brandId,
    productId: params.productId,
    sku: params.skuId,
    region: params.region ?? "US",
    language: params.language ?? "en",
    firmware: params.firmware,
  };

  const scanUrl = `${APP_URL}/voice?code=${shortCode}`;

  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    width: 512,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });

  return {
    shortCode,
    qrDataUrl,
    scanUrl,
    parameters,
  };
}

/**
 * Resolve a QR short code into its full product chain.
 *
 * Looks up the QR code by shortCode, increments scanCount,
 * and returns the full hierarchy: QRCode -> SKU -> ProductLine -> Brand.
 * Returns null if the shortCode does not exist or is inactive.
 */
export async function resolveQRCode(shortCode: string): Promise<{
  qrCode: Awaited<ReturnType<typeof db.qRCode.findUnique>>;
  sku: Awaited<ReturnType<typeof db.sKU.findUnique>>;
  productLine: Awaited<ReturnType<typeof db.productLine.findUnique>>;
  brand: Awaited<ReturnType<typeof db.brand.findUnique>>;
} | null> {
  const qrCode = await db.qRCode.findUnique({
    where: { shortCode },
    include: {
      sku: {
        include: {
          productLine: {
            include: {
              brand: true,
            },
          },
        },
      },
    },
  });

  if (!qrCode || !qrCode.active) {
    return null;
  }

  // Increment scan count
  await db.qRCode.update({
    where: { id: qrCode.id },
    data: { scanCount: { increment: 1 } },
  });

  return {
    qrCode,
    sku: qrCode.sku,
    productLine: qrCode.sku.productLine,
    brand: qrCode.sku.productLine.brand,
  };
}

/**
 * Generate a QR code as an SVG string.
 */
export async function generateQRCodeSVG(scanUrl: string): Promise<string> {
  return QRCode.toString(scanUrl, { type: "svg", margin: 2 });
}
