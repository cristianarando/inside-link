import Link from "next/link";
import { ArrowLeft, Compass, Link2Off } from "lucide-react";
import { env, getCanonicalHost } from "@/lib/env";

export default function NotFoundPage() {
  const portfolioUrl = env.NEXT_PUBLIC_PORTFOLIO_URL.replace(/\/+$/, "");
  const canonicalHost = getCanonicalHost();

  return (
    <main className="bg-obsidian-glow flex min-h-screen flex-col items-center justify-center px-4 text-center text-zinc-100">
      <div className="obsidian-surface-elevated w-full max-w-md rounded-2xl border border-zinc-800/90 p-8 backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
          <Link2Off className="h-6 w-6" />
        </div>

        <p className="mt-5 font-mono text-xs uppercase tracking-widest text-zinc-500">
          Error 404 · Link Not Found
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          This short link does not exist
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The route you tried to open is not registered on{" "}
          <span className="font-mono font-medium text-zinc-200">
            {canonicalHost}
          </span>{" "}
          or has been removed.
        </p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <Compass className="h-4 w-4" />
            Browse public links
          </Link>
          <a
            href={portfolioUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-[#16161b] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to portfolio
          </a>
        </div>
      </div>
    </main>
  );
}
