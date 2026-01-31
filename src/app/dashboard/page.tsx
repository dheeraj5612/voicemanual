"use client";

import { useState } from "react";

interface Product {
  id: string;
  name: string;
  model: string;
  manualsCount: number;
  qrCode?: string;
}

export default function DashboardPage() {
  const [products] = useState<Product[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">
            VoiceManual Dashboard
          </h1>
          <button
            onClick={() => setShowUploadForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
          >
            + Add Product
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {products.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              No products yet
            </h2>
            <p className="text-slate-500 mb-6">
              Add your first product to generate a voice AI assistant and QR
              code.
            </p>
            <button
              onClick={() => setShowUploadForm(true)}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 transition"
            >
              Add Your First Product
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-xl border bg-white p-6 shadow-sm"
              >
                <h3 className="font-semibold text-slate-900">{product.name}</h3>
                <p className="text-sm text-slate-500 mb-4">{product.model}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    {product.manualsCount} manual(s)
                  </span>
                  <button className="text-blue-600 hover:text-blue-500 font-medium">
                    View QR Code
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showUploadForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                Add a Product
              </h2>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setShowUploadForm(false);
                }}
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Smart Thermostat Pro"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Model Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. STP-2024"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Manual Content
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Paste your manual text here..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowUploadForm(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
                  >
                    Create Product
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
