import type { LlmProfileRow } from "@/lib/llm-profiles";
import type { VideoDurationMin } from "@/lib/types";
import { getVideoDurationPreset } from "@/lib/video-duration";

export type StoryboardChunkMode = "auto" | "on";

export function parseStoryboardChunkMode(v: unknown): StoryboardChunkMode {
  if (v === "on" || v === "auto") return v;
  /** 历史清单曾存 off；移除 UI 选项后统一按自动策略处理 */
  if (v === "off") return "auto";
  return "auto";
}

/** 单次整包生成时各档默认 max_tokens（可被档案覆盖） */
export const DEFAULT_SINGLE_SHOT_MAX_TOKENS: Record<VideoDurationMin, number> =
  {
    1: 8192,
    3: 14_000,
    5: 22_000,
    8: 26_000,
    10: 32_000,
    12: 38_400,
    15: 48_000,
  };

const DEFAULT_CHUNK_THRESHOLD_MIN = 10;
const DEFAULT_SCENES_PER_CHUNK = 18;
const DEFAULT_SPINE_MAX_TOKENS = 12_000;
const DEFAULT_CHUNK_MAX_TOKENS = 18_000;
const DEFAULT_HARD_CAP = 65_536;

function mergedStoryboardConfig(profile: LlmProfileRow) {
  const s = profile.storyboard ?? {};
  return {
    chunkThresholdMinutes:
      s.chunkThresholdMinutes ?? DEFAULT_CHUNK_THRESHOLD_MIN,
    scenesPerChunk: s.scenesPerChunk ?? DEFAULT_SCENES_PER_CHUNK,
    spineMaxTokens: s.spineMaxTokens ?? DEFAULT_SPINE_MAX_TOKENS,
    chunkMaxTokens: s.chunkMaxTokens ?? DEFAULT_CHUNK_MAX_TOKENS,
    maxTokensHardCap: s.maxTokensHardCap ?? DEFAULT_HARD_CAP,
    singleShotMaxTokensByDuration: s.singleShotMaxTokensByDuration,
    forceChunked: s.forceChunked,
    disableChunked: s.disableChunked,
  };
}

function clampTokens(n: number, cap: number): number {
  if (!Number.isFinite(n) || n < 256) return 256;
  return Math.min(Math.floor(n), Math.floor(cap));
}

/** 是否走分块管线 */
export function resolveUseChunkedStoryboard(args: {
  videoDurationMin: VideoDurationMin;
  chunkMode: StoryboardChunkMode;
  profile: LlmProfileRow;
}): boolean {
  const cfg = mergedStoryboardConfig(args.profile);
  if (cfg.forceChunked) return true;
  if (cfg.disableChunked) return false;
  if (args.chunkMode === "on") return true;
  return args.videoDurationMin >= cfg.chunkThresholdMinutes;
}

/** 单次请求 max_tokens */
export function resolveSingleShotMaxTokens(args: {
  videoDurationMin: VideoDurationMin;
  profile: LlmProfileRow;
}): number {
  const cfg = mergedStoryboardConfig(args.profile);
  const override =
    cfg.singleShotMaxTokensByDuration?.[String(args.videoDurationMin) as `${VideoDurationMin}`];
  const base =
    typeof override === "number" && override > 0
      ? override
      : DEFAULT_SINGLE_SHOT_MAX_TOKENS[args.videoDurationMin];
  return clampTokens(base, cfg.maxTokensHardCap);
}

export function resolveSpineMaxTokens(profile: LlmProfileRow): number {
  const cfg = mergedStoryboardConfig(profile);
  return clampTokens(cfg.spineMaxTokens, cfg.maxTokensHardCap);
}

export function resolveChunkMaxTokens(profile: LlmProfileRow): number {
  const cfg = mergedStoryboardConfig(profile);
  return clampTokens(cfg.chunkMaxTokens, cfg.maxTokensHardCap);
}

export function resolveScenesPerChunk(profile: LlmProfileRow): number {
  const n = mergedStoryboardConfig(profile).scenesPerChunk;
  return Math.max(4, Math.min(40, Math.floor(n)));
}

/** 将 1..total 切成若干闭区间 [start,end] */
export function chunkSceneIndexRanges(
  totalScenes: number,
  scenesPerChunk: number,
): Array<{ start: number; end: number }> {
  if (totalScenes <= 0) return [];
  const w = Math.max(1, scenesPerChunk);
  const out: Array<{ start: number; end: number }> = [];
  let start = 1;
  while (start <= totalScenes) {
    const end = Math.min(totalScenes, start + w - 1);
    out.push({ start, end });
    start = end + 1;
  }
  return out;
}

export function formatStoryboardStrategyLabel(args: {
  videoDurationMin: VideoDurationMin;
  phaseCount: number;
}): string {
  const d = getVideoDurationPreset(args.videoDurationMin);
  return `分层生成 · ${args.phaseCount} 阶段（叙事骨架 + 整稿口播 + 分镜扩写 · ${d.labelShort}）`;
}

/** L3 扩写区间：auto 按档案阈值决定是否切段；on 强制多段切分 */
export function resolveStoryboardExpandRanges(args: {
  chunkMode: StoryboardChunkMode;
  videoDurationMin: VideoDurationMin;
  profile: LlmProfileRow;
  targetScenes: number;
}): Array<{ start: number; end: number }> {
  const multi =
    args.chunkMode === "on" ||
    (args.chunkMode === "auto" &&
      resolveUseChunkedStoryboard({
        videoDurationMin: args.videoDurationMin,
        chunkMode: "auto",
        profile: args.profile,
      }));
  if (!multi) {
    return [{ start: 1, end: args.targetScenes }];
  }
  return chunkSceneIndexRanges(args.targetScenes, resolveScenesPerChunk(args.profile));
}

/** 当前扩写区间为「全长一拳」时用单次 max_tokens，否则用分块额度 */
export function resolveExpandMaxTokensForRange(args: {
  rangeStart: number;
  rangeEnd: number;
  targetScenes: number;
  videoDurationMin: VideoDurationMin;
  profile: LlmProfileRow;
}): number {
  const fullSpan =
    args.rangeStart === 1 && args.rangeEnd === args.targetScenes;
  if (fullSpan) {
    return resolveSingleShotMaxTokens({
      videoDurationMin: args.videoDurationMin,
      profile: args.profile,
    });
  }
  return resolveChunkMaxTokens(args.profile);
}
