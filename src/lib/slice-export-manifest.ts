import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { buildSliceExportFolderName } from "@/lib/slice-export-fs";
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
  videoProfileId: string;
  llmProfile?: GenerationResult["llmProfile"];
  hook?: string;
  timeline?: GenerationResult["timeline"];
  factNotes?: string[];
  complianceNote?: string;
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
    videoFile: string | null;
    videoFileCandidates?: string[];
    narration: string;
    visualDescription: string;
    durationSec: number;
    approved?: boolean;
  }>;
  notes: string;
};

type AssetLike = {
  status?: string;
  url?: string;
  videoStatus?: string;
  videoUrl?: string;
  approved?: boolean;
};

const DEFAULT_NOTES =
  "本包用于外部图生视频试验：按 scenes 顺序结合 narration / visualDescription 配置运动与镜头；封面为独立竖屏外宣底图，可与镜 1 不同。静帧/视频同镜号采用固定 stem，重复保存为 stem-2、stem-3… 不覆盖；导出资源时默认使用磁盘最新版，勾选「强制重新拉取」可从当前 URL 再拉一版写入下一序号。";

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
  videoProfileId: string;
  result: GenerationResult | null;
  coverStillUrl: string | null;
  assets: Record<number, AssetLike>;
}): {
  manifest: SliceExportManifestV1;
  exportFolder: string;
  downloads: SliceExportDownload[];
  videoDownloads: Array<{
    url: string;
    fileStem: string;
    sceneIndex: number;
  }>;
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
  const videoDownloads: Array<{
    url: string;
    fileStem: string;
    sceneIndex: number;
  }> = [];

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
      const vUrl =
        row?.videoStatus === "success" && row.videoUrl ?
          row.videoUrl
        : undefined;
      if (url) {
        downloads.push({
          url,
          fileStem: `${seed}-scene-${String(s.index).padStart(2, "0")}`,
          kind: "scene",
          sceneIndex: s.index,
        });
      }
      if (
        vUrl &&
        (vUrl.startsWith("http://") || vUrl.startsWith("https://"))
      ) {
        videoDownloads.push({
          url: vUrl,
          fileStem: `${seed}-scene-${String(s.index).padStart(2, "0")}-video`,
          sceneIndex: s.index,
        });
      }
      return {
        index: s.index,
        imageFile: null,
        videoFile: null,
        narration: s.narration,
        visualDescription: s.visualDescription,
        durationSec: s.durationSec,
        approved: row?.approved,
      };
    }) ?? [];

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
    videoProfileId: params.videoProfileId.trim(),
    llmProfile: params.result?.llmProfile,
    hook: params.result?.hook,
    timeline: params.result?.timeline,
    factNotes: params.result?.factNotes,
    complianceNote: params.result?.complianceNote,
    cover:
      params.coverStillUrl ?
        { imageFile: null, standaloneCover: true }
      : undefined,
    scenes,
    notes: DEFAULT_NOTES,
  };

  return { manifest, exportFolder, downloads, videoDownloads };
}
