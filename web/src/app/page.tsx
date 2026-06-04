import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b1015] text-white">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Eyebrow */}
        <div className="inline-block text-xs uppercase tracking-wider text-teal-400 bg-teal-400/10 border border-teal-400/30 rounded-full px-3 py-1 mb-6">
          Built by Mickey 💪
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
          Don&apos;t lose the muscle{" "}
          <span className="text-teal-400">with the fat.</span>
        </h1>

        {/* Subhead */}
        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mb-10">
          You paid for the shot — now get your money&apos;s worth. Fitness AP
          helps you preserve and build muscle while the drug does the fat loss.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 mb-16">
          <Link
            href="/onboarding"
            className="bg-teal-400 text-slate-900 font-bold px-6 py-3 rounded-lg hover:bg-teal-300 transition"
          >
            Get started
          </Link>
          <Link
            href="/log"
            className="border border-slate-600 text-slate-200 font-medium px-6 py-3 rounded-lg hover:border-slate-400 transition"
          >
            Try the chat logger →
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-teal-400 text-3xl font-bold tracking-tight">
              25–40%
            </div>
            <div className="text-sm text-slate-400 mt-2">
              of GLP weight loss is lean mass — unless you train for it
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-teal-400 text-3xl font-bold tracking-tight">
              2–4×/wk
            </div>
            <div className="text-sm text-slate-400 mt-2">
              low-volume workouts designed for the drug&apos;s reality
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="text-teal-400 text-3xl font-bold tracking-tight">
              1.2g/lb
            </div>
            <div className="text-sm text-slate-400 mt-2">
              protein target calibrated to your goal physique
            </div>
          </div>
        </div>

        {/* Dev hint */}
        <div className="mt-20 p-4 border border-slate-800 rounded-lg bg-slate-900/50">
          <p className="text-xs text-slate-500">
            🛠️ You&apos;re looking at the starter page for the dev server. Edit{" "}
            <code className="bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded">
              src/app/page.tsx
            </code>{" "}
            and save — the page reloads instantly.
          </p>
        </div>
      </div>
    </main>
  );
}
