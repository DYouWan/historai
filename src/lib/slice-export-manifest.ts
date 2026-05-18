import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import {
  buildCoverImageFileStem,
  buildSliceExportFolderName,
} from "@/lib/slice-export-naming";
import type {
  GenerationResult,
  StylePreset,
  Tone,
  VideoDurationMin,
} from "@/lib/types";

export const SLICE_EXPORT_VERSION = 2 as const;

export type SliceExportKeyframeFileEntry = {
  keyframeIndex: number;
  visualPrompt?: string;
  imageFile: string | null;
  imageFileCandidates?: string[];
};

export type SliceExportIntraShotSegmentEntry = {
  segmentIndex: number;
  fromKeyframe: number;
  toKeyframe: number;
  targetDurationSec: number;
  adaptationFit: string;
  officialTemplateNotes: string;
  suggestions: string;
  optimizedPrompt: string;
};

export type SliceExportDownload = {
  url: string;
  fileStem: string;
  kind: "cover" | "scene" | "sceneKeyframe";
  sceneIndex?: number;
  keyframeIndex?: number;
};

export type SliceExportManifestV1 = {
  exportVersion: typeof SLICE_EXPORT_VERSION;
  /** 与 KEYFRAMES-SEEDANCE-SPEC 对齐；exportVersion 同步递增 */
  manifestVersion: typeof SLICE_EXPORT_VERSION;
  generatedAt: string;
  exportFolder: string;
  /** 项目根下目录，POSIX 斜杠 */
  relativeRoot: string;
  projectSeed: string;
  subject: string;
  dynasty: string;
  seriesTitle: string;
  sliceTitle: string;
  sliceAngle: string;
  stylePreset: StylePreset;
  videoDurationMin: VideoDurationMin;
  storyboardChunkMode: StoryboardChunkMode | string;
  tone: Tone;
  imageProfileId: string;
  llmProfile?: GenerationResult["llmProfile"];
  storyArc?: GenerationResult["storyArc"];
  reviewChecklist?: GenerationResult["reviewChecklist"];
  /** 整稿口播全文（与 scenes[].narration 分段对应前的总稿；导出时含界面改稿） */
  voiceoverFullText?: string;
  cover?: {
    imageFile: string | null;
    /** 同 stem 规则下所有已落盘版本（升序），便于人工挑选 */
    imageFileCandidates?: string[];
    standaloneCover: true;
  };
  scenes: Array<{
    index: number;
    imageFile: string | null;
    imageFileCandidates?: string[];
    /** 该镜旁白 TTS 落盘路径（stem 为 …-scene-audio-镜号，扩展名为音频） */
    audioFile: string | null;
    audioFileCandidates?: string[];
    narration: string;
    visualDescription: string;
    durationSec: number;
    /** 关键帧 ≥2 的额外静帧；关键帧 1 与 imageFile 主 stem 一致 */
    keyframes?: SliceExportKeyframeFileEntry[];
    /** @deprecated 历史导出可能含镜内段；当前版本不再写入 */
    intraShotSegments?: SliceExportIntraShotSegmentEntry[];
  }>;
  notes: string;
};

type AssetLike = {
  status?: string;
  url?: string;
};

const DEFAULT_NOTES =
  "本包用于外部剪辑：按 scenes 顺序结合 narration / visualDescription；manifest.voiceoverFullText 为整稿口播全文（若有）。封面为独立竖屏外宣图，可与镜 1 不同；封面 stem 为 系列名-主角-画风-cover（不含叙事时长）。主静帧 stem 形如 {projectSeed}-scene-img-镜号；同镜追加关键帧为 …-scene-img-镜号-kf02 等；逐镜口播 TTS 为 {projectSeed}-scene-audio-镜号；重复保存为 stem-2、stem-3… 不覆盖；导出资源时静帧默认拉取远程 URL，音频仅扫描本地已落盘文件写入 manifest。manifestVersion 2 起 scenes 可含 keyframes。";

export type SliceExportSceneKeyframeBundleInput = {
  keyframeCount: number;
  extraKeyframes: Array<{
    keyframeIndex: number;
    url?: string;
    visualPrompt?: string;
  }>;
};

export function buildSliceExportBundlePayload(params: {
  projectSeed: string;
  subject: string;
  dynasty: string;
  seriesTitle: string;
  sliceTitle: string;
  sliceAngle: string;
  stylePreset: StylePreset;
  videoDurationMin: VideoDurationMin;
  storyboardChunkMode: StoryboardChunkMode | string;
  tone: Tone;
  imageProfileId: string;
  result: GenerationResult | null;
  coverStillUrl: string | null;
  assets: Record<number, AssetLike>;
  /** 整稿口播全文；优先于 result（如导出前在 UI 中改过稿） */
  voiceoverFullText?: string | null;
  /** 镜号 → 多关键帧（仅含 keyframeIndex≥2 的额外出图 URL） */
  sceneKeyframeBundles?: Record<number, SliceExportSceneKeyframeBundleInput>;
}): {
  manifest: SliceExportManifestV1;
  exportFolder: string;
  downloads: SliceExportDownload[];
} {
  const folderTitle =
    params.sliceTitle.trim() ||
    params.seriesTitle.trim() ||
    "未命名标题";
  const exportFolder = buildSliceExportFolderName(
    params.subject.trim(),
    folderTitle,
  );
  const relativeRoot = `slice-exports/${exportFolder}`;
  const seed = params.projectSeed.trim();
  const generatedAt = new Date().toISOString();

  const downloads: SliceExportDownload[] = [];

  if (params.coverStillUrl) {
    downloads.push({
      url: params.coverStillUrl,
      fileStem: buildCoverImageFileStem({
        seriesTitle: params.seriesTitle,
        sliceTitle: params.sliceTitle,
        subject: params.subject,
        stylePreset: params.stylePreset,
      }),
      kind: "cover",
    });
  }

  const scenes: SliceExportManifestV1["scenes"] =
    params.result?.scenes.map((s) => {
      const row = params.assets[s.index];
      const url =
        row?.status === "success" && row.url ? row.url : undefined;
      if (url) {
        downloads.push({
          url,
          fileStem: `${seed}-scene-img-${String(s.index).padStart(2, "0")}`,
          kind: "scene",
          sceneIndex: s.index,
        });
      }
      const bundle = params.sceneKeyframeBundles?.[s.index];
      const keyframes: SliceExportKeyframeFileEntry[] | undefined =
        bundle?.extraKeyframes?.length ?
          bundle.extraKeyframes
            .filter((x) => x.keyframeIndex > 1)
            .map((x) => {
              const u = x.url?.trim();
              if (u) {
                downloads.push({
                  url: u,
                  fileStem: `${seed}-scene-img-${String(s.index).padStart(2, "0")}-kf${String(x.keyframeIndex).padStart(2, "0")}`,
                  kind: "sceneKeyframe",
                  sceneIndex: s.index,
                  keyframeIndex: x.keyframeIndex,
                });
              }
              return {
                keyframeIndex: x.keyframeIndex,
                ...(x.visualPrompt?.trim() ?
                  { visualPrompt: x.visualPrompt.trim() }
                : {}),
                imageFile: null,
              };
            })
        : undefined;
      return {
        index: s.index,
        imageFile: null,
        audioFile: null,
        narration: s.narration,
        visualDescription: s.visualDescription,
        durationSec: s.durationSec,
        ...(keyframes?.length ? { keyframes } : {}),
      };
    }) ?? [];

  const voiceoverMerged =
    params.voiceoverFullText?.trim() ||
    params.result?.voiceoverFullText?.trim() ||
    "";

  const manifest: SliceExportManifestV1 = {
    exportVersion: SLICE_EXPORT_VERSION,
    manifestVersion: SLICE_EXPORT_VERSION,
    generatedAt,
    exportFolder,
    relativeRoot,
    projectSeed: seed,
    subject: params.subject.trim(),
    dynasty: params.dynasty.trim(),
    seriesTitle: params.seriesTitle.trim(),
    sliceTitle: params.sliceTitle.trim(),
    sliceAngle: params.sliceAngle.trim(),
    stylePreset: params.stylePreset,
    videoDurationMin: params.videoDurationMin,
    storyboardChunkMode: params.storyboardChunkMode,
    tone: params.tone,
    imageProfileId: params.imageProfileId.trim(),
    llmProfile: params.result?.llmProfile,
    storyArc: params.result?.storyArc,
    reviewChecklist: params.result?.reviewChecklist,
    ...(voiceoverMerged ? { voiceoverFullText: voiceoverMerged } : {}),
    cover:
      params.coverStillUrl ?
        { imageFile: null, standaloneCover: true }
      : undefined,
    scenes,
    notes: DEFAULT_NOTES,
  };

  return { manifest, exportFolder, downloads };
}

export function coerceSceneKeyframeBundlesFromClientBody(
  raw: unknown,
): Record<number, SliceExportSceneKeyframeBundleInput> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const root = raw as Record<string, unknown>;
  const out: Record<number, SliceExportSceneKeyframeBundleInput> = {};
  for (const [k, v] of Object.entries(root)) {
    const sceneIdx = Number(k);
    if (!Number.isFinite(sceneIdx) || sceneIdx < 1) continue;
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const kc = Math.min(
      4,
      Math.max(1, Math.floor(Number(r.keyframeCount)) || 1),
    );
    const extraRaw = Array.isArray(r.extraKeyframes) ? r.extraKeyframes : [];
    const extraKeyframes = extraRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const e = item as Record<string, unknown>;
        const keyframeIndex = Math.floor(Number(e.keyframeIndex));
        if (!Number.isFinite(keyframeIndex) || keyframeIndex < 2) return null;
        const url = typeof e.url === "string" ? e.url.trim() : "";
        const visualPrompt =
          typeof e.visualPrompt === "string" ? e.visualPrompt.trim() : "";
        return {
          keyframeIndex,
          ...(url ? { url } : {}),
          ...(visualPrompt ? { visualPrompt } : {}),
        };
      })
      .filter(Boolean) as SliceExportSceneKeyframeBundleInput["extraKeyframes"];

    if (extraKeyframes.length || kc > 1) {
      out[sceneIdx] = {
        keyframeCount: kc,
        extraKeyframes,
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
}
