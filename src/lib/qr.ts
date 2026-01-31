import QRCode from "qrcode";
import { nanoid } from "./utils";
import type { QRCodeResult } from "@/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function generateQRCode(
  productId: string,
  shortCode?: string
): Promise<QRCodeResult> {
  const code = shortCode || nanoid(8);
  const scanUrl = `${APP_URL}/voice?code=${code}`;

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
    shortCode: code,
    qrDataUrl,
    scanUrl,
  };
}

export async function generateQRCodeSVG(scanUrl: string): Promise<string> {
  return QRCode.toString(scanUrl, { type: "svg", margin: 2 });
}
