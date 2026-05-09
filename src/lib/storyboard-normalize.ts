import type { LlmProfileRow } from "@/lib/llm-profiles";
import { mergeHookIntoFirstSceneNarration } from "@/lib/merge-hook-narration";
import type { GenerationResult, StoryboardScene } from "@/lib/types";

export type RawStoryboardGeneration = {
  hook?: string;
  timeline?: Array<{ label?: string; text?: string; sources?: string[] }>;
  scenes?: Array<{
    index?: number;
    visualDescription?: string;
    narration?: string;
    durationSec?: number;
  }>;
  factNotes?: string[];
  complianceNote?: string | null;
};

/** 与当前成片时长预设的 softMin 对齐；模型总时长偏短时按镜轮询补足。 */
export function boostSceneDurationsIfShort(
  scenes: StoryboardScene[],
  softMinTotalSec: number,
): StoryboardScene[] {
  if (!scenes.length) return scenes;
  const out = scenes.map((s) => ({ ...s }));
  let total = out.reduce((a, s) => a + s.durationSec, 0);
  let guard = 0;
  while (total < softMinTotalSec && guard < 400) {
    const i = guard % out.length;
    guard++;
    if (out[i].durationSec >= 60) {
      if (out.every((s) => s.durationSec >= 60)) break;
      continue;
    }
    out[i] = { ...out[i], durationSec: out[i].durationSec + 1 };
    total += 1;
  }
  return out;
}

export function normalizeStoryboardRaw(
  raw: RawStoryboardGeneration,
  profile: LlmProfileRow,
  softMinTotalSec: number,
): GenerationResult {
  const timeline =
    raw.timeline?.map((t) => ({
      label: t.label,
      text: String(t.text ?? "").trim(),
      sources: (t.sources ?? []).map(String).filter(Boolean),
    })) ?? [];

  const scenesRaw =
    raw.scenes?.map((s, i) => ({
      index: typeof s.index === "number" ? s.index : i + 1,
      visualDescription: String(s.visualDescription ?? "").trim(),
      narration: String(s.narration ?? "").trim(),
      durationSec: Math.min(
        60,
        Math.max(2, Number(s.durationSec ?? 6)),
      ),
    })) ?? [];

  const hookStr = String(raw.hook ?? "").trim();
  const withHook = mergeHookIntoFirstSceneNarration(hookStr, scenesRaw);
  const scenes = boostSceneDurationsIfShort(withHook, softMinTotalSec);

  return {
    provider: "llm",
    llmProfile: {
      id: profile.id,
      vendor: profile.vendor,
      label: profile.label,
      model: profile.model,
    },
    hook: hookStr,
    timeline,
    scenes,
    factNotes: (raw.factNotes ?? []).map(String),
    complianceNote:
      raw.complianceNote === null || raw.complianceNote === undefined
        ? undefined
        : String(raw.complianceNote),
  };
}
