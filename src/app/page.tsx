import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <header className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">VoiceManual</h1>
        <Link
          href="/dashboard"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 transition"
        >
          Dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-blue-400 mb-4">
          AI-Powered Product Support
        </p>
        <h2 className="text-5xl font-bold tracking-tight leading-tight mb-6">
          Your product manual,
          <br />
          but it talks back.
        </h2>
        <p className="text-lg text-slate-300 max-w-xl mx-auto mb-12">
          Upload your manuals. Generate a QR code. Your customers scan it and
          get instant voice-guided help from an AI that knows your product
          inside out.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500 transition"
          >
            Get Started
          </Link>
          <a
            href="#how-it-works"
            className="rounded-lg border border-white/20 px-6 py-3 font-medium hover:bg-white/5 transition"
          >
            How It Works
          </a>
        </div>

        <section id="how-it-works" className="mt-32 text-left">
          <h3 className="text-2xl font-bold mb-8 text-center">How It Works</h3>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="rounded-xl bg-white/5 p-6">
              <div className="text-3xl font-bold text-blue-400 mb-3">1</div>
              <h4 className="font-semibold mb-2">Upload Your Manual</h4>
              <p className="text-sm text-slate-400">
                Upload product manuals, instruction guides, or FAQ documents.
                The AI learns everything about your product.
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-6">
              <div className="text-3xl font-bold text-blue-400 mb-3">2</div>
              <h4 className="font-semibold mb-2">Generate QR Code</h4>
              <p className="text-sm text-slate-400">
                Get a QR code to print on your product packaging, manual, or
                warranty card. Each product gets its own code.
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-6">
              <div className="text-3xl font-bold text-blue-400 mb-3">3</div>
              <h4 className="font-semibold mb-2">Customers Scan &amp; Talk</h4>
              <p className="text-sm text-slate-400">
                Customers scan the QR code and instantly get a voice AI that
                answers their questions. Need a human? It escalates seamlessly.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
