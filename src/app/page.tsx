import { PersonStudioWorkspace } from "@/components/studio/person/PersonStudioWorkspace";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/25 px-5 py-5 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600">
          创作中心 · 人物垂直
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
          历史人物创作
        </h1>
      </div>
      <Suspense
        fallback={
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-500">
            加载人物创作…
          </div>
        }
      >
        <PersonStudioWorkspace />
      </Suspense>
    </div>
  );
}
