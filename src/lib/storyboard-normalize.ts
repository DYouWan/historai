import type { LlmProfileRow } from "@/lib/llm-profiles";
import type {
  GenerationResult,
  ReviewChecklist,
  SceneSkeletonEntry,
  StoryArc,
  StoryboardPipelinePending,
  StoryboardScene,
} from "@/lib/types";

export type RawStoryboardGeneration = {
  storyArc: StoryArc;
  reviewChecklist: ReviewChecklist;
  scenes?: Array<{
    index?: number;
    visualDescription?: string;
    narration?: string;
    durationSec?: number;
  }>;
  voiceoverFullText?: string;
  voiceoverParagraphs?: string[];
  sceneSkeleton?: SceneSkeletonEntry[];
  pipelinePending?: StoryboardPipelinePending;
};

/** 与当前叙事时长预设的 softMin 对齐；模型总时长偏短时按镜轮询补足。 */
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

  const scenes = boostSceneDurationsIfShort(scenesRaw, softMinTotalSec);

  let pipelinePending: StoryboardPipelinePending | undefined =
    raw.pipelinePending === "voiceover" || raw.pipelinePending === "scenes" ?
      raw.pipelinePending
    : undefined;
  if (scenes.length > 0) {
    pipelinePending = undefined;
  }

  const skRaw = raw.sceneSkeleton ?? [];
  const sceneSkeleton: SceneSkeletonEntry[] = skRaw.map((r, i) => ({
    index: typeof r.index === "number" ? r.index : i + 1,
    beat: String(r.beat ?? "").trim(),
    durationSec: Math.min(60, Math.max(2, Number(r.durationSec ?? 6))),
  }));

  const voiceoverParagraphs = (raw.voiceoverParagraphs ?? []).map((p) =>
    String(p ?? "").trim(),
  );
  const voiceoverFullText = String(raw.voiceoverFullText ?? "").trim();

  return {
    provider: "llm",
    llmProfile: {
      id: profile.id,
      vendor: profile.vendor,
      label: profile.label,
      model: profile.model,
    },
    storyArc: raw.storyArc,
    scenes,
    reviewChecklist: raw.reviewChecklist,
    voiceoverFullText:
      voiceoverFullText ||
      (voiceoverParagraphs.length ? voiceoverParagraphs.join("\n\n") : ""),
    voiceoverParagraphs,
    sceneSkeleton,
    pipelinePending,
  };
}
