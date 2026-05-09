"use client";

import type { LlmMessagesDebug } from "@/lib/types";
import { useCallback, useState } from "react";

const preClass =
  "max-h-[min(24rem,50vh)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/90 bg-zinc-950/90 p-3 font-mono text-[11px] leading-relaxed text-zinc-300";

export function LlmDebugCollapsible({
  title,
  debug,
}: {
  title: string;
  debug: LlmMessagesDebug | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("失败");
      window.setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  if (!debug) return null;

  const assistantBlock = debug.assistantRaw
    ? `\n\n--- assistant（模型原始返回）---\n${debug.assistantRaw}`
    : "";
  const both = `--- system ---\n${debug.system}\n\n--- user ---\n${debug.user}${assistantBlock}`;

  return (
    <details className="group rounded-xl border border-zinc-800/80 bg-zinc-950/30">
      <summary className="cursor-pointer list-none px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-zinc-300">{title}</span>
          <span className="text-[11px] text-zinc-600 group-open:text-amber-200/60">
            展开查看 system / user / 模型原始返回
          </span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-zinc-800/60 px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-400">
            {debug.model}
          </span>
          <span>temperature {debug.temperature}</span>
          <span>
            JSON mode: {debug.usesJsonResponseFormat ? "on" : "off"}
          </span>
          {debug.storyboardStrategy ? (
            <span className="max-w-[min(100%,28rem)] text-amber-200/80">
              策略：{debug.storyboardStrategy}
            </span>
          ) : null}
          <span className="rounded bg-emerald-950/40 px-1.5 py-0.5 text-emerald-200/80">
            已请求远端
          </span>
        </div>
        <p className="break-all font-mono text-[10px] text-zinc-600">
          POST {debug.chatCompletionsUrl}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copy("user", debug.user)}
            className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
          >
            {copied === "user" ? "已复制 user" : "复制 user"}
          </button>
          <button
            type="button"
            onClick={() => copy("system", debug.system)}
            className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
          >
            {copied === "system" ? "已复制 system" : "复制 system"}
          </button>
          {debug.assistantRaw ? (
            <button
              type="button"
              onClick={() =>
                copy("assistant", debug.assistantRaw ?? "")
              }
              className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
            >
              {copied === "assistant" ? "已复制模型返回" : "复制模型返回"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => copy("all", both)}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-900"
          >
            {copied === "all" ? "已复制合并" : "复制 system+user+返回"}
          </button>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/50">
            system
          </p>
          <pre className={preClass}>{debug.system}</pre>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/50">
            user（组装后的主提示）
          </p>
          <pre className={preClass}>{debug.user}</pre>
        </div>
        {debug.phases && debug.phases.length > 0 ? (
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/50">
              多阶段请求（脊柱 / 分镜扩写）
            </p>
            {debug.phases.map((ph) => (
              <details
                key={ph.phase}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/40"
              >
                <summary className="cursor-pointer px-3 py-2 text-[11px] text-zinc-400 hover:text-zinc-200">
                  {ph.phase}
                  {ph.maxTokens != null ? (
                    <span className="ml-2 font-mono text-zinc-500">
                      max_tokens={ph.maxTokens}
                    </span>
                  ) : null}
                </summary>
                <div className="space-y-2 border-t border-zinc-800/60 px-3 pb-3 pt-2">
                  <pre className={preClass}>{ph.system}</pre>
                  <pre className={preClass}>{ph.user}</pre>
                  {ph.assistantRaw ? (
                    <pre className={preClass}>{ph.assistantRaw}</pre>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : null}
        {debug.assistantRaw ? (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/50">
              assistant
              {debug.phases?.length ?
                "（合并：各阶段原始返回）"
              : "（模型原始返回，便于跨模型对比）"}
            </p>
            <pre className={preClass}>{debug.assistantRaw}</pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
