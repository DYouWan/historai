"use client";

import Link from "next/link";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight text-amber-100">
            HistorAI
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        自用 MVP · 密钥仅存服务端 · 发布前请复核史实与平台规范
      </footer>
    </div>
  );
}
