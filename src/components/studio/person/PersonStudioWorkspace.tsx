"use client";

import type {
  GenerationResult,
  SliceSuggestion,
  StoryboardSpineSnapshot,
  StylePreset,
  Tone,
  VideoDurationMin,
} from "@/lib/types";
import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { VIDEO_DURATION_UI_OPTIONS } from "@/lib/video-duration";
import {
  SERIES_NAME_AI_DIRECTIONS,
  THEME_TITLE_PRESETS,
} from "@/lib/prompts/series-prompts";
import { driverSupportsReferenceImage } from "@/lib/image-coherence";
import type { ImageProfileDriver } from "@/lib/media-profiles";
import { ACTIVE_STUDIO_VERTICAL } from "@/lib/studio-verticals";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LAST_LLM_PROFILE_KEY = "historai:llmProfileId";
const LAST_IMAGE_PROFILE_KEY = "historai:imageProfileId";
const LAST_VIDEO_PROFILE_KEY = "historai:videoProfileId";

type LlmProfileOption = {
  id: string;
  vendor: string;
  label: string;
  model: string;
  configured: boolean;
};

type MediaImageOption = {
  id: string;
  vendor: string;
  label: string;
  driver: string;
  configured: boolean;
  modelLine?: string;
};

type MediaVideoOption = {
  id: string;
  vendor: string;
  label: string;
  driver: string;
  model: string;
  configured: boolean;
};

const STORYBOARD_CHUNK_OPTIONS: {
  value: StoryboardChunkMode;
  label: string;
}[] = [
  {
    value: "auto",
    label:
      "自动（短片一次扩写全长；≥10 分钟按档案切段，见 llm-profiles）",
  },
  {
    value: "on",
    label: "强制切段扩写（叙事骨架 + 整稿口播 + 多轮分镜）",
  },
  {
    value: "off",
    label: "单次扩写全长（仍含叙事骨架与整稿口播；一轮出齐分镜）",
  },
];

const STYLE_OPTIONS: { id: StylePreset; label: string }[] = [
  { id: "ink", label: "水墨留白" },
  { id: "gongbi", label: "工笔重彩" },
  { id: "cinematic", label: "电影质感" },
  { id: "docu", label: "纪录片存档感" },
  { id: "watercolor", label: "水彩插画" },
];

const fieldClass =
  "w-full rounded-lg border border-zinc-800/90 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 shadow-sm transition placeholder:text-zinc-600 focus:border-amber-600/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15";

/** 顶栏模型与媒体卡片内下拉，略紧凑 */
const headerSelectClass =
  "w-full rounded-lg border border-zinc-800/80 bg-zinc-950/90 px-2.5 py-2 text-xs text-zinc-100 shadow-sm transition focus:border-amber-600/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45";

const sectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/55";

const groupTitleClass = "text-xs font-medium text-zinc-400";

/** 顶栏「模型与媒体」整块容器 */
const headerModelsPanelClass =
  "rounded-xl border border-zinc-800/55 bg-zinc-950/45 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] ring-1 ring-zinc-800/35 sm:p-4";

/** 顶栏内各 API 分区标题 */
const headerApiGroupClass =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/40";

const badgeBase =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 tabular-nums";
const badgeSuccess = `${badgeBase} bg-emerald-950/50 text-emerald-100/90 ring-emerald-800/40`;
const badgeRunning = `${badgeBase} bg-amber-950/45 text-amber-50/90 ring-amber-700/35`;
const badgeFail = `${badgeBase} bg-rose-950/40 text-rose-100 ring-rose-800/40`;
const badgeMuted = `${badgeBase} bg-zinc-900/90 text-zinc-500 ring-zinc-800/70`;

/** 分镜表 · 操作列分组与按钮（避免窄列里字号过小、层级不清） */
const storyboardOpSectionLabel =
  "select-none text-[10px] font-semibold tracking-wide text-zinc-500";
const storyboardOpDivider = "h-px w-full bg-zinc-800/80";
const storyboardOpPrimaryBtn =
  "inline-flex min-h-[2.35rem] w-full items-center justify-center rounded-lg border border-amber-600/45 bg-amber-500/14 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-amber-50 shadow-sm transition hover:border-amber-500/55 hover:bg-amber-500/22 disabled:cursor-not-allowed disabled:opacity-40";
const storyboardOpSecondaryBtn =
  "inline-flex min-h-[2.35rem] w-full items-center justify-center rounded-lg border border-zinc-600/75 bg-zinc-950/65 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900/72 disabled:cursor-not-allowed disabled:opacity-40";
/** 与 secondary 同级，略弱化以区分主流程 */
const storyboardOpMutedBtn =
  "inline-flex min-h-[2.35rem] w-full items-center justify-center rounded-lg border border-zinc-700/55 bg-zinc-950/45 px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900/58 disabled:cursor-not-allowed disabled:opacity-40";
const storyboardOpVideoBtn =
  "inline-flex min-h-[2.35rem] w-full items-center justify-center rounded-lg border border-amber-500/28 bg-amber-500/[0.08] px-2 py-1.5 text-center text-[11px] font-semibold leading-snug text-amber-100/95 transition hover:border-amber-500/45 hover:bg-amber-500/13 disabled:cursor-not-allowed disabled:opacity-40";
const storyboardOpAdoptLabel =
  "flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800/85 bg-zinc-950/55 px-2.5 py-2 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900/65 hover:text-zinc-300";

/** 表单内分区卡片 */
const panelClass =
  "rounded-2xl border border-zinc-800/70 bg-gradient-to-b from-zinc-950/55 to-zinc-950/25 p-4 shadow-sm sm:p-5";

/** 步骤面板内子区块（系列 / 人物 / 切片） */
const stepInnerCardClass =
  "rounded-xl border border-zinc-800/55 bg-zinc-950/35 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] sm:p-5";

const stepBlockTitleClass =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

/** 主流程 AI 按钮 */
const aiActionClass =
  "inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-amber-500 px-8 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-950/30 ring-1 ring-amber-400/25 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none";

const workflowSteps = [
  {
    n: "1",
    label: "系列与人物",
    desc: "强冲突系列预设",
  },
  { n: "2", label: "高光与呈现", desc: "切片标题与说明" },
  { n: "3", label: "生成封面", desc: "外宣竖屏底图（独立 API）" },
  { n: "4", label: "文案与分镜", desc: "成片选项与主生成镜表" },
] as const;

/** 封面预览条数上限；超出须勾选删除后才可再次生成（并尽量同步删 slice-exports 落盘文件） */
const MAX_COVER_GALLERY = 5;

/** 转为 base64 data URL 后会显著膨胀，控制体积避免请求体过大 */
const MAX_COVER_REFERENCE_FILE_BYTES = 20 * 1024 * 1024;

type AssetRow = {
  sceneIndex: number;
  status: "idle" | "running" | "success" | "failed";
  url?: string;
  approved?: boolean;
  error?: string;
  provider?: string;
  videoStatus?: "idle" | "running" | "success" | "failed";
  videoUrl?: string;
  videoError?: string;
  videoProvider?: string;
};

/** 单次封面请求状态（成功结果进入 coverGallery，便于多次生成叠放展示） */
type CoverRequestState = {
  status: "idle" | "running" | "failed";
  error?: string;
};

type CoverGalleryItem = {
  id: string;
  url: string;
  provider?: string;
  /** 自动保存成功后由服务端返回，用于勾选删除时在磁盘上删掉对应文件 */
  savedRelativePath?: string;
};

export function PersonStudioWorkspace() {
  const [seriesTitle, setSeriesTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [tone, setTone] = useState<Tone>("narrative");
  const [stylePreset, setStylePreset] = useState<StylePreset>("ink");
  const [videoDurationMin, setVideoDurationMin] =
    useState<VideoDurationMin>(1);
  const [storyboardChunkMode, setStoryboardChunkMode] =
    useState<StoryboardChunkMode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  /** 可编辑整稿口播；按稿重跑 L3 时提交 */
  const [voiceoverDraft, setVoiceoverDraft] = useState("");
  /** L1 叙事骨架区块整块可收起，减轻长页滚动 */
  const [narrativeSkeletonPanelExpanded, setNarrativeSkeletonPanelExpanded] = useState(true);
  /** L1 内：时间线子块可折叠 */
  const [narrativeTimelineExpanded, setNarrativeTimelineExpanded] = useState(true);
  /** L1 内：分镜骨架子块可折叠 */
  const [narrativeSceneSkeletonExpanded, setNarrativeSceneSkeletonExpanded] = useState(true);
  /** three-step：L1 → L2 → L3；two-step：L1+L2 → L3；one-step：一次完成 */
  const [generationPacing, setGenerationPacing] = useState<
    "three-step" | "two-step" | "one-step"
  >("three-step");
  const [polishBusy, setPolishBusy] = useState(false);
  const [assets, setAssets] = useState<Record<number, AssetRow>>({});
  const [coverRequest, setCoverRequest] = useState<CoverRequestState>({
    status: "idle",
  });
  const [coverGallery, setCoverGallery] = useState<CoverGalleryItem[]>([]);
  const [coverDeleteBusy, setCoverDeleteBusy] = useState(false);
  const coverRefFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCoverId, setSelectedCoverId] = useState<string | null>(null);

  const latestCoverUrl = useMemo(() => {
    if (selectedCoverId) {
      const selected = coverGallery.find((g) => g.id === selectedCoverId);
      if (selected) return selected.url;
    }
    return coverGallery[0]?.url ?? null;
  }, [coverGallery, selectedCoverId]);
  const [batchBusy, setBatchBusy] = useState(false);
  /** 批量生成时设为 true 可中断循环 */
  const stopBatchRef = useRef(false);
  const [llmProfiles, setLlmProfiles] = useState<LlmProfileOption[]>([]);
  const [profileId, setProfileId] = useState("");
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [imageProfiles, setImageProfiles] = useState<MediaImageOption[]>([]);
  const [videoProfiles, setVideoProfiles] = useState<MediaVideoOption[]>([]);
  const [imageProfileId, setImageProfileId] = useState("");
  const [videoProfileId, setVideoProfileId] = useState("");
  const [mediaProfilesError, setMediaProfilesError] = useState<string | null>(
    null,
  );
  const [sliceTitle, setSliceTitle] = useState("");
  const [sliceAngle, setSliceAngle] = useState("");
  const [sliceSuggestions, setSliceSuggestions] = useState<SliceSuggestion[]>(
    [],
  );
  const [characterSuggestions, setCharacterSuggestions] = useState<string[]>(
    [],
  );
  const [suggestCharsBusy, setSuggestCharsBusy] = useState(false);
  const [charsHint, setCharsHint] = useState<string | null>(null);
  const [suggestSlicesBusy, setSuggestSlicesBusy] = useState(false);
  const [slicesHint, setSlicesHint] = useState<string | null>(null);

  const [seriesAiBusy, setSeriesAiBusy] = useState(false);
  const [seriesAiError, setSeriesAiError] = useState<string | null>(null);
  /** 本次「AI 生成系列名」随机附带的方向（用于展示与调试） */
  const [seriesAiDirectionHint, setSeriesAiDirectionHint] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/llm-profiles");
        const json = (await res.json()) as {
          error?: string;
          defaultProfileId?: string | null;
          profiles?: LlmProfileOption[];
        };
        if (!res.ok) {
          throw new Error(json.error ?? "加载模型列表失败");
        }
        if (cancelled) return;
        const list = json.profiles ?? [];
        setLlmProfiles(list);
        setProfilesError(null);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LAST_LLM_PROFILE_KEY)
            : null;
        const pickInitial = () => {
          if (stored && list.some((p) => p.id === stored)) return stored;
          const def = json.defaultProfileId;
          if (def && list.some((p) => p.id === def)) return def;
          const firstConfigured = list.find((p) => p.configured);
          return firstConfigured?.id ?? list[0]?.id ?? "";
        };
        setProfileId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return pickInitial();
        });
      } catch (e) {
        if (!cancelled) {
          setProfilesError(e instanceof Error ? e.message : "加载模型列表失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCharacterSuggestions([]);
    setCharsHint(null);
  }, [seriesTitle]);

  useEffect(() => {
    setSliceSuggestions([]);
    setSlicesHint(null);
  }, [seriesTitle, subject]);

  useEffect(() => {
    setCoverRequest({ status: "idle" });
  }, [result]);

  const canGenerateStandaloneCover = useMemo(
    () =>
      Boolean(
        subject.trim() &&
          (sliceAngle.trim() || sliceTitle.trim() || seriesTitle.trim()),
      ),
    [subject, sliceAngle, sliceTitle, seriesTitle],
  );

  /** 与导出文件夹命名一致：切片标题优先，否则系列名，否则未命名 */
  const sliceFolderTitle = useMemo(
    () => sliceTitle.trim() || seriesTitle.trim() || "未命名标题",
    [sliceTitle, seriesTitle],
  );

  const [sliceSaveBusy, setSliceSaveBusy] = useState<string | null>(null);
  const [sliceSaveHint, setSliceSaveHint] = useState<string | null>(null);
  const [exportBundleBusy, setExportBundleBusy] = useState(false);

  const saveSliceImageToProject = useCallback(
    async (
      imageUrl: string,
      kind: { role: "scene"; sceneIndex: number; fileStem?: string },
    ) => {
      const key = `scene-${kind.sceneIndex}`;
      setSliceSaveBusy(key);
      setSliceSaveHint(null);
      try {
        if (!subject.trim()) {
          setSliceSaveHint("请先填写主角（人物），再保存图片。");
          return;
        }
        const res = await fetch("/api/save-slice-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            subject: subject.trim(),
            title: sliceFolderTitle,
            role: kind.role,
            sceneIndex: kind.sceneIndex,
            ...(kind.fileStem ? { fileStem: kind.fileStem } : {}),
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          relativePath?: string;
        };
        if (!res.ok) {
          setSliceSaveHint(json.error ?? "保存失败");
          return;
        }
        setSliceSaveHint(`已保存到项目：${json.relativePath ?? ""}`);
      } catch (e) {
        setSliceSaveHint(e instanceof Error ? e.message : "保存失败");
      } finally {
        setSliceSaveBusy(null);
      }
    },
    [subject, sliceFolderTitle],
  );

  useEffect(() => {
    if (!profileId || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_LLM_PROFILE_KEY, profileId);
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/media-profiles");
        const json = (await res.json()) as {
          error?: string;
          defaultImageProfileId?: string | null;
          defaultVideoProfileId?: string | null;
          imageProfiles?: MediaImageOption[];
          videoProfiles?: MediaVideoOption[];
        };
        if (!res.ok) {
          throw new Error(json.error ?? "加载媒体模型列表失败");
        }
        if (cancelled) return;
        const imgList = json.imageProfiles ?? [];
        const vidList = json.videoProfiles ?? [];
        setImageProfiles(imgList);
        setVideoProfiles(vidList);
        setMediaProfilesError(null);
        const imgStored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LAST_IMAGE_PROFILE_KEY)
            : null;
        const vidStored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LAST_VIDEO_PROFILE_KEY)
            : null;
        const pickImg = () => {
          if (imgStored && imgList.some((p) => p.id === imgStored)) {
            return imgStored;
          }
          const def = json.defaultImageProfileId;
          if (def && imgList.some((p) => p.id === def)) return def;
          const firstOk = imgList.find((p) => p.configured);
          return firstOk?.id ?? imgList[0]?.id ?? "";
        };
        const pickVid = () => {
          if (vidStored && vidList.some((p) => p.id === vidStored)) {
            return vidStored;
          }
          const def = json.defaultVideoProfileId;
          if (def && vidList.some((p) => p.id === def)) return def;
          const firstOk = vidList.find((p) => p.configured);
          return firstOk?.id ?? vidList[0]?.id ?? "";
        };
        setImageProfileId((prev) => {
          if (prev && imgList.some((p) => p.id === prev)) return prev;
          return pickImg();
        });
        setVideoProfileId((prev) => {
          if (prev && vidList.some((p) => p.id === prev)) return prev;
          return pickVid();
        });
      } catch (e) {
        if (!cancelled) {
          setMediaProfilesError(
            e instanceof Error ? e.message : "加载媒体模型列表失败",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!imageProfileId || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_IMAGE_PROFILE_KEY, imageProfileId);
  }, [imageProfileId]);

  useEffect(() => {
    if (!videoProfileId || typeof window === "undefined") return;
    window.localStorage.setItem(LAST_VIDEO_PROFILE_KEY, videoProfileId);
  }, [videoProfileId]);

  const vendorsOrdered = useMemo(() => {
    const out: string[] = [];
    for (const p of llmProfiles) {
      if (!out.includes(p.vendor)) out.push(p.vendor);
    }
    return out;
  }, [llmProfiles]);

  const imageVendorsOrdered = useMemo(() => {
    const out: string[] = [];
    for (const p of imageProfiles) {
      if (!out.includes(p.vendor)) out.push(p.vendor);
    }
    return out;
  }, [imageProfiles]);

  const videoVendorsOrdered = useMemo(() => {
    const out: string[] = [];
    for (const p of videoProfiles) {
      if (!out.includes(p.vendor)) out.push(p.vendor);
    }
    return out;
  }, [videoProfiles]);

  const selectedImageProfile = useMemo(
    () => imageProfiles.find((p) => p.id === imageProfileId),
    [imageProfiles, imageProfileId],
  );

  const imageProfileSupportsCoverReference = useMemo(
    () =>
      Boolean(
        selectedImageProfile &&
          driverSupportsReferenceImage(
            selectedImageProfile.driver as ImageProfileDriver,
          ),
      ),
    [selectedImageProfile],
  );

  const modelsInImageVendor = useMemo(() => {
    const v = selectedImageProfile?.vendor ?? imageVendorsOrdered[0];
    return imageProfiles.filter((p) => p.vendor === v);
  }, [imageProfiles, selectedImageProfile, imageVendorsOrdered]);

  const selectedImageVendor =
    selectedImageProfile?.vendor ?? imageVendorsOrdered[0] ?? "";

  const setImageVendorAndDefaultProfile = (vendor: string) => {
    const inVendor = imageProfiles.filter((p) => p.vendor === vendor);
    const next =
      inVendor.find((p) => p.configured) ??
      inVendor.find((p) => p.id === imageProfileId) ??
      inVendor[0];
    if (next) setImageProfileId(next.id);
  };

  const selectedVideoProfile = useMemo(
    () => videoProfiles.find((p) => p.id === videoProfileId),
    [videoProfiles, videoProfileId],
  );

  const modelsInVideoVendor = useMemo(() => {
    const v = selectedVideoProfile?.vendor ?? videoVendorsOrdered[0];
    return videoProfiles.filter((p) => p.vendor === v);
  }, [videoProfiles, selectedVideoProfile, videoVendorsOrdered]);

  const selectedVideoVendor =
    selectedVideoProfile?.vendor ?? videoVendorsOrdered[0] ?? "";

  const setVideoVendorAndDefaultProfile = (vendor: string) => {
    const inVendor = videoProfiles.filter((p) => p.vendor === vendor);
    const next =
      inVendor.find((p) => p.configured) ??
      inVendor.find((p) => p.id === videoProfileId) ??
      inVendor[0];
    if (next) setVideoProfileId(next.id);
  };

  const selectedProfile = useMemo(
    () => llmProfiles.find((p) => p.id === profileId),
    [llmProfiles, profileId],
  );

  const modelsInVendor = useMemo(() => {
    const v = selectedProfile?.vendor ?? vendorsOrdered[0];
    return llmProfiles.filter((p) => p.vendor === v);
  }, [llmProfiles, selectedProfile, vendorsOrdered]);

  const selectedVendor =
    selectedProfile?.vendor ?? vendorsOrdered[0] ?? "";

  const setVendorAndDefaultProfile = (vendor: string) => {
    const inVendor = llmProfiles.filter((p) => p.vendor === vendor);
    const next =
      inVendor.find((p) => p.configured) ??
      inVendor.find((p) => p.id === profileId) ??
      inVendor[0];
    if (next) setProfileId(next.id);
  };

  const projectSeed = useMemo(() => {
    const t = seriesTitle.trim().slice(0, 20);
    const base = subject.trim() || "historai";
    return `${t}-${base}-${stylePreset}-${videoDurationMin}m`
      .replace(/\s+/g, "-")
      .slice(0, 48);
  }, [subject, stylePreset, seriesTitle, videoDurationMin]);

  const canExportSliceBundle = useMemo(() => {
    if (!subject.trim()) return false;
    const hasCover = coverGallery.length > 0;
    const hasScene = Object.values(assets).some(
      (a) => a?.status === "success" && a.url,
    );
    return hasCover || hasScene;
  }, [subject, coverGallery.length, assets]);

  const runExportSliceBundle = useCallback(async () => {
    if (!canExportSliceBundle) return;
    setExportBundleBusy(true);
    setSliceSaveHint(null);
    try {
      const res = await fetch("/api/export-slice-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSeed,
          subject: subject.trim(),
          dynasty: dynasty.trim(),
          seriesTitle: seriesTitle.trim(),
          sliceTitle: sliceTitle.trim(),
          sliceAngle: sliceAngle.trim(),
          stylePreset,
          videoDurationMin,
          storyboardChunkMode,
          tone,
          imageProfileId: imageProfileId || undefined,
          videoProfileId: videoProfileId || undefined,
          result,
          narrationScript: result?.scenes
            .map((s) => s.narration)
            .filter(Boolean)
            .join("\n"),
          coverStillUrl: latestCoverUrl,
          assets: Object.fromEntries(
            Object.entries(assets).map(([k, v]) => [
              Number(k),
              {
                status: v.status,
                url: v.url,
                videoStatus: v.videoStatus,
                videoUrl: v.videoUrl,
                approved: v.approved,
              },
            ]),
          ),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        manifestPath?: string;
        saved?: string[];
        errors?: string[];
      };
      if (!res.ok) {
        setSliceSaveHint(json.error ?? "导出失败");
        return;
      }
    } catch (e) {
      setSliceSaveHint(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportBundleBusy(false);
    }
  }, [
    canExportSliceBundle,
    projectSeed,
    subject,
    dynasty,
    seriesTitle,
    sliceTitle,
    sliceAngle,
    stylePreset,
    videoDurationMin,
    storyboardChunkMode,
    tone,
    imageProfileId,
    videoProfileId,
    result,
    latestCoverUrl,
    assets,
  ]);

  const resetAssets = useCallback(() => {
    setAssets({});
  }, []);

  const runSuggestSeriesNames = async () => {
    setSeriesAiBusy(true);
    setSeriesAiError(null);
    setSeriesAiDirectionHint(null);
    try {
      const hint =
        SERIES_NAME_AI_DIRECTIONS[
          Math.floor(Math.random() * SERIES_NAME_AI_DIRECTIONS.length)
        ] ?? "";
      const res = await fetch("/api/suggest-series-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId.trim() || undefined,
          hint,
        }),
      });
      const raw = await res.text();
      let parsed: {
        error?: string;
        suggestion?: string;
        suggestions?: string[];
      } | null = null;
      try {
        parsed = raw
          ? (JSON.parse(raw) as {
              error?: string;
              suggestion?: string;
              suggestions?: string[];
            })
          : null;
      } catch {
        setSeriesAiError(
          !res.ok
            ? `请求失败（${res.status}）：${raw.slice(0, 240)}`
            : "接口返回非 JSON，请重启 dev 后重试或查看终端/网络面板。",
        );
        return;
      }
      if (!res.ok) {
        setSeriesAiError(parsed?.error ?? `请求失败（${res.status}）`);
        return;
      }
      let line = String(parsed?.suggestion ?? "").trim();
      const legacy = Array.isArray(parsed?.suggestions) ? parsed!.suggestions : [];
      if (!line && legacy.length > 0) {
        line = String(legacy[0] ?? "").trim();
      }
      if (!line) {
        setSeriesAiError("未返回系列名，请重试。");
        return;
      }
      setSeriesTitle(line.slice(0, 120));
      setSeriesAiDirectionHint(hint || null);
    } catch (e) {
      setSeriesAiError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSeriesAiBusy(false);
    }
  };

  const runSuggestCharacters = async () => {
    if (!seriesTitle.trim()) return;
    setSuggestCharsBusy(true);
    setCharsHint(null);
    setCharacterSuggestions([]);
    try {
      const res = await fetch("/api/suggest-theme-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        characters?: string[];
      };
      if (!res.ok) {
        setCharsHint(json.error ?? "推荐失败");
        return;
      }
      setCharacterSuggestions(json.characters ?? []);
    } catch (e) {
      setCharsHint(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSuggestCharsBusy(false);
    }
  };

  const runSuggestSubtitles = async () => {
    if (!seriesTitle.trim() || !subject.trim()) return;
    setSuggestSlicesBusy(true);
    setSlicesHint(null);
    setSliceSuggestions([]);
    try {
      const res = await fetch("/api/suggest-character-slices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim(),
          characterName: subject.trim(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        suggestions?: SliceSuggestion[];
      };
      if (!res.ok) {
        setSlicesHint(json.error ?? "推荐失败");
        return;
      }
      setSliceSuggestions(json.suggestions ?? []);
    } catch (e) {
      setSlicesHint(e instanceof Error ? e.message : "网络错误");
    } finally {
      setSuggestSlicesBusy(false);
    }
  };

  const applySuggestion = (s: SliceSuggestion) => {
    setSliceTitle(s.title);
    setSliceAngle(s.angle);
  };

  const runGenerate = async () => {
    setLoading(true);
    setError(null);
    resetAssets();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          subject,
          dynasty: dynasty || undefined,
          tone,
          stylePreset,
          videoDurationMin,
          storyboardChunkMode,
          ...(generationPacing === "two-step" ?
            { stopAfterVoiceover: true }
          : generationPacing === "three-step" ?
            { stopAfterSpine: true }
          : {}),
        }),
      });
      const json = (await res.json()) as GenerationResult | { error?: string };
      if (!res.ok) {
        setError(
          "error" in json && json.error
            ? String(json.error)
            : "生成失败",
        );
        setResult(null);
        setVoiceoverDraft("");
        return;
      }
      const gen = json as GenerationResult;
      setResult(gen);
      setVoiceoverDraft(gen.voiceoverFullText ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
      setResult(null);
      setVoiceoverDraft("");
    } finally {
      setLoading(false);
    }
  };

  /** 三步流程：在已有叙事骨架上仅请求 L2 */
  const runGenerateVoiceoverOnly = async () => {
    if (!result || result.pipelinePending !== "voiceover") return;
    if (!result.sceneSkeleton?.length) return;
    const snap: StoryboardSpineSnapshot = {
      hook: result.hook,
      timeline: result.timeline,
      sceneSkeleton: result.sceneSkeleton,
      factNotes: result.factNotes,
      complianceNote: result.complianceNote ?? null,
    };
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          subject,
          dynasty: dynasty || undefined,
          tone,
          stylePreset,
          videoDurationMin,
          storyboardChunkMode,
          spineSnapshot: snap,
          generateVoiceoverOnly: true,
        }),
      });
      const json = (await res.json()) as GenerationResult | { error?: string };
      if (!res.ok) {
        setError(
          "error" in json && json.error
            ? String(json.error)
            : "生成整稿口播失败",
        );
        return;
      }
      const gen = json as GenerationResult;
      setResult(gen);
      setVoiceoverDraft(gen.voiceoverFullText ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  const runPolishVoiceover = async () => {
    if (!result?.sceneSkeleton?.length || !voiceoverDraft.trim()) return;
    setPolishBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/polish-voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          paragraphCount: result.sceneSkeleton.length,
          voiceoverFullText: voiceoverDraft.trim(),
          hook: result.hook,
          subject: subject.trim(),
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          dynasty: dynasty.trim() || undefined,
          tone,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        voiceoverFullText?: string;
        voiceoverParagraphs?: string[];
      };
      if (!res.ok) {
        setError(json.error ?? "润色失败");
        return;
      }
      const nextFull = json.voiceoverFullText ?? "";
      setVoiceoverDraft(nextFull);
      setResult((prev) =>
        prev ?
          {
            ...prev,
            voiceoverFullText: nextFull,
            voiceoverParagraphs: json.voiceoverParagraphs ?? prev.voiceoverParagraphs,
          }
        : null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "润色失败");
    } finally {
      setPolishBusy(false);
    }
  };

  const runRegenerateFromVoiceover = async () => {
    if (!result?.sceneSkeleton?.length) return;
    const snap: StoryboardSpineSnapshot = {
      hook: result.hook,
      timeline: result.timeline,
      sceneSkeleton: result.sceneSkeleton,
      factNotes: result.factNotes,
      complianceNote: result.complianceNote ?? null,
    };
    setLoading(true);
    setError(null);
    resetAssets();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          subject,
          dynasty: dynasty || undefined,
          tone,
          stylePreset,
          videoDurationMin,
          storyboardChunkMode,
          spineSnapshot: snap,
          voiceoverFullTextOverride: voiceoverDraft.trim(),
        }),
      });
      const json = (await res.json()) as GenerationResult | { error?: string };
      if (!res.ok) {
        setError(
          "error" in json && json.error
            ? String(json.error)
            : "重新生成分镜失败",
        );
        return;
      }
      const gen = json as GenerationResult;
      setResult(gen);
      setVoiceoverDraft(gen.voiceoverFullText ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  const resolveReferenceForScene = useCallback(
    (
      sceneIndex: number,
      urlByIndex: Record<number, string>,
      snapshot: Record<number, AssetRow>,
      /** 独立封面底图 URL；缺省时仍可退回镜 1 已出图（兼容旧流程） */
      standaloneCoverUrl: string | null,
    ): { referenceImageUrl?: string; referenceRole?: "previous" | "cover" } => {
      if (sceneIndex <= 1) return {};
      const prevUrl = urlByIndex[sceneIndex - 1];
      if (prevUrl) {
        return { referenceImageUrl: prevUrl, referenceRole: "previous" };
      }
      const coverFallback = standaloneCoverUrl ?? urlByIndex[1];
      if (coverFallback) {
        return { referenceImageUrl: coverFallback, referenceRole: "cover" };
      }
      const prevRow = snapshot[sceneIndex - 1];
      if (prevRow?.status === "success" && prevRow.url) {
        return { referenceImageUrl: prevRow.url, referenceRole: "previous" };
      }
      const coverRow = snapshot[1];
      if (coverRow?.status === "success" && coverRow.url) {
        return { referenceImageUrl: coverRow.url, referenceRole: "cover" };
      }
      return {};
    },
    [],
  );

  const runSingleAsset = async (
    sceneIndex: number,
    visual: string,
    narration: string | undefined,
    ref?: { referenceImageUrl?: string; referenceRole?: "previous" | "cover" },
  ): Promise<{ success: boolean; url?: string }> => {
    setAssets((prev) => ({
      ...prev,
      [sceneIndex]: {
        ...prev[sceneIndex],
        sceneIndex,
        status: "running",
        approved: prev[sceneIndex]?.approved,
        videoStatus: undefined,
        videoUrl: undefined,
        videoError: undefined,
        videoProvider: undefined,
      },
    }));
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex,
          visualDescription: visual,
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          narration: narration?.trim() || undefined,
          stylePreset,
          projectSeed,
          imageProfileId: imageProfileId || undefined,
          subject: subject.trim() || undefined,
          dynasty: dynasty.trim() || undefined,
          referenceImageUrl: ref?.referenceImageUrl,
          referenceRole: ref?.referenceRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAssets((prev) => ({
          ...prev,
          [sceneIndex]: {
            ...prev[sceneIndex],
            sceneIndex,
            status: "failed",
            error: json.error ?? "失败",
            approved: prev[sceneIndex]?.approved,
          },
        }));
        return { success: false };
      }
      const url = json.url as string;
      setAssets((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          sceneIndex,
          status: "success",
          url,
          provider: json.provider as string | undefined,
          approved: prev[sceneIndex]?.approved ?? true,
        },
      }));

      return { success: true, url };
    } catch (e) {
      setAssets((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          sceneIndex,
          status: "failed",
          error: e instanceof Error ? e.message : "失败",
          approved: prev[sceneIndex]?.approved,
        },
      }));
      return { success: false };
    }
  };

  const runSingleVideo = async (
    sceneIndex: number,
    imageUrl: string,
    prompt: string,
  ) => {
    setAssets((prev) => {
      const cur = prev[sceneIndex] ?? { sceneIndex, status: "idle" as const };
      return {
        ...prev,
        [sceneIndex]: {
          ...cur,
          sceneIndex,
          videoStatus: "running",
          videoError: undefined,
        },
      };
    });
    try {
      const res = await fetch("/api/video-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex,
          imageUrl,
          prompt,
          videoProfileId: videoProfileId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAssets((prev) => ({
          ...prev,
          [sceneIndex]: {
            ...prev[sceneIndex],
            sceneIndex,
            videoStatus: "failed",
            videoError: (json as { error?: string }).error ?? "失败",
          },
        }));
        return;
      }
      setAssets((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          sceneIndex,
          videoStatus: "success",
          videoUrl: json.url as string,
          videoProvider: json.provider as string | undefined,
        },
      }));
    } catch (e) {
      setAssets((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          sceneIndex,
          videoStatus: "failed",
          videoError: e instanceof Error ? e.message : "失败",
        },
      }));
    }
  };

  const handleDeleteSingleCover = useCallback(async (id: string) => {
    const item = coverGallery.find((g) => g.id === id);
    if (!item) return;
    setCoverDeleteBusy(true);
    setError(null);
    try {
      const rp = item.savedRelativePath?.trim();
      if (rp) {
        const res = await fetch("/api/delete-slice-export-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relativePath: rp }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? `删除失败：${rp}`);
        }
      }
      setCoverGallery((prev) => {
        const remaining = prev.filter((g) => g.id !== id);
        // 如果删除的是选中的封面，自动选中第一张剩余封面
        if (selectedCoverId === id) {
          setSelectedCoverId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
    } finally {
      setCoverDeleteBusy(false);
    }
  }, [coverGallery, selectedCoverId]);


  const runStandaloneCoverRequest = async (
    referenceImageUrl?: string | null,
  ): Promise<boolean> => {
    if (!canGenerateStandaloneCover) {
      setError(
        "请先填写人物，并至少填写系列名、切片标题或切片说明之一。",
      );
      return false;
    }
    if (coverGallery.length >= MAX_COVER_GALLERY) {
      setError(
        `已有 ${MAX_COVER_GALLERY} 张封面预览。请先勾选要移除的缩略图，点击下方「删除已勾选」，将同步删除 slice-exports 内已保存的图片后再生成新的封面。`,
      );
      return false;
    }
    setCoverRequest({ status: "running" });
    setError(null);
    setSliceSaveHint(null);
    try {
      const refTrim = referenceImageUrl?.trim() ?? "";
      const seedForApi =
        refTrim ?
          `${projectSeed}-ref-${Date.now().toString(36)}`
            .replace(/\s+/g, "-")
            .slice(0, 64)
        : projectSeed;
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex: 0,
          standaloneCover: true,
          visualDescription: "—",
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          stylePreset,
          projectSeed: seedForApi,
          imageProfileId: imageProfileId || undefined,
          subject: subject.trim() || undefined,
          dynasty: dynasty.trim() || undefined,
          ...(refTrim ?
            { referenceImageUrl: refTrim, referenceRole: "cover" as const }
          : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCoverRequest({
          status: "failed",
          error: String(json.error ?? "失败"),
        });
        return false;
      }
      const coverUrl = json.url as string;
      const seedForFile =
        typeof (json as { projectSeed?: string }).projectSeed === "string" &&
        (json as { projectSeed: string }).projectSeed.trim() ?
          (json as { projectSeed: string }).projectSeed.trim()
        : seedForApi;

      const gid =
        typeof crypto !== "undefined" && "randomUUID" in crypto ?
          crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setCoverGallery((prev) => [
        {
          id: gid,
          url: coverUrl,
          provider: json.provider as string | undefined,
        },
        ...prev,
      ]);
      setSelectedCoverId(gid);
      setCoverRequest({ status: "idle" });

      void (async () => {
        try {
          const saveRes = await fetch("/api/save-slice-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageUrl: coverUrl,
              subject: subject.trim(),
              title: sliceFolderTitle,
              role: "cover",
              fileStem: seedForFile,
            }),
          });
          const saveJson = (await saveRes.json()) as {
            error?: string;
            relativePath?: string;
          };
          if (!saveRes.ok) {
            setSliceSaveHint(
              `封面已生成；自动保存失败：${saveJson.error ?? saveRes.status}（可再点「生成封面底图」重试，或使用下方「导出资源」）`,
            );
            return;
          }
          const rp = saveJson.relativePath;

          if (rp) {
            setCoverGallery((prev) =>
              prev.map((x) =>
                x.id === gid ? { ...x, savedRelativePath: rp } : x,
              ),
            );
          }
        } catch (e) {
          setSliceSaveHint(
            e instanceof Error ?
              `封面已生成；自动保存失败：${e.message}（可再点「生成封面底图」重试，或使用「导出资源」）`
            : "封面已生成；自动保存失败（可再点「生成封面底图」重试，或使用「导出资源」）",
          );
        }
      })();

      return true;
    } catch (e) {
      setCoverRequest({
        status: "failed",
        error: e instanceof Error ? e.message : "失败",
      });
      return false;
    }
  };

  const runAllAssets = async () => {
    if (!result?.scenes.length) return;
    setBatchBusy(true);
    setError(null);
    stopBatchRef.current = false;
    try {
      const ordered = [...result.scenes].sort((a, b) => a.index - b.index);
      const urlByIndex: Record<number, string> = {};
      const standaloneU = latestCoverUrl;
      for (const s of ordered) {
        if (stopBatchRef.current) break;
        const ref = resolveReferenceForScene(
          s.index,
          urlByIndex,
          assets,
          standaloneU,
        );
        const out = await runSingleAsset(
          s.index,
          s.visualDescription,
          s.narration,
          ref,
        );
        if (out.success && out.url) {
          urlByIndex[s.index] = out.url;
        }
        if (stopBatchRef.current) break;
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const runCoverOnly = async () => {
    setBatchBusy(true);
    setError(null);
    try {
      await runStandaloneCoverRequest(undefined);
    } finally {
      setBatchBusy(false);
    }
  };

  const onCoverReferenceFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!imageProfileSupportsCoverReference) {
      setError(
        "按参考图重生需要文生图档案为通义万相或火山 Seedream（支持图生图）。请在页顶切换档案。",
      );
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }
    if (f.size > MAX_COVER_REFERENCE_FILE_BYTES) {
      setError("参考图请小于 20MB（与 Remit.ee 图床限制一致）。");
      return;
    }

    setBatchBusy(true);
    setError(null);
    setCoverRequest({ status: "running" });

    try {
      // 1. 后端代理上传到 Remit.ee，得到公网 HTTPS 参考图 URL
      const arrayBuffer = await f.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const uploadRes = await fetch("/api/upload-reference-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: f.name,
          mimeType: f.type,
          fileSize: f.size,
          fileData: base64,
        }),
      });

      const uploadJson = await uploadRes.json();

      if (!uploadRes.ok) {
        setCoverRequest({ status: "failed", error: uploadJson.error || "上传到图床失败" });
        return;
      }

      // 2. 使用图床 URL 作为参考图生成封面
      await runStandaloneCoverRequest(uploadJson.url);

    } catch (err) {
      setCoverRequest({ status: "failed", error: err instanceof Error ? err.message : "上传失败" });
    } finally {
      setBatchBusy(false);
    }
  };

  /** 镜号 ≥2 每镜均以同一封面为图生图参考（强锁脸；场面跳变大单镜改「按切片内容生成」） */
  const runRemainingAssetsFromCover = async () => {
    if (!result?.scenes.length) return;
    const coverUrl = latestCoverUrl;
    if (!coverUrl) {
      setError("请先在上方成功生成「封面底图」，再按封面批量生成镜头。");
      return;
    }
    setBatchBusy(true);
    setError(null);
    stopBatchRef.current = false;
    try {
      const ordered = [...result.scenes]
        .filter((s) => s.index > 1)
        .sort((a, b) => a.index - b.index);
      const urlByIndex: Record<number, string> = {};
      const coverRef = {
        referenceImageUrl: coverUrl,
        referenceRole: "cover" as const,
      };
      for (const s of ordered) {
        if (stopBatchRef.current) break;
        const out = await runSingleAsset(
          s.index,
          s.visualDescription,
          s.narration,
          coverRef,
        );
        if (out.success && out.url) {
          urlByIndex[s.index] = out.url;
        }
        if (stopBatchRef.current) break;
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const toggleApproved = (sceneIndex: number) => {
    setAssets((prev) => {
      const cur = prev[sceneIndex];
      if (!cur) {
        return {
          ...prev,
          [sceneIndex]: {
            sceneIndex,
            status: "idle",
            approved: true,
          },
        };
      }
      return {
        ...prev,
        [sceneIndex]: { ...cur, approved: !cur.approved },
      };
    });
  };

  return (
    <div
      className="w-full space-y-10"
      data-studio-vertical={ACTIVE_STUDIO_VERTICAL}
    >
      <section className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-xl shadow-black/25 ring-1 ring-zinc-800/40">
        <header className="border-b border-zinc-800/80 bg-gradient-to-br from-zinc-900/90 via-zinc-950/80 to-zinc-950 px-5 py-5 sm:px-6">
          <div className="min-w-0 w-full">
            <div className={headerModelsPanelClass}>
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-800/50 pb-2.5">
                  <span className="text-[11px] font-medium text-zinc-400">
                    模型与媒体
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    绿点表示已读到密钥
                  </span>
                </div>
                <div className="space-y-5 xl:flex xl:flex-row xl:items-stretch xl:gap-0 xl:space-y-0">
                  {!profilesError ? (
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className={headerApiGroupClass}>文案 / 分镜</span>
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            selectedProfile?.configured
                              ? "bg-emerald-500/85 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                              : "bg-amber-600/50"
                          }`}
                          title={
                            selectedProfile?.configured
                              ? "当前档案密钥已配置"
                              : "当前档案未检测到密钥"
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,7.75rem)_1fr] sm:gap-3">
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>厂商</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={selectedVendor}
                            disabled={!vendorsOrdered.length}
                            onChange={(e) =>
                              setVendorAndDefaultProfile(e.target.value)
                            }
                          >
                            {vendorsOrdered.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>模型档案</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={profileId}
                            disabled={!modelsInVendor.length}
                            onChange={(e) => setProfileId(e.target.value)}
                          >
                            {modelsInVendor.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}（{p.model}
                                {p.configured ? "" : " · 未配置密钥"}）
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {!mediaProfilesError && imageProfiles.length ? (
                    <div
                      className={`min-w-0 flex-1 border-t border-zinc-800/50 pt-4 xl:border-t-0 xl:pt-0 ${
                        !profilesError
                          ? "xl:border-l xl:border-zinc-800/50 xl:pl-6"
                          : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className={headerApiGroupClass}>文生图</span>
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            selectedImageProfile?.configured
                              ? "bg-emerald-500/85 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                              : "bg-amber-600/50"
                          }`}
                          title={
                            selectedImageProfile?.configured
                              ? "当前档案密钥已配置"
                              : "当前档案未检测到密钥"
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,7.75rem)_1fr] sm:gap-3">
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>厂商</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={selectedImageVendor}
                            disabled={!imageVendorsOrdered.length}
                            onChange={(e) =>
                              setImageVendorAndDefaultProfile(e.target.value)
                            }
                          >
                            {imageVendorsOrdered.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>档案</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={imageProfileId}
                            disabled={!modelsInImageVendor.length}
                            onChange={(e) => setImageProfileId(e.target.value)}
                          >
                            {modelsInImageVendor.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}（
                                {[p.modelLine, p.driver]
                                  .filter(Boolean)
                                  .join(" · ")}
                                {p.configured ? "" : " · 未配置密钥"}）
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {!mediaProfilesError && videoProfiles.length ? (
                    <div
                      className={`min-w-0 flex-1 border-t border-zinc-800/50 pt-4 xl:border-t-0 xl:pt-0 ${
                        !profilesError || imageProfiles.length > 0
                          ? "xl:border-l xl:border-zinc-800/50 xl:pl-6"
                          : ""
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className={headerApiGroupClass}>图生视频</span>
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            selectedVideoProfile?.configured
                              ? "bg-emerald-500/85 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                              : "bg-amber-600/50"
                          }`}
                          title={
                            selectedVideoProfile?.configured
                              ? "当前档案密钥已配置"
                              : "当前档案未检测到密钥"
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,7.75rem)_1fr] sm:gap-3">
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>厂商</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={selectedVideoVendor}
                            disabled={!videoVendorsOrdered.length}
                            onChange={(e) =>
                              setVideoVendorAndDefaultProfile(e.target.value)
                            }
                          >
                            {videoVendorsOrdered.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block min-w-0">
                          <span className={groupTitleClass}>档案</span>
                          <select
                            className={`${headerSelectClass} mt-1 cursor-pointer`}
                            value={videoProfileId}
                            disabled={!modelsInVideoVendor.length}
                            onChange={(e) => setVideoProfileId(e.target.value)}
                          >
                            {modelsInVideoVendor.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}（{p.model}
                                {p.configured ? "" : " · 未配置密钥"}）
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
            </div>
          </div>
          <ol className="mt-5 flex flex-wrap gap-2">
            {workflowSteps.map((s) => (
              <li
                key={s.n}
                className="flex min-w-0 items-baseline gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
              >
                <span className="font-mono text-[10px] font-bold text-amber-500/90">
                  {s.n}
                </span>
                <span className="text-[11px] font-medium text-zinc-300">
                  {s.label}
                </span>
                <span className="hidden text-[10px] text-zinc-600 sm:inline">
                  · {s.desc}
                </span>
              </li>
            ))}
          </ol>
        </header>

        <div className="space-y-8 p-5 sm:p-8">
          {profilesError ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
              模型配置：{profilesError}
            </p>
          ) : null}
          {mediaProfilesError ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
              媒体模型配置：{mediaProfilesError}
            </p>
          ) : null}

          <div className={`${panelClass} border-l-2 border-l-amber-500/35`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className={sectionLabelClass}>系列与人物 · 步骤 1</p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <section className={stepInnerCardClass} aria-label="系列">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <h3 className={stepBlockTitleClass}>系列名称</h3>
                  <span className="text-[11px] text-zinc-600">
                    预设或自拟 · AI 单次生成并填入
                  </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:gap-6">
                  <label className="block min-w-0">
                    <span className={groupTitleClass}>强冲突预设</span>
                    <select
                      className={`${fieldClass} mt-1.5 cursor-pointer`}
                      value={
                        THEME_TITLE_PRESETS.includes(seriesTitle)
                          ? seriesTitle
                          : ""
                      }
                      onChange={(e) => {
                        setSeriesTitle(e.target.value);
                      }}
                    >
                      <option value="">请选择</option>
                      {THEME_TITLE_PRESETS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="min-w-0">
                    <span className={groupTitleClass}>
                      当前系列名 · 自拟或 AI
                    </span>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
                      <input
                        className={`${fieldClass} min-w-0 flex-1`}
                        placeholder="选预设填入，或右侧一键生成单行系列名"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        maxLength={120}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        disabled={seriesAiBusy}
                        onClick={() => void runSuggestSeriesNames()}
                        className={`${aiActionClass} w-full sm:w-auto sm:shrink-0`}
                      >
                        {seriesAiBusy ? "生成中…" : "AI 生成系列名"}
                      </button>
                    </div>
                  </div>
                </div>

                {seriesAiError ? (
                  <p className="mt-3 rounded-lg border border-rose-900/45 bg-rose-950/25 px-3 py-2 text-xs leading-relaxed text-rose-100/95">
                    {seriesAiError}
                  </p>
                ) : null}
                {seriesAiDirectionHint && !seriesAiError ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    本次生成侧重：{seriesAiDirectionHint}
                  </p>
                ) : null}
              </section>

              <section className={stepInnerCardClass} aria-label="人物">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className={stepBlockTitleClass}>人物与背景</h3>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      先填系列名再推荐；点击-chip 填入人物栏。
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={suggestCharsBusy || !seriesTitle.trim()}
                    onClick={runSuggestCharacters}
                    className={`${aiActionClass} w-full sm:w-auto sm:shrink-0`}
                  >
                    {suggestCharsBusy ? "推荐中…" : "AI 推荐相关人物"}
                  </button>
                </div>
                {charsHint ? (
                  <p className="mb-4 rounded-xl border border-rose-900/45 bg-rose-950/25 px-3 py-2.5 text-xs leading-relaxed text-rose-100/95">
                    {charsHint}
                  </p>
                ) : null}
                {characterSuggestions.length > 0 ? (
                  <div className="mb-5">
                    <p className="mb-2 text-[11px] font-medium text-zinc-500">
                      点击填入人物栏
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {characterSuggestions.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            onClick={() => setSubject(name)}
                            className="w-full rounded-xl border border-zinc-700/90 bg-zinc-900/60 px-3 py-2.5 text-left text-xs text-zinc-200 transition hover:border-amber-600/45 hover:bg-zinc-900 hover:text-amber-100/90"
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="grid gap-4 border-t border-zinc-800/50 pt-5 sm:grid-cols-2 sm:gap-5">
                  <label className="block min-w-0">
                    <span className={groupTitleClass}>
                      人物 / 地点 / 对象{" "}
                      <span className="text-amber-600/90">*</span>
                    </span>
                    <input
                      className={`${fieldClass} mt-1.5`}
                      placeholder="如：曹操（可先点上方推荐）"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={groupTitleClass}>
                      朝代 / 背景{" "}
                      <span className="font-normal text-zinc-600">（选填）</span>
                    </span>
                    <input
                      className={`${fieldClass} mt-1.5`}
                      placeholder="如：东汉末 / 唐 · 不填由模型推断"
                      value={dynasty}
                      onChange={(e) => setDynasty(e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className={stepInnerCardClass} aria-label="峰值切片">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
                  <div className="min-w-0 flex-1">
                    <h3 className={stepBlockTitleClass}>峰值切片策划</h3>
                    <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
                      每条建议为
                      <strong className="font-medium text-zinc-500">
                        单一高峰时刻或关键抉择
                      </strong>
                      （非生平）；标题偏传播，
                      <strong className="font-medium text-zinc-500">
                        问句或数字对比
                      </strong>
                      可多选尝试。说明里应有
                      <strong className="font-medium text-zinc-500">
                        冲突与赌注（stakes）
                      </strong>
                      。点选后在步骤 2 可继续编辑正文。
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      suggestSlicesBusy || !seriesTitle.trim() || !subject.trim()
                    }
                    onClick={runSuggestSubtitles}
                    className={`${aiActionClass} w-full shrink-0 lg:w-auto`}
                  >
                    {suggestSlicesBusy ? "推荐中…" : "AI 推荐切片标题"}
                  </button>
                </div>
                {slicesHint ? (
                  <p className="mt-1 rounded-xl border border-rose-900/45 bg-rose-950/25 px-3 py-2.5 text-xs leading-relaxed text-rose-100/95">
                    {slicesHint}
                  </p>
                ) : null}
                {sliceSuggestions.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-medium text-zinc-500">
                      点击填入峰值切口（标题 + 说明，步骤 2 可改）
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sliceSuggestions.map((s, i) => (
                        <li key={`${s.title}-${i}`}>
                          <button
                            type="button"
                            onClick={() => applySuggestion(s)}
                            className="flex h-full w-full flex-col rounded-lg border border-zinc-700/90 bg-zinc-900/50 p-3 text-left transition hover:border-amber-600/50 hover:bg-zinc-900/90"
                          >
                            <span className="text-sm font-medium leading-snug text-amber-100/90">
                              {s.title}
                            </span>
                            <span className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                              {s.angle}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <div className={`${panelClass} border-l-2 border-l-amber-600/25`}>
            <div>
              <p className={sectionLabelClass}>高光切片 · 步骤 2</p>
            </div>

            <div className="mt-5 grid gap-4 border-t border-zinc-800/80 pt-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={groupTitleClass}>切片标题</span>
                <input
                  className={`${fieldClass} mt-1.5`}
                  placeholder="如：离皇位最近却不敢坐的人"
                  value={sliceTitle}
                  onChange={(e) => setSliceTitle(e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={groupTitleClass}>切片说明（切片命题）</span>
                <textarea
                  rows={3}
                  className={`${fieldClass} mt-1.5 min-h-[5.5rem] resize-y`}
                  placeholder="1～3 句正面写「讲什么」：一个高光或争议的冲突/行动/后果；不必写「不讲什么」。"
                  value={sliceAngle}
                  onChange={(e) => setSliceAngle(e.target.value)}
                />
              </label>
            </div>
            {(sliceTitle.trim() || sliceAngle.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSliceTitle("");
                  setSliceAngle("");
                  setSliceSuggestions([]);
                  setSlicesHint(null);
                }}
                className="mt-3 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-400 hover:underline"
              >
                清除切片标题
              </button>
            )}
          </div>

          <div
            className={`${panelClass} border-l-2 border-l-emerald-600/35`}
          >
            <div className="min-w-0">
              <p className={sectionLabelClass}>步骤 3 · 生成封面图</p>

              {!mediaProfilesError &&
              imageProfiles.length > 0 &&
              !selectedImageProfile?.configured ? (
                <p className="mt-3 max-w-xl rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100/90">
                  当前文生图档案未检测到密钥，封面请求可能失败。请在页顶更换已配置的静帧档案。
                </p>
              ) : null}
              {selectedImageProfile &&
              selectedImageProfile.configured &&
              !imageProfileSupportsCoverReference ? (
                <p className="mt-3 max-w-2xl rounded-lg border border-zinc-700/55 bg-zinc-900/40 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                  「按参考图重生」依赖图生图：当前档案为纯文生图，无法使用上传或列表图作参考；请切换到「通义万相」或「火山
                  Seedream」等已在配置中支持参考图的档案。
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex flex-col gap-4 border-t border-zinc-800/70 pt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
              <label className="block min-w-0 flex-1 sm:max-w-md">
                <span className={groupTitleClass}>
                  画风预设（写入分镜描述）
                </span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  value={stylePreset}
                  onChange={(e) =>
                    setStylePreset(e.target.value as StylePreset)
                  }
                >
                  {STYLE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:min-w-0 sm:flex-row sm:flex-wrap sm:justify-end">
                <input
                  ref={coverRefFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-hidden
                  onChange={onCoverReferenceFileChange}
                />
                <button
                  type="button"
                  disabled={
                    batchBusy ||
                    !canGenerateStandaloneCover ||
                    coverGallery.length >= MAX_COVER_GALLERY
                  }
                  title={
                    coverGallery.length >= MAX_COVER_GALLERY ?
                      `已达 ${MAX_COVER_GALLERY} 张上限，请先勾选并删除若干封面后再生成`
                    : undefined
                  }
                  onClick={() => void runCoverOnly()}
                  className={`${aiActionClass} w-full shrink-0 sm:w-auto`}
                >
                  {coverRequest.status === "running" ?
                    "封面生成中…"
                  : "生成封面底图"}
                </button>
                <button
                  type="button"
                  disabled={
                    batchBusy ||
                    !canGenerateStandaloneCover ||
                    coverGallery.length >= MAX_COVER_GALLERY ||
                    !imageProfileSupportsCoverReference
                  }
                  title={
                    !imageProfileSupportsCoverReference ?
                      "当前文生图档案不支持参考图（需通义万相或火山 Seedream）"
                    : coverGallery.length >= MAX_COVER_GALLERY ?
                      `已达 ${MAX_COVER_GALLERY} 张上限`
                    : "从本地上传图片到云存储，作为参考图重生封面"
                  }
                  onClick={() => coverRefFileInputRef.current?.click()}
                  className={`${aiActionClass} w-full shrink-0 sm:w-auto`}
                >
                  按参考图重生
                </button>
              </div>
            </div>
            <div className="mt-5 border-t border-zinc-800/70 pt-5">
              {coverGallery.length >= MAX_COVER_GALLERY &&
              coverRequest.status !== "running" ? (
                <p className="mb-3 max-w-2xl rounded-lg border border-amber-900/45 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-100/95">
                  已满 {MAX_COVER_GALLERY}{" "}
                  张。请勾选需移除的封面，点击下方「删除已勾选」清空名额；若该张已成功自动保存至项目目录，将同步删除磁盘上的对应文件。
                </p>
              ) : null}
              {coverGallery.length === 0 && coverRequest.status !== "running" ? (
                <p className="text-[11px] text-zinc-600">尚未生成封面预览。</p>
              ) : null}
              {coverRequest.status === "running" ? (
                <p className="text-[11px] text-amber-200/80">正在请求封面…</p>
              ) : null}
              {coverRequest.status === "failed" && coverRequest.error ? (
                <p className="text-sm text-rose-200">{coverRequest.error}</p>
              ) : null}
              {coverGallery.length > 0 ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {coverGallery.map((item, idx) => {
                      const isSelected = item.id === selectedCoverId;
                      return (
                        <div
                          key={item.id}
                          className={`flex max-w-[11rem] flex-col gap-1 rounded-lg p-1.5 ring-1 ${
                            isSelected
                              ? "bg-emerald-950/40 ring-emerald-600/50"
                              : "bg-zinc-950/35 ring-zinc-800/60"
                          }`}
                        >
                          <span
                            className={
                              idx === 0 ?
                                "text-[10px] font-medium text-emerald-400/90"
                              : "text-[10px] text-zinc-500"
                            }
                          >
                            {idx === 0 ? "最新" : `#${idx + 1}`}
                            {item.savedRelativePath ?
                              <span className="font-normal text-zinc-600">
                                {" "}
                                · 已落盘
                              </span>
                            : <span className="font-normal text-zinc-600">
                                {" "}
                                · 仅预览
                              </span>}
                          </span>
                          <div className="overflow-hidden rounded-xl bg-black/40 ring-1 ring-zinc-800/90">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={
                                idx === 0 ?
                                  "封面底图（最新）"
                                : "历史封面底图"
                              }
                              className="aspect-[9/16] w-full object-cover"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            {!isSelected && (
                              <button
                                type="button"
                                disabled={batchBusy || coverDeleteBusy}
                                title="设为此封面为按封面批量生成镜头的参考图"
                                onClick={() => setSelectedCoverId(item.id)}
                                className="w-full rounded-md border border-amber-800/45 bg-amber-950/25 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-amber-100/95 transition hover:border-amber-600/55 hover:bg-amber-900/35 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                设为参考图
                              </button>
                            )}
                            {isSelected && coverGallery.length > 1 && (
                              <button
                                type="button"
                                disabled={batchBusy || coverDeleteBusy}
                                title="取消参考图"
                                onClick={() => setSelectedCoverId(null)}
                                className="w-full rounded-md border border-emerald-800/45 bg-emerald-950/25 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-emerald-100/95 transition hover:border-emerald-600/55 hover:bg-emerald-900/35 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                取消参考
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={batchBusy || coverDeleteBusy}
                              title="删除此封面"
                              onClick={() => void handleDeleteSingleCover(item.id)}
                              className="w-full rounded-md border border-rose-800/45 bg-rose-950/25 px-2 py-1.5 text-center text-[10px] font-semibold leading-tight text-rose-100/95 transition hover:border-rose-600/55 hover:bg-rose-900/35 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <footer className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 px-4 py-5 sm:px-5">
            <p className={sectionLabelClass}>步骤 4 · 生成文案与分镜</p>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-500">
              先设成片时长、扩写切段与叙事基调。选「三步」时叙事骨架与整稿口播分两请求；「两步」一次拿整稿再确认分镜；「一步」直接出分镜表。完成后在下方批量出静帧与图生视频。
            </p>
            <div className="mt-4 grid gap-4 border-t border-zinc-800/70 pt-4 sm:grid-cols-3">
              <label className="block min-w-0">
                <span className={groupTitleClass}>成片时长</span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  value={videoDurationMin}
                  onChange={(e) =>
                    setVideoDurationMin(
                      Number(e.target.value) as VideoDurationMin,
                    )
                  }
                >
                  {VIDEO_DURATION_UI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={groupTitleClass}>分镜扩写切段</span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  value={storyboardChunkMode}
                  onChange={(e) =>
                    setStoryboardChunkMode(
                      e.target.value as StoryboardChunkMode,
                    )
                  }
                >
                  {STORYBOARD_CHUNK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={groupTitleClass}>叙事基调</span>
                <select
                  className={`${fieldClass} mt-1.5`}
                  value={tone}
                  onChange={(e) => setTone(e.target.value as Tone)}
                >
                  <option value="narrative">
                    叙事向（反差与悬念可适当放大）
                  </option>
                  <option value="serious">
                    严肃科普（强调出处与限定语）
                  </option>
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className={groupTitleClass}>生成节奏</span>
              <select
                className={`${fieldClass} mt-1.5 max-w-xl`}
                value={generationPacing}
                onChange={(e) =>
                  setGenerationPacing(
                    e.target.value as "three-step" | "two-step" | "one-step",
                  )
                }
              >
                <option value="three-step">
                  三步：叙事骨架（L1）→ 整稿口播（L2）→ 分镜（L3），推荐
                </option>
                <option value="two-step">
                  两步：叙事骨架+整稿一次完成 → 再分镜（L3）
                </option>
                <option value="one-step">一步：文案与分镜一次完成</option>
              </select>
            </label>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  if (
                    generationPacing === "three-step" &&
                    result?.pipelinePending === "voiceover"
                  ) {
                    void runGenerateVoiceoverOnly();
                  } else {
                    void runGenerate();
                  }
                }}
                disabled={
                  loading ||
                  polishBusy ||
                  !subject.trim() ||
                  (result?.pipelinePending === "scenes" &&
                    (generationPacing === "three-step" ||
                      generationPacing === "two-step"))
                }
                className="inline-flex min-h-[3rem] min-w-[12rem] items-center justify-center rounded-xl bg-amber-500 px-8 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-950/30 ring-1 ring-amber-400/25 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {loading ?
                  "生成中…"
                : result?.pipelinePending === "scenes" &&
                    (generationPacing === "three-step" ||
                      generationPacing === "two-step") ?
                  "下一步：整稿区「生成分镜」"
                : generationPacing === "three-step" &&
                    result?.pipelinePending === "voiceover" ?
                  "生成整稿口播（L2）"
                : generationPacing === "three-step" ?
                  "生成叙事骨架（L1）"
                : generationPacing === "two-step" ?
                  "生成叙事骨架与整稿口播"
                : "生成文案与分镜（一步完成）"}
              </button>
            </div>
          </footer>

          {error ? (
            <p className="rounded-xl border border-rose-900/55 bg-rose-950/35 px-4 py-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {result && (
        <>
          <section className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-0 shadow-xl shadow-black/20 ring-1 ring-zinc-800/35">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/30 px-5 py-3 sm:px-6">
              <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setNarrativeSkeletonPanelExpanded((v) => !v)}
                  className="mt-0.5 shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800/85 hover:text-zinc-200"
                  aria-expanded={narrativeSkeletonPanelExpanded}
                  aria-controls="historai-narrative-skeleton-panel-body"
                  title={
                    narrativeSkeletonPanelExpanded ?
                      "收起 L1 叙事骨架"
                    : "展开 L1 叙事骨架"
                  }
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                    className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                      narrativeSkeletonPanelExpanded ? "rotate-0" : "-rotate-90"
                    }`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-medium text-amber-100/95">
                    黄金开头、时间线与分镜骨架
                  </h2>
                  <p className="mt-0.5 text-[11px] text-zinc-500">L1 叙事骨架</p>
                  {!narrativeSkeletonPanelExpanded && result.hook ?
                    <p className="mt-2 line-clamp-2 text-sm leading-snug text-zinc-400">
                      {result.hook}
                    </p>
                  : null}
                </div>
              </div>
              <span className="rounded-full bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-500">
                来源：
                {result.llmProfile
                  ? `${result.llmProfile.vendor} · ${result.llmProfile.model}`
                  : "大模型"}
              </span>
            </div>
            {narrativeSkeletonPanelExpanded ?
              <div
                id="historai-narrative-skeleton-panel-body"
                className="p-5 sm:p-6"
              >
                <p className="text-lg font-medium leading-relaxed text-zinc-100 sm:text-xl">
                  {result.hook}
                </p>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setNarrativeTimelineExpanded((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-lg py-2 pl-0 pr-2 text-left transition hover:bg-zinc-800/40"
                    aria-expanded={narrativeTimelineExpanded}
                    aria-controls="historai-l1-timeline"
                  >
                    <span className="shrink-0 rounded-lg p-1 text-zinc-500">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                        className={`h-4 w-4 transition-transform duration-200 ${
                          narrativeTimelineExpanded ? "rotate-0" : "-rotate-90"
                        }`}
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-amber-100/90">
                      时间线
                    </span>
                    <span className="text-xs text-zinc-500">
                      共 {result.timeline.length} 段
                    </span>
                  </button>
                  {narrativeTimelineExpanded ?
                    <ol
                      id="historai-l1-timeline"
                      className="mt-4 space-y-4"
                    >
                      {result.timeline.map((t, i) => (
                        <li
                          key={i}
                          className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4"
                        >
                          {t.label && (
                            <p className="text-xs font-medium uppercase tracking-wide text-amber-200/80">
                              {t.label}
                            </p>
                          )}
                          <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                            {t.text}
                          </p>
                          {t.sources?.length ?
                            <p className="mt-2 text-xs text-zinc-500">
                              参考：{t.sources.join("；")}
                            </p>
                          : null}
                        </li>
                      ))}
                    </ol>
                  : null}
                </div>

                {result.sceneSkeleton && result.sceneSkeleton.length > 0 ?
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setNarrativeSceneSkeletonExpanded((v) => !v)}
                      className="flex w-full items-center gap-2 rounded-lg py-2 pl-0 pr-2 text-left transition hover:bg-zinc-800/40"
                      aria-expanded={narrativeSceneSkeletonExpanded}
                      aria-controls="historai-l1-scene-skeleton"
                    >
                      <span className="shrink-0 rounded-lg p-1 text-zinc-500">
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden
                          className={`h-4 w-4 transition-transform duration-200 ${
                            narrativeSceneSkeletonExpanded ? "rotate-0" : "-rotate-90"
                          }`}
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <span className="text-sm font-semibold text-amber-100/90">
                        分镜骨架
                      </span>
                      <span className="text-xs text-zinc-500">
                        共 {result.sceneSkeleton.length} 镜
                      </span>
                    </button>
                    {narrativeSceneSkeletonExpanded ?
                      <ol
                        id="historai-l1-scene-skeleton"
                        className="mt-4 space-y-4"
                      >
                        {result.sceneSkeleton.map((row) => (
                          <li
                            key={row.index}
                            className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4"
                          >
                            <p className="text-xs font-medium uppercase tracking-wide text-amber-200/80">
                              第 {row.index} 镜
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                              {row.beat}
                            </p>
                            <p className="mt-2 text-xs text-zinc-500">
                              目标时长：约 {row.durationSec} 秒
                            </p>
                          </li>
                        ))}
                      </ol>
                    : null}
                  </div>
                : null}
                {result.factNotes?.length ?
                  <div className="mt-6 rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
                    <p className="text-xs font-medium text-amber-200">
                      发布前复核
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/80">
                      {result.factNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                : null}
                {result.complianceNote ?
                  <p className="mt-4 text-sm text-zinc-500">
                    {result.complianceNote}
                  </p>
                : null}
              </div>
            : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-xl shadow-black/20 ring-1 ring-zinc-800/35">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950/30 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <p className={sectionLabelClass}>整稿口播（L2）</p>
                <h2 className="mt-1 font-display text-base font-medium text-amber-100/95">
                  {result.pipelinePending === "voiceover" ?
                    "叙事骨架已定 · 请生成或粘贴整稿口播"
                  : result.pipelinePending === "scenes" ?
                    "请确认口播后再生成分镜"
                  : "顺读主干 · 可编辑后可重出分镜"}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    polishBusy ||
                    loading ||
                    result.pipelinePending === "voiceover" ||
                    !result.sceneSkeleton?.length ||
                    !voiceoverDraft.trim()
                  }
                  onClick={() => void runPolishVoiceover()}
                  title="在不改变史实与人称前提下润色口播；段落条数与镜数一致"
                  className="rounded-lg border border-zinc-600/55 bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-200 shadow-sm transition hover:border-zinc-500/65 hover:bg-zinc-800/90 disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px]"
                >
                  {polishBusy ? "润色中…" : "AI 润色口播"}
                </button>
                <button
                  type="button"
                  disabled={
                    polishBusy ||
                    loading ||
                    !result.sceneSkeleton?.length ||
                    !voiceoverDraft.trim()
                  }
                  onClick={() => void runRegenerateFromVoiceover()}
                  title="保留当前 L1（黄金开头、时间线、分镜骨架），按下方口播生成分镜与画面描述（会清空已出图状态）"
                  className="rounded-lg border border-amber-700/45 bg-amber-500/[0.1] px-3 py-2 text-xs font-semibold text-amber-100 shadow-sm transition hover:border-amber-500/55 hover:bg-amber-500/[0.16] disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px]"
                >
                  {loading ?
                    "请求中…"
                  : result.pipelinePending === "scenes" ?
                    "生成分镜与画面稿"
                  : "按当前口播重出分镜"}
                </button>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              {result.pipelinePending === "voiceover" ? (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-6 text-center text-sm text-zinc-400">
                  尚未生成整稿口播。请点击上方工具栏「
                  <span className="text-amber-200/90">生成整稿口播（L2）</span>
                  」，或在本页底部主按钮执行同一步骤。
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
                    以下为当前口播稿。修改后可「AI 润色」或点击右侧「
                    {result.pipelinePending === "scenes" ?
                      "生成分镜与画面稿"
                    : "按当前口播重出分镜"}
                    」：请在<strong className="text-zinc-400">每镜口播之间留一空行</strong>
                    ，段数须与镜数一致（
                    {result.sceneSkeleton?.length ?? result.scenes.length}{" "}
                    段）。
                  </p>
                  <textarea
                    className={`${fieldClass} min-h-[220px] resize-y font-mono text-[13px] leading-relaxed`}
                    value={voiceoverDraft}
                    onChange={(e) => setVoiceoverDraft(e.target.value)}
                    spellCheck={false}
                    aria-label="整稿口播"
                  />
                </>
              )}
            </div>
          </section>

          {result.pipelinePending === "voiceover" ? (
            <section className="rounded-2xl border border-sky-900/35 bg-sky-950/15 px-5 py-4 sm:px-6">
              <p className="text-sm font-medium text-sky-100/95">
                当前仅有 L1（黄金开头、时间线、分镜骨架），整稿口播待生成。
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-sky-100/75">
                使用上方「生成整稿口播（L2）」或页面底部主按钮，完成后再编辑、润色与扩写分镜。
              </p>
            </section>
          ) : null}

          {result.pipelinePending === "scenes" ? (
            <section className="rounded-2xl border border-amber-900/35 bg-amber-950/15 px-5 py-4 sm:px-6">
              <p className="text-sm font-medium text-amber-100/95">
                当前已有整稿口播，尚未生成分镜表（L3）。
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-amber-100/70">
                确认口播后可「AI 润色」，再点击整稿区「生成分镜与画面稿」；完成后下方会出现分镜表与出图入口。
              </p>
            </section>
          ) : null}

          {result && !result.pipelinePending ? (
          <section className="overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-xl shadow-black/20 ring-1 ring-zinc-800/35">
            <div className="flex flex-col gap-4 border-b border-zinc-800/80 bg-gradient-to-r from-zinc-950/80 via-zinc-950/40 to-zinc-950/80 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className={sectionLabelClass}>步骤 4 · 静帧与成片</p>
                  <h2 className="mt-1 font-display text-lg font-medium tracking-tight text-amber-100/95">
                    分镜与素材
                  </h2>
                  <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-zinc-500">
                    逐镜出图、可选图生视频；批量按钮决定参考策略，单镜可在右侧微调。
                  </p>
                  {sliceSaveHint ? (
                    <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-emerald-200/90">
                      {sliceSaveHint}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:items-end">
                  <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
                    <span className={storyboardOpSectionLabel}>批量出图</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={batchBusy || !latestCoverUrl}
                        onClick={() => void runRemainingAssetsFromCover()}
                        title="每镜均以同一封面为图生图参考，强锁主角样貌；若某镜已是远景、对峙或换视角，该镜请改点「按切片内容生成」，避免构图被封面黏住。"
                        className="min-h-[2.35rem] rounded-lg border border-amber-700/55 bg-amber-500/[0.12] px-3 py-2 text-xs font-semibold text-amber-50 shadow-sm transition hover:border-amber-500/65 hover:bg-amber-500/[0.18] disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px]"
                      >
                        {batchBusy ? "生成中…" : "按封面批量"}
                      </button>
                      <button
                        type="button"
                        disabled={batchBusy || !result?.scenes.length}
                        onClick={runAllAssets}
                        title="按镜序生成：优先以上一镜成片为参考（镜间更连贯）；上一镜未出图时回退封面。若视角或场面跳变大，可对单镜用「按切片内容生成」打断连锁跑偏。"
                        className="min-h-[2.35rem] rounded-lg border border-amber-700/55 bg-amber-500/[0.12] px-3 py-2 text-xs font-semibold text-amber-50 shadow-sm transition hover:border-amber-500/65 hover:bg-amber-500/[0.18] disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px]"
                      >
                        {batchBusy ? "批量生成中…" : "按上一镜批量"}
                      </button>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <button
                      type="button"
                      disabled={
                        exportBundleBusy ||
                        batchBusy ||
                        !canExportSliceBundle
                      }
                      onClick={() => void runExportSliceBundle()}
                      title="增量写入 slice-exports/主角_标题/：manifest.json + 仅补充缺失的静帧/视频；本地已有同 stem 则跳过下载。勾选「强制重新拉取」可从当前 URL 另存新版本（stem-2、stem-3…）。"
                      className="min-h-[2.35rem] rounded-lg border border-emerald-800/50 bg-emerald-950/35 px-3.5 py-2 text-xs font-semibold text-emerald-100/95 shadow-sm transition hover:border-emerald-600/50 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-40 sm:text-[13px]"
                    >
                      {exportBundleBusy ? "导出中…" : "导出资源"}
                    </button>
                    {batchBusy ? (
                      <button
                        type="button"
                        onClick={() => {
                          stopBatchRef.current = true;
                        }}
                        title="停止批量生成，已生成的镜头将保留"
                        className="min-h-[2.35rem] rounded-lg border border-rose-700/55 bg-rose-500/[0.12] px-3.5 py-2 text-xs font-semibold text-rose-50 shadow-sm transition hover:border-rose-500/65 hover:bg-rose-500/[0.18] sm:text-[13px]"
                      >
                        停止生成
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto px-3 pb-6 sm:px-5">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-zinc-500">
                    <th className="sticky top-0 w-[4.5rem] rounded-tl-lg border-b border-zinc-800/90 bg-zinc-950/95 py-3 pr-2 pl-3 backdrop-blur-sm sm:w-[5rem] sm:pl-4">
                      镜号
                    </th>
                    <th className="sticky top-0 w-[7.5rem] border-b border-zinc-800/90 bg-zinc-950/95 py-3 pr-2 backdrop-blur-sm sm:w-[8rem]">
                      状态
                    </th>
                    <th className="sticky top-0 min-w-[220px] border-b border-zinc-800/90 bg-zinc-950/95 py-3 pr-3 backdrop-blur-sm">
                      画面与预览
                    </th>
                    <th className="sticky top-0 min-w-[160px] border-b border-zinc-800/90 bg-zinc-950/95 py-3 pr-3 backdrop-blur-sm">
                      旁白
                    </th>
                    <th className="sticky top-0 min-w-[13.5rem] rounded-tr-lg border-b border-zinc-800/90 bg-zinc-950/95 py-3 pr-4 pl-1 backdrop-blur-sm">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenes.map((s) => {
                    const row = assets[s.index];
                    const imgBadge =
                      row?.status === "running" ? (
                        <span className={badgeRunning}>生成中</span>
                      ) : row?.status === "success" ? (
                        <span className={badgeSuccess}>已出图</span>
                      ) : row?.status === "failed" ? (
                        <span className={badgeFail} title={row.error}>
                          失败
                        </span>
                      ) : (
                        <span className={badgeMuted}>未生成</span>
                      );
                    const vidBadge =
                      row?.videoStatus === "running" ? (
                        <span className={badgeRunning}>生成中</span>
                      ) : row?.videoStatus === "success" ? (
                        <span className={badgeSuccess}>已出片</span>
                      ) : row?.videoStatus === "failed" ? (
                        <span
                          className={badgeFail}
                          title={row.videoError ?? ""}
                        >
                          失败
                        </span>
                      ) : (
                        <span className={badgeMuted}>未生成</span>
                      );
                    return (
                      <tr
                        key={s.index}
                        className="border-b border-zinc-800/55 align-top transition-colors odd:bg-zinc-950/15 even:bg-transparent hover:bg-zinc-900/30"
                      >
                        <td className="py-4 pr-2 pl-3 align-top sm:pl-4">
                          <div className="flex flex-col items-center gap-1.5">
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-800/90 text-sm font-semibold tabular-nums text-amber-100/95 ring-1 ring-zinc-700/60"
                              aria-label={`第 ${s.index} 镜`}
                            >
                              {s.index}
                            </span>
                            <span className="rounded-md bg-zinc-900/85 px-2 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500 ring-1 ring-zinc-800/80">
                              {s.durationSec}s
                            </span>
                          </div>
                        </td>
                        <td className="py-4 pr-2 align-top">
                          <div className="flex flex-col gap-2.5">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <span className="text-[10px] font-medium text-zinc-600">
                                静帧
                              </span>
                              {imgBadge}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <span className="text-[10px] font-medium text-zinc-600">
                                视频
                              </span>
                              {vidBadge}
                            </div>
                            {row?.status === "failed" && row.error ? (
                              <p className="max-w-[11rem] text-[10px] leading-snug text-rose-300/90">
                                {row.error}
                              </p>
                            ) : null}
                            {row?.videoStatus === "failed" && row.videoError ? (
                              <p className="max-w-[11rem] text-[10px] leading-snug text-rose-300/90">
                                {row.videoError}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-4 pr-3 align-top text-zinc-300">
                          <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3 ring-1 ring-zinc-800/35">
                            <p className="max-w-md text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-400">
                              {s.visualDescription}
                            </p>
                          </div>
                          <div className="mt-3 flex max-w-[14rem] flex-col gap-2.5">
                            {row?.url ? (
                              <div className="overflow-hidden rounded-xl bg-black/45 shadow-inner ring-1 ring-zinc-800/90">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={row.url}
                                  alt={`第 ${s.index} 镜静帧`}
                                  className="aspect-[9/16] max-h-44 w-full object-cover"
                                />
                              </div>
                            ) : null}
                            {row?.videoUrl ? (
                              <div className="overflow-hidden rounded-xl bg-black/45 shadow-inner ring-1 ring-zinc-800/90">
                                <video
                                  src={row.videoUrl}
                                  controls
                                  className="aspect-[9/16] max-h-52 w-full object-cover"
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-4 pr-3 align-top">
                          <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3 ring-1 ring-zinc-800/35">
                            <p className="text-[13px] leading-relaxed text-zinc-400">
                              {s.narration}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 pr-4 pl-1 align-top">
                          <div className="flex min-w-[12rem] max-w-[16rem] flex-col gap-2">
                            <span className={storyboardOpSectionLabel}>出图</span>
                            {s.index > 1 ? (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  disabled={row?.status === "running"}
                                  title={
                                    "优先以上一镜成片为参考（支持图生图时）；上一镜尚未出图则用封面底图。与顶部「按上一镜批量」单镜逻辑一致。"
                                  }
                                  className={`${storyboardOpPrimaryBtn} px-1.5 text-[10px] leading-tight`}
                                  onClick={() => {
                                    const urlBy: Record<number, string> = {};
                                    for (const [k, v] of Object.entries(assets)) {
                                      const idx = Number(k);
                                      if (v.status === "success" && v.url) {
                                        urlBy[idx] = v.url;
                                      }
                                    }
                                    const standaloneU = latestCoverUrl;
                                    void runSingleAsset(
                                      s.index,
                                      s.visualDescription,
                                      s.narration,
                                      resolveReferenceForScene(
                                        s.index,
                                        urlBy,
                                        assets,
                                        standaloneU,
                                      ),
                                    );
                                  }}
                                >
                                  带参考出图
                                </button>
                                <button
                                  type="button"
                                  disabled={row?.status === "running"}
                                  title="不传封面或上一镜参考图，按本分镜与口播（及页顶系列/切片语境）出图；远景、对峙或视角跳变时可避免构图被参考帧黏住。"
                                  className={`${storyboardOpSecondaryBtn} px-1.5 text-[10px] leading-tight`}
                                  onClick={() => {
                                    void runSingleAsset(
                                      s.index,
                                      s.visualDescription,
                                      s.narration,
                                    );
                                  }}
                                >
                                  按切片内容生成
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={row?.status === "running"}
                                title="第 1 镜不传封面或上一镜参考，按本分镜画面与口播出图。"
                                className={storyboardOpPrimaryBtn}
                                onClick={() => {
                                  const urlBy: Record<number, string> = {};
                                  for (const [k, v] of Object.entries(assets)) {
                                    const idx = Number(k);
                                    if (v.status === "success" && v.url) {
                                      urlBy[idx] = v.url;
                                    }
                                  }
                                  const standaloneU = latestCoverUrl;
                                  void runSingleAsset(
                                    s.index,
                                    s.visualDescription,
                                    s.narration,
                                    resolveReferenceForScene(
                                      s.index,
                                      urlBy,
                                      assets,
                                      standaloneU,
                                    ),
                                  );
                                }}
                              >
                                按分镜出图
                              </button>
                            )}
                            {s.index > 1 ? (
                              <>
                                <div className={storyboardOpDivider} />
                                <span className={storyboardOpSectionLabel}>
                                  以封面为参考
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    !latestCoverUrl || row?.status === "running"
                                  }
                                  title={
                                    latestCoverUrl ?
                                      "以封面为参考强锁主角样貌；大场面或换视角可改用上方「按切片内容生成」（需档案支持参考图）"
                                    : "请先在上方成功生成封面底图"
                                  }
                                  className={storyboardOpPrimaryBtn}
                                  onClick={() => {
                                    const u = latestCoverUrl;
                                    if (!u) return;
                                    void runSingleAsset(
                                      s.index,
                                      s.visualDescription,
                                      s.narration,
                                      {
                                        referenceImageUrl: u,
                                        referenceRole: "cover",
                                      },
                                    );
                                  }}
                                >
                                  按封面重生
                                </button>
                              </>
                            ) : null}
                            {row?.status === "success" && row.url ? (
                              <>
                                <div className={storyboardOpDivider} />
                                <span className={storyboardOpSectionLabel}>
                                  成片与导出
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    !subject.trim() ||
                                    sliceSaveBusy === `scene-${s.index}`
                                  }
                                  onClick={() =>
                                    void saveSliceImageToProject(
                                      row.url as string,
                                      {
                                        role: "scene",
                                        sceneIndex: s.index,
                                      },
                                    )
                                  }
                                  className={storyboardOpMutedBtn}
                                >
                                  {sliceSaveBusy === `scene-${s.index}` ?
                                    "保存中…"
                                  : "保存图片"}
                                </button>
                                <button
                                  type="button"
                                  disabled={row.videoStatus === "running"}
                                  className={storyboardOpVideoBtn}
                                  onClick={() =>
                                    runSingleVideo(
                                      s.index,
                                      row.url as string,
                                      s.visualDescription,
                                    )
                                  }
                                >
                                  {row.videoStatus === "running"
                                    ? "视频生成中…"
                                    : "图生此镜"}
                                </button>
                              </>
                            ) : null}
                            {row?.status === "success" ? (
                              <label className={storyboardOpAdoptLabel}>
                                <input
                                  type="checkbox"
                                  className="rounded border-zinc-600 bg-zinc-950 text-amber-600 focus:ring-amber-500/30"
                                  checked={Boolean(row.approved)}
                                  onChange={() => toggleApproved(s.index)}
                                />
                                采用此镜
                              </label>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}
