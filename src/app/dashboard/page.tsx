"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Package,
  FileText,
  QrCode,
  AlertTriangle,
  BarChart3,
  Plus,
  ChevronDown,
  ChevronRight,
  X,
  Loader2,
  Download,
  Check,
  Upload,
  Search,
  Filter,
} from "lucide-react";
import type { AnalyticsSummary } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type DashboardSection =
  | "products"
  | "documents"
  | "qrcodes"
  | "escalations"
  | "analytics";

interface ProductLine {
  id: string;
  name: string;
  description?: string;
  skus: SKUItem[];
}

interface SKUItem {
  id: string;
  sku: string;
  region: string;
  language: string;
  active: boolean;
  _count?: {
    knowledgePackages: number;
    qrCodes: number;
  };
}

interface DocumentItem {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  knowledgePackage: {
    id: string;
    version: number;
    status: string;
    sku: { sku: string };
    _count?: { documents: number };
  };
  _count?: { chunks: number };
}

interface QRCodeItem {
  id: string;
  shortCode: string;
  scanCount: number;
  active: boolean;
  createdAt: string;
  sku: { id: string; sku: string };
}

interface EscalationItem {
  id: string;
  category?: string;
  email?: string;
  status: string;
  description?: string;
  transcript: string;
  createdAt: string;
  sku: {
    sku: string;
    productLine: { name: string };
  };
}

// ─── Sidebar nav items ──────────────────────────────────────────────────────

const NAV_ITEMS: { key: DashboardSection; label: string; icon: typeof Package }[] = [
  { key: "products", label: "Products & SKUs", icon: Package },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "qrcodes", label: "QR Codes", icon: QrCode },
  { key: "escalations", label: "Escalations", icon: AlertTriangle },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("products");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // For demo, use a placeholder brandId
  const brandId = "demo-brand";

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
          <Link href="/" className="text-lg font-bold tracking-tight">
            VoiceManual
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setActiveSection(item.key);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <p className="text-xs text-slate-500">Dashboard v1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-slate-900">
              {NAV_ITEMS.find((n) => n.key === activeSection)?.label}
            </h1>
          </div>
        </header>

        {/* Content area */}
        <main className="p-6">
          {activeSection === "products" && <ProductsSection brandId={brandId} />}
          {activeSection === "documents" && <DocumentsSection brandId={brandId} />}
          {activeSection === "qrcodes" && <QRCodesSection brandId={brandId} />}
          {activeSection === "escalations" && <EscalationsSection brandId={brandId} />}
          {activeSection === "analytics" && <AnalyticsSection brandId={brandId} />}
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Products & SKUs Section
// ═══════════════════════════════════════════════════════════════════════════════

function ProductsSection({ brandId }: { brandId: string }) {
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddSKU, setShowAddSKU] = useState(false);

  // Form state
  const [newProductName, setNewProductName] = useState("");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [newSKUCode, setNewSKUCode] = useState("");
  const [newSKURegion, setNewSKURegion] = useState("US");
  const [newSKULanguage, setNewSKULanguage] = useState("en");
  const [selectedProductLine, setSelectedProductLine] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/products?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setProductLines(data.productLines || []);
      }
    } catch {
      // Silently handle — products endpoint may not exist yet
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function toggleLine(id: string) {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div>
      {/* Actions bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setShowAddProduct(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          <Plus className="w-4 h-4" />
          Add Product Line
        </button>
        <button
          onClick={() => setShowAddSKU(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <Plus className="w-4 h-4" />
          Add SKU
        </button>
      </div>

      {/* Product lines list */}
      {productLines.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add your first product line and SKU to get started."
          action="Add Product Line"
          onAction={() => setShowAddProduct(true)}
        />
      ) : (
        <div className="space-y-3">
          {productLines.map((line) => (
            <div
              key={line.id}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
            >
              <button
                onClick={() => toggleLine(line.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-slate-900">{line.name}</h3>
                  {line.description && (
                    <p className="text-sm text-slate-500 mt-0.5">
                      {line.description}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {line.skus.length} SKU(s)
                  </p>
                </div>
                {expandedLines.has(line.id) ? (
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                )}
              </button>

              {expandedLines.has(line.id) && line.skus.length > 0 && (
                <div className="border-t border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                        <th className="px-5 py-2.5">SKU Code</th>
                        <th className="px-5 py-2.5">Region</th>
                        <th className="px-5 py-2.5">Language</th>
                        <th className="px-5 py-2.5">Status</th>
                        <th className="px-5 py-2.5">Docs</th>
                        <th className="px-5 py-2.5">QR Codes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {line.skus.map((sku) => (
                        <tr key={sku.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-800">
                            {sku.sku}
                          </td>
                          <td className="px-5 py-3 text-slate-600">{sku.region}</td>
                          <td className="px-5 py-3 text-slate-600 uppercase">
                            {sku.language}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                sku.active
                                  ? "bg-green-50 text-green-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {sku.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {sku._count?.knowledgePackages || 0}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {sku._count?.qrCodes || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Product Line Modal */}
      {showAddProduct && (
        <Modal onClose={() => setShowAddProduct(false)} title="Add Product Line">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // TODO: POST to /api/products
              setShowAddProduct(false);
              setNewProductName("");
              setNewProductDesc("");
            }}
            className="space-y-4"
          >
            <FormField label="Product Line Name" required>
              <input
                type="text"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. Smart Thermostat Pro Series"
                className="input-field"
                required
              />
            </FormField>
            <FormField label="Description">
              <textarea
                value={newProductDesc}
                onChange={(e) => setNewProductDesc(e.target.value)}
                placeholder="Brief description of this product line..."
                rows={3}
                className="input-field resize-none"
              />
            </FormField>
            <ModalActions
              onCancel={() => setShowAddProduct(false)}
              submitLabel="Create Product Line"
            />
          </form>
        </Modal>
      )}

      {/* Add SKU Modal */}
      {showAddSKU && (
        <Modal onClose={() => setShowAddSKU(false)} title="Add SKU">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // TODO: POST to /api/skus
              setShowAddSKU(false);
              setNewSKUCode("");
            }}
            className="space-y-4"
          >
            <FormField label="Product Line" required>
              <select
                value={selectedProductLine}
                onChange={(e) => setSelectedProductLine(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Select product line...</option>
                {productLines.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="SKU Code" required>
              <input
                type="text"
                value={newSKUCode}
                onChange={(e) => setNewSKUCode(e.target.value)}
                placeholder="e.g. STP-2024-US"
                className="input-field font-mono"
                required
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Region">
                <select
                  value={newSKURegion}
                  onChange={(e) => setNewSKURegion(e.target.value)}
                  className="input-field"
                >
                  <option value="US">US</option>
                  <option value="EU">EU</option>
                  <option value="UK">UK</option>
                  <option value="JP">JP</option>
                  <option value="GLOBAL">Global</option>
                </select>
              </FormField>
              <FormField label="Language">
                <select
                  value={newSKULanguage}
                  onChange={(e) => setNewSKULanguage(e.target.value)}
                  className="input-field"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                </select>
              </FormField>
            </div>
            <ModalActions
              onCancel={() => setShowAddSKU(false)}
              submitLabel="Create SKU"
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Documents Section
// ═══════════════════════════════════════════════════════════════════════════════

function DocumentsSection({ brandId }: { brandId: string }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [uploadSKU, setUploadSKU] = useState("");
  const [uploadType, setUploadType] = useState("MANUAL");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: uploadSKU,
          title: uploadTitle,
          content: uploadContent,
          type: uploadType,
        }),
      });

      if (res.ok) {
        setShowUpload(false);
        setUploadTitle("");
        setUploadContent("");
        loadDocuments();
      }
    } catch {
      // Handle error
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-slate-500">
          {documents.length} document(s) across all knowledge packages
        </p>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload product manuals, troubleshooting guides, and warranty docs."
          action="Upload Document"
          onAction={() => setShowUpload(true)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Chunks</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">{doc.title}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {doc.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {doc.knowledgePackage?.sku?.sku || "N/A"}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    v{doc.knowledgePackage?.version || 1}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={doc.knowledgePackage?.status || "DRAFT"} />
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {doc._count?.chunks || 0}
                  </td>
                  <td className="px-5 py-3">
                    {doc.knowledgePackage?.status === "DRAFT" && (
                      <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                        Publish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <Modal onClose={() => setShowUpload(false)} title="Upload Document">
          <form onSubmit={handleUpload} className="space-y-4">
            <FormField label="SKU" required>
              <input
                type="text"
                value={uploadSKU}
                onChange={(e) => setUploadSKU(e.target.value)}
                placeholder="Enter SKU ID"
                className="input-field font-mono"
                required
              />
            </FormField>
            <FormField label="Document Type" required>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value)}
                className="input-field"
              >
                <option value="MANUAL">Manual</option>
                <option value="TROUBLESHOOTING_KB">Troubleshooting KB</option>
                <option value="WARRANTY">Warranty</option>
                <option value="SERVICE_BULLETIN">Service Bulletin</option>
              </select>
            </FormField>
            <FormField label="Title" required>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Installation Guide v3.2"
                className="input-field"
                required
              />
            </FormField>
            <FormField label="Content" required>
              <textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="Paste the full manual text here..."
                rows={8}
                className="input-field resize-none"
                required
              />
            </FormField>
            <ModalActions
              onCancel={() => setShowUpload(false)}
              submitLabel={uploading ? "Uploading..." : "Upload & Ingest"}
              loading={uploading}
            />
          </form>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QR Codes Section
// ═══════════════════════════════════════════════════════════════════════════════

function QRCodesSection({ brandId }: { brandId: string }) {
  const [qrCodes, setQRCodes] = useState<QRCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);

  // Generate form
  const [genSKU, setGenSKU] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<{
    shortCode: string;
    scanUrl: string;
    qrDataUrl: string;
  } | null>(null);

  const loadQRCodes = useCallback(async () => {
    try {
      const res = await fetch(`/api/qrcodes?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setQRCodes(data.qrCodes || []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    loadQRCodes();
  }, [loadQRCodes]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);

    try {
      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: genSKU,
          brandId,
          productId: genSKU, // simplified
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedQR(data);
        loadQRCodes();
      }
    } catch {
      // Handle error
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-slate-500">
          {qrCodes.length} QR code(s) generated
        </p>
        <button
          onClick={() => {
            setShowGenerate(true);
            setGeneratedQR(null);
          }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          <Plus className="w-4 h-4" />
          Generate QR Code
        </button>
      </div>

      {qrCodes.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No QR codes yet"
          description="Generate a QR code for a SKU to let customers scan and get help."
          action="Generate QR Code"
          onAction={() => setShowGenerate(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map((qr) => (
            <div
              key={qr.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-sm font-bold text-slate-800">
                  {qr.shortCode}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    qr.active
                      ? "bg-green-50 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {qr.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                SKU: <span className="font-mono">{qr.sku.sku}</span>
              </p>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{qr.scanCount} scan(s)</span>
                <button className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
                  <Download className="w-3 h-3" />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate QR Modal */}
      {showGenerate && (
        <Modal
          onClose={() => {
            setShowGenerate(false);
            setGeneratedQR(null);
          }}
          title="Generate QR Code"
        >
          {!generatedQR ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <FormField label="SKU ID" required>
                <input
                  type="text"
                  value={genSKU}
                  onChange={(e) => setGenSKU(e.target.value)}
                  placeholder="Enter SKU ID"
                  className="input-field font-mono"
                  required
                />
              </FormField>
              <ModalActions
                onCancel={() => setShowGenerate(false)}
                submitLabel={generating ? "Generating..." : "Generate"}
                loading={generating}
              />
            </form>
          ) : (
            <div className="text-center space-y-4">
              {/* QR code image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={generatedQR.qrDataUrl}
                alt="Generated QR Code"
                className="w-48 h-48 mx-auto rounded-lg border border-slate-200"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Code: {generatedQR.shortCode}
                </p>
                <p className="text-xs text-slate-500 mt-1 break-all">
                  {generatedQR.scanUrl}
                </p>
              </div>
              <a
                href={generatedQR.qrDataUrl}
                download={`qr-${generatedQR.shortCode}.png`}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
              >
                <Download className="w-4 h-4" />
                Download PNG
              </a>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Escalations Section
// ═══════════════════════════════════════════════════════════════════════════════

function EscalationsSection({ brandId }: { brandId: string }) {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadEscalations = useCallback(async () => {
    try {
      const res = await fetch(`/api/escalation?brandId=${brandId}`);
      if (res.ok) {
        const data = await res.json();
        setEscalations(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    loadEscalations();
  }, [loadEscalations]);

  async function resolveCase(caseId: string) {
    setResolvingId(caseId);
    try {
      const res = await fetch("/api/escalation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      if (res.ok) {
        loadEscalations();
      }
    } catch {
      // Handle error
    } finally {
      setResolvingId(null);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      {escalations.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No open escalations"
          description="When customers need human help, their cases will appear here."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3">SKU</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Customer Email</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {escalations.map((esc) => (
                <>
                  <tr
                    key={esc.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() =>
                      setExpandedCase(expandedCase === esc.id ? null : esc.id)
                    }
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">
                      {esc.sku?.sku || "N/A"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {esc.category || "General"}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {esc.email || "N/A"}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {new Date(esc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={esc.status} />
                    </td>
                    <td className="px-5 py-3">
                      {esc.status !== "RESOLVED" && esc.status !== "CLOSED" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveCase(esc.id);
                          }}
                          disabled={resolvingId === esc.id}
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
                        >
                          {resolvingId === esc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedCase === esc.id && (
                    <tr key={`${esc.id}-detail`}>
                      <td colSpan={6} className="px-5 py-4 bg-slate-50">
                        <div className="space-y-2">
                          {esc.description && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-1">
                                Description
                              </p>
                              <p className="text-sm text-slate-700">
                                {esc.description}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1">
                              Transcript
                            </p>
                            <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white rounded-lg border border-slate-200 p-3 max-h-48 overflow-y-auto">
                              {esc.transcript || "No transcript available."}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Analytics Section
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsSection({ brandId }: { brandId: string }) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [skuFilter, setSkuFilter] = useState("");

  const loadAnalytics = useCallback(async () => {
    try {
      const params = new URLSearchParams({ brandId });
      if (skuFilter) params.set("skuId", skuFilter);

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [brandId, skuFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) return <LoadingState />;

  if (!analytics) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No analytics data yet"
        description="Analytics will appear here once customers start interacting with your products."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* SKU Filter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
            placeholder="Filter by SKU ID..."
            className="text-sm text-slate-900 placeholder:text-slate-400 border-0 focus:outline-none bg-transparent w-48"
          />
          {skuFilter && (
            <button
              onClick={() => setSkuFilter("")}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Scans"
          value={analytics.totalScans.toLocaleString()}
          color="blue"
        />
        <MetricCard
          label="Sessions"
          value={analytics.totalSessions.toLocaleString()}
          color="indigo"
        />
        <MetricCard
          label="Resolution Rate"
          value={`${Math.round(analytics.resolutionRate * 100)}%`}
          color="green"
        />
        <MetricCard
          label="Escalation Rate"
          value={`${Math.round(analytics.escalationRate * 100)}%`}
          color="amber"
        />
      </div>

      {/* Two-column layout for lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Intents */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            Top Intents
          </h3>
          {analytics.topIntents.length === 0 ? (
            <p className="text-sm text-slate-500">No intent data yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.topIntents.map((intent, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 truncate mr-4">
                    {intent.intent}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (intent.count /
                              Math.max(
                                ...analytics.topIntents.map((i) => i.count),
                                1
                              )) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-500 w-8 text-right">
                      {intent.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unresolved Questions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Unresolved Questions
          </h3>
          {analytics.unresolvedQuestions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No unresolved questions yet.
            </p>
          ) : (
            <div className="space-y-3">
              {analytics.unresolvedQuestions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"
                >
                  <span className="text-sm text-amber-800 truncate mr-4">
                    {q.question}
                  </span>
                  <span className="text-xs font-medium text-amber-600 shrink-0">
                    {q.count}x
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Additional stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Avg. Response Time
          </p>
          <p className="text-2xl font-bold text-slate-900">
            {analytics.avgResponseTime.toFixed(1)}s
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            Call Deflection Estimate
          </p>
          <p className="text-2xl font-bold text-slate-900">
            {Math.round(analytics.deflectionEstimate * 100)}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared UI Components
// ═══════════════════════════════════════════════════════════════════════════════

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: typeof Package;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <h2 className="text-base font-semibold text-slate-800 mb-1">{title}</h2>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
        {description}
      </p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition"
        >
          <Plus className="w-4 h-4" />
          {action}
        </button>
      )}
    </div>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  submitLabel,
  loading,
}: {
  onCancel: () => void;
  submitLabel: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-600",
    ACTIVE: "bg-green-50 text-green-700",
    ARCHIVED: "bg-slate-100 text-slate-500",
    OPEN: "bg-amber-50 text-amber-700",
    ASSIGNED: "bg-blue-50 text-blue-700",
    IN_PROGRESS: "bg-blue-50 text-blue-700",
    RESOLVED: "bg-green-50 text-green-700",
    CLOSED: "bg-slate-100 text-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        config[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "blue" | "indigo" | "green" | "amber";
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-100",
    indigo: "bg-indigo-50 border-indigo-100",
    green: "bg-green-50 border-green-100",
    amber: "bg-amber-50 border-amber-100",
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
