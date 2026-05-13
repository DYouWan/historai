import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { buildSliceExportFolderName } from "@/lib/slice-export-fs";
import type { SeedancePromptSceneOutput } from "@/lib/seedance-scene-prompts";
import type {
  GenerationResult,
  StylePreset,
  Tone,
  VideoDurationMin,
} from "@/lib/types";

export const SLICE_EXPORT_VERSION = 1 as const;

export type SliceExportDownload = {
  url: string;
  fileStem: string;
  kind: "cover" | "scene";
  sceneIndex?: number;
};

export type SliceExportManifestV1 = {
  exportVersion: typeof SLICE_EXPORT_VERSION;
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
  hook?: string;
  timeline?: GenerationResult["timeline"];
  factNotes?: string[];
  complianceNote?: string;
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
  }>;
  notes: string;
};

type AssetLike = {
  status?: string;
  url?: string;
};

const DEFAULT_NOTES =
  "本包用于外部剪辑：按 scenes 顺序结合 narration / visualDescription；manifest.voiceoverFullText 为整稿口播全文（若有）。封面为独立竖屏外宣底图，可与镜 1 不同。静帧落盘 stem 形如 {projectSeed}-scene-img-镜号，逐镜口播 TTS 为 {projectSeed}-scene-audio-镜号；重复保存为 stem-2、stem-3… 不覆盖；导出资源时静帧默认拉取远程 URL，音频仅扫描本地已落盘文件写入 manifest。";

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
      fileStem: seed,
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
      return {
        index: s.index,
        imageFile: null,
        audioFile: null,
        narration: s.narration,
        visualDescription: s.visualDescription,
        durationSec: s.durationSec,
      };
    }) ?? [];

  const voiceoverMerged =
    params.voiceoverFullText?.trim() ||
    params.result?.voiceoverFullText?.trim() ||
    "";

  const manifest: SliceExportManifestV1 = {
    exportVersion: SLICE_EXPORT_VERSION,
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
    hook: params.result?.hook,
    timeline: params.result?.timeline,
    factNotes: params.result?.factNotes,
    complianceNote: params.result?.complianceNote,
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

export const SEEDANCE_SCENE_EXPORT_VERSION = 1 as const;

export type SliceExportSeedanceScenePromptsV1 = {
  exportVersion: typeof SEEDANCE_SCENE_EXPORT_VERSION;
  generatedAt: string;
  exportFolder: string;
  relativeRoot: string;
  projectSeed: string;
  notes: string;
  scenes: SeedancePromptSceneOutput[];
};

const SEEDANCE_SCENE_EXPORT_NOTES =
  "HistorAI 导出的各镜 Seedance 图生视频分析与优化提示词；index 为分镜镜号，与 manifest.json 中 scenes 及静帧 stem 对应。";

/** 校验并规范化客户端 POST 的 Seedance 条目；无效或空数组返回 null。 */
export function coerceSeedanceScenePromptsFromClientBody(
  raw: unknown,
): SeedancePromptSceneOutput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SeedancePromptSceneOutput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const index = Number(r.index);
    if (!Number.isFinite(index)) continue;
    out.push({
      index,
      adaptationFit: String(r.adaptationFit ?? "").trim(),
      officialTemplateNotes: String(r.officialTemplateNotes ?? "").trim(),
      suggestions: String(r.suggestions ?? "").trim(),
      optimizedPrompt: String(r.optimizedPrompt ?? "").trim(),
    });
  }
  if (!out.length) return null;
  out.sort((a, b) => a.index - b.index);
  return out;
}

export function buildSeedanceScenePromptsExportDocument(params: {
  generatedAt: string;
  exportFolder: string;
  relativeRoot: string;
  projectSeed: string;
  scenes: SeedancePromptSceneOutput[];
}): SliceExportSeedanceScenePromptsV1 {
  return {
    exportVersion: SEEDANCE_SCENE_EXPORT_VERSION,
    generatedAt: params.generatedAt,
    exportFolder: params.exportFolder,
    relativeRoot: params.relativeRoot,
    projectSeed: params.projectSeed.trim(),
    notes: SEEDANCE_SCENE_EXPORT_NOTES,
    scenes: [...params.scenes].sort((a, b) => a.index - b.index),
  };
}
