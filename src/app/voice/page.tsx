"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Globe,
  Mic,
  ArrowRight,
  QrCode,
} from "lucide-react";

interface QRResolveResult {
  qrCode: {
    id: string;
    shortCode: string;
    scanCount: number;
  };
  sku: {
    id: string;
    sku: string;
    region: string;
    language: string;
  };
  productLine: {
    id: string;
    name: string;
  };
  brand: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "pt", label: "Portugues" },
];

export default function VoiceStartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <VoiceStartContent />
    </Suspense>
  );
}

function VoiceStartContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");

  const [product, setProduct] = useState<QRResolveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [starting, setStarting] = useState(false);

  const resolveQR = useCallback(async () => {
    if (!code) {
      setError("No QR code provided. Please scan a QR code to get started.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/qr?code=${encodeURIComponent(code)}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError(
            "This QR code is not recognized. Please scan again or contact support."
          );
        } else {
          setError("Failed to load product information. Please try again.");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      setProduct(data);
      setLanguage(data.sku?.language || "en");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    resolveQR();
  }, [resolveQR]);

  async function handleStart() {
    if (!product) return;
    setStarting(true);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: product.sku.id,
          qrCodeId: product.qrCode?.id,
          language,
          source: "QR",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      const data = await response.json();
      router.push(`/voice/${data.sessionId}`);
    } catch {
      setError("Failed to start session. Please try again.");
      setStarting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading product information...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            QR Code Not Recognized
          </h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition"
          >
            <QrCode className="w-4 h-4" />
            Scan Again
          </a>
        </div>
      </div>
    );
  }

  // Product found — session start screen
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Brand logo area */}
        {product?.brand.logoUrl ? (
          <div className="flex justify-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.brand.logoUrl}
              alt={product.brand.name}
              className="h-10 object-contain"
            />
          </div>
        ) : (
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <Mic className="w-6 h-6 text-white" />
            </div>
          </div>
        )}

        {/* Product info card */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-blue-400 mb-2">
            You&apos;re asking about
          </p>
          <h1 className="text-xl font-bold text-white mb-1">
            {product?.brand.name} {product?.productLine.name}
          </h1>
          <p className="text-sm text-slate-400">
            SKU: {product?.sku.sku} &middot; {product?.sku.region}
          </p>
        </div>

        {/* Language selector */}
        <div className="mb-6">
          <label
            htmlFor="language-select"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2"
          >
            <Globe className="w-3.5 h-3.5" />
            Language
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none appearance-none"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-slate-800">
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {starting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Start Voice Assistant
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Error from start */}
        {error && product && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
            <p className="text-xs text-red-400 text-center">{error}</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          Powered by VoiceManual AI
        </p>
      </div>
    </div>
  );
}
