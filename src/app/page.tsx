import { PersonStudioWorkspace } from "@/components/studio/person/PersonStudioWorkspace";
import { Suspense } from "react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl">
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
