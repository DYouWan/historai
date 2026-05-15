"use client";

import type {
  CharacterSuggestion,
  GenerationResult,
  SliceSuggestion,
  StoryboardSpineSnapshot,
  StylePreset,
  Tone,
  VideoDurationMin,
} from "@/lib/types";
import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { VIDEO_DURATION_UI_OPTIONS } from "@/lib/video-duration";
import { THEME_TITLE_PRESETS } from "@/lib/prompts/series-prompts";
import { ACTIVE_STUDIO_VERTICAL } from "@/lib/studio-verticals";
import type { SeedancePromptSceneOutput } from "@/lib/seedance-scene-prompts";
import {
  VOLCENGINE_TTS_VOICE_CUSTOM,
  VOLCENGINE_TTS_VOICE_PRESETS,
} from "@/lib/volcengine-tts-voice-presets";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const LAST_LLM_PROFILE_KEY = "historai:llmProfileId";
const LAST_VOLC_TTS_VOICE_KEY = "historai:volcTtsVoice";
const LAST_IMAGE_PROFILE_KEY = "historai:imageProfileId";

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return e instanceof Error && e.name === "AbortError";
}

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

const STORYBOARD_CHUNK_OPTIONS: {
  value: StoryboardChunkMode;
  label: string;
}[] = [
  {
    value: "auto",
    label:
      "自动（低于档案 chunkThresholdMinutes 时一轮扩写全长；达到阈值则按档案切段）",
  },
  {
    value: "on",
    label: "强制切段扩写（叙事骨架 + 整稿口播 + 多轮分镜）",
  },
];

const STYLE_OPTIONS: { id: StylePreset; label: string }[] = [
  { id: "anime", label: "动漫插画" },
  { id: "cinematic", label: "电影质感" },
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

/** 分镜表 · 操作列按钮（镜 1 / 镜 2+ 共用；层级：主出图 → 次出图 → 封面参考 → 语音） */
const storyboardOpDivider =
  "h-px w-full shrink-0 bg-gradient-to-r from-transparent via-zinc-700/55 to-transparent";
const storyboardOpStack =
  "flex min-w-[12rem] max-w-[16rem] flex-col gap-2.5 rounded-xl border border-zinc-800/55 bg-zinc-950/45 p-2.5 shadow-inner shadow-black/20 ring-1 ring-zinc-800/40";
const storyboardOpBtnBase =
  "inline-flex w-full min-h-[2.5rem] items-center justify-center rounded-lg px-2.5 py-2 text-center text-[11px] font-semibold leading-tight tracking-wide transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";
const storyboardOpPrimaryBtn = `${storyboardOpBtnBase} border border-amber-500/45 bg-gradient-to-b from-amber-500/[0.18] to-amber-950/30 text-amber-50 shadow-sm shadow-amber-950/20 hover:border-amber-400/55 hover:from-amber-500/26 hover:to-amber-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`;
const storyboardOpSecondaryBtn = `${storyboardOpBtnBase} border border-zinc-600/85 bg-zinc-900/55 text-zinc-100 shadow-sm shadow-black/10 hover:border-zinc-500 hover:bg-zinc-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`;
/** 封面参考出图：与主按钮同学科、偏描边以区分「第二条出图路径」 */
const storyboardOpCoverRefBtn = `${storyboardOpBtnBase} border border-amber-400/35 bg-amber-950/20 text-amber-100/95 hover:border-amber-400/50 hover:bg-amber-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`;
const storyboardOpTtsBtn = `${storyboardOpBtnBase} border border-sky-500/40 bg-gradient-to-b from-sky-500/16 to-sky-950/45 text-sky-50 shadow-sm shadow-sky-950/25 ring-1 ring-inset ring-sky-300/10 hover:border-sky-400/50 hover:from-sky-500/22 hover:to-sky-950/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`;

/** 分镜表顶部：批量出图 / 语音 / 导出（同一行、样式统一） */
const storyboardBatchToolbarBtn =
  "inline-flex min-h-[2.35rem] shrink-0 items-center justify-center rounded-lg border border-zinc-600/55 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-100 shadow-sm ring-1 ring-zinc-800/35 transition hover:border-zinc-500 hover:bg-zinc-900/80 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[13px]";
const storyboardBatchToolbarStopBtn =
  "inline-flex min-h-[2.35rem] shrink-0 items-center justify-center rounded-lg border border-rose-700/55 bg-rose-500/[0.12] px-3 py-2 text-xs font-semibold text-rose-50 shadow-sm transition hover:border-rose-500/65 hover:bg-rose-500/[0.18] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[13px]";

/** 整稿口播工具栏：次要操作（如 TTS 区「下载」链接样式） */
const voiceoverToolbarSecondaryBtn =
  "inline-flex min-h-[2.35rem] items-center justify-center gap-1.5 rounded-lg border border-zinc-600/45 bg-zinc-950/70 px-3 py-2 text-xs font-semibold text-zinc-100 shadow-sm ring-1 ring-zinc-800/35 transition hover:border-violet-500/35 hover:bg-zinc-900/80 hover:ring-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[13px]";
const voiceoverToolbarTtsBtn =
  "inline-flex min-h-[2.35rem] items-center justify-center gap-1.5 rounded-lg border border-sky-600/40 bg-sky-950/40 px-3 py-2 text-xs font-semibold text-sky-50/95 shadow-sm ring-1 ring-sky-900/35 transition hover:border-sky-400/45 hover:bg-sky-950/55 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[13px]";
const voiceoverToolbarPrimaryBtn =
  "inline-flex min-h-[2.35rem] items-center justify-center rounded-lg border border-amber-600/40 bg-amber-500/[0.12] px-3 py-2 text-xs font-semibold text-amber-50 shadow-sm ring-1 ring-amber-900/25 transition hover:border-amber-400/50 hover:bg-amber-500/[0.18] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-[13px]";

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

/** 步骤 2 · 上传封面（火山 TOS），与主按钮同高以便并排 */
const coverUploadBtnClass =
  "inline-flex min-h-[3rem] w-full shrink-0 items-center justify-center rounded-xl border border-zinc-500/50 bg-zinc-900/55 px-6 text-sm font-semibold text-zinc-100 shadow-sm ring-1 ring-zinc-800/40 transition hover:border-zinc-400/55 hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";

/** 步骤 4 · 叙事骨架 / 后续主流程按钮（单独一行，无分组标题） */
const stepPrimaryGenerateStandaloneBtnClass =
  "inline-flex min-h-[2.85rem] w-full max-w-md items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-950/30 ring-1 ring-amber-400/25 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:w-auto xl:min-w-[12rem]";

const workflowSteps = [
  {
    n: "1",
    label: "系列与人物",
    desc: "系列名与人物",
  },
  { n: "2", label: "生成封面", desc: "人物形象 + 画风预设，竖屏外宣底图" },
  {
    n: "3",
    label: "高光与呈现",
    desc: "叙事时长、切片标题与说明",
  },
  { n: "4", label: "文案与分镜", desc: "扩写切段、基调与主生成镜表" },
] as const;

/** 封面预览条数上限；超出须勾选删除后才可再次生成（并尽量同步删 slice-exports 落盘文件） */
const MAX_COVER_GALLERY = 5;

/** 与 `POST /api/upload-reference-image` 单文件上限一致（火山 TOS） */
const COVER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const marker = "base64,";
      const i = s.indexOf(marker);
      if (i === -1) {
        reject(new Error("无法读取文件为 Base64"));
        return;
      }
      resolve(s.slice(i + marker.length));
    };
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

function isLikelyCoverImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (/^image\/(jpeg|png|webp|gif)$/i.test(t)) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
}

type AssetRow = {
  sceneIndex: number;
  status: "idle" | "running" | "success" | "failed";
  url?: string;
  error?: string;
  provider?: string;
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

function voiceoverTtsBuildDownloadFilename(mime: string, folderTitle: string) {
  const ext =
    mime.includes("wav") ? "wav"
    : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
    : "audio";
  const safe = folderTitle.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 48);
  return `historai-tts-${safe}.${ext}`;
}

export function PersonStudioWorkspace() {
  const [seriesTitle, setSeriesTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectAppearance, setSubjectAppearance] = useState("");
  const [dynasty, setDynasty] = useState("");
  const [tone, setTone] = useState<Tone>("narrative");
  const [stylePreset, setStylePreset] = useState<StylePreset>("anime");
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
  /** L1 内：时间线子块可折叠（叙事骨架生成后默认收起） */
  const [narrativeTimelineExpanded, setNarrativeTimelineExpanded] = useState(false);
  /** L1 内：分镜骨架子块可折叠（叙事骨架生成后默认收起） */
  const [narrativeSceneSkeletonExpanded, setNarrativeSceneSkeletonExpanded] =
    useState(false);
  /** L2 整稿口播正文：生成完成后默认收起（与 L1 子块一致） */
  const [voiceoverDraftPanelExpanded, setVoiceoverDraftPanelExpanded] =
    useState(false);
  const [voiceoverTtsBusy, setVoiceoverTtsBusy] = useState(false);
  const [voiceoverTtsAudioUrl, setVoiceoverTtsAudioUrl] = useState<
    string | null
  >(null);
  const [voiceoverTtsFeedback, setVoiceoverTtsFeedback] = useState<
    null | { kind: "ok" | "error"; text: string }
  >(null);
  /** 最近一次合成音频的 Base64，用于写入 slice-exports（与封面同目录） */
  const voiceoverTtsLastPayloadRef = useRef<{ b64: string; mime: string } | null>(
    null,
  );
  const [voiceoverTtsExportMime, setVoiceoverTtsExportMime] =
    useState("audio/mpeg");
  const [voiceoverTtsSaveBusy, setVoiceoverTtsSaveBusy] = useState(false);
  const [voiceoverTtsSaveHint, setVoiceoverTtsSaveHint] = useState<
    string | null
  >(null);
  /** 火山豆包 TTS：预设 id 或 VOLCENGINE_TTS_VOICE_CUSTOM */
  const [volcTtsVoicePreset, setVolcTtsVoicePreset] = useState(
    "VC_BV700_streaming",
  );
  const [volcTtsVoiceCustom, setVolcTtsVoiceCustom] = useState("");
  const [volcTtsVoiceHydrated, setVolcTtsVoiceHydrated] = useState(false);
  const [assets, setAssets] = useState<Record<number, AssetRow>>({});
  const [coverRequest, setCoverRequest] = useState<CoverRequestState>({
    status: "idle",
  });
  const [coverGallery, setCoverGallery] = useState<CoverGalleryItem[]>([]);
  const [coverDeleteBusy, setCoverDeleteBusy] = useState(false);
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);
  const coverUploadInputRef = useRef<HTMLInputElement>(null);
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
  /** 当前批量出图中这一镜的 fetch，用于「停止生成」时 abort */
  const batchAssetAbortRef = useRef<AbortController | null>(null);
  /** 用于在新一条 L1 hook 出现时收起时间线 / 分镜骨架子块 */
  const lastNarrativeSpineHookRef = useRef<string | undefined>(undefined);
  const [llmProfiles, setLlmProfiles] = useState<LlmProfileOption[]>([]);
  const [profileId, setProfileId] = useState("");
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [imageProfiles, setImageProfiles] = useState<MediaImageOption[]>([]);
  const [imageProfileId, setImageProfileId] = useState("");
  const [mediaProfilesError, setMediaProfilesError] = useState<string | null>(
    null,
  );
  /** 服务端 TTS env 是否就绪（不含密钥内容） */
  const [ttsConfig, setTtsConfig] = useState<{
    volcengine: boolean;
    iflytek: boolean;
  } | null>(null);
  const [sliceTitle, setSliceTitle] = useState("");
  const [sliceAngle, setSliceAngle] = useState("");
  const [sliceSuggestions, setSliceSuggestions] = useState<SliceSuggestion[]>(
    [],
  );
  const [characterSuggestions, setCharacterSuggestions] = useState<
    CharacterSuggestion[]
  >([]);
  const [suggestCharsBusy, setSuggestCharsBusy] = useState(false);
  const [charsHint, setCharsHint] = useState<string | null>(null);
  const [suggestSlicesBusy, setSuggestSlicesBusy] = useState(false);
  const [slicesHint, setSlicesHint] = useState<string | null>(null);

  useEffect(() => {
    const hook = result?.hook?.trim();
    if (!hook) {
      lastNarrativeSpineHookRef.current = undefined;
      return;
    }
    if (lastNarrativeSpineHookRef.current === hook) return;
    lastNarrativeSpineHookRef.current = hook;
    setNarrativeTimelineExpanded(false);
    setNarrativeSceneSkeletonExpanded(false);
    setVoiceoverDraftPanelExpanded(false);
  }, [result?.hook]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tts-config");
        const json = (await res.json()) as {
          volcengine?: boolean;
          iflytek?: boolean;
        };
        if (cancelled) return;
        if (res.ok) {
          setTtsConfig({
            volcengine: Boolean(json.volcengine),
            iflytek: Boolean(json.iflytek),
          });
        } else {
          setTtsConfig({ volcengine: false, iflytek: false });
        }
      } catch {
        if (!cancelled) setTtsConfig({ volcengine: false, iflytek: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setSubjectAppearance("");
  }, [seriesTitle]);

  useEffect(() => {
    setSliceSuggestions([]);
    setSlicesHint(null);
  }, [seriesTitle, subject]);

  useEffect(() => {
    setCoverRequest({ status: "idle" });
  }, [result]);

  useEffect(() => {
    return () => {
      if (voiceoverTtsAudioUrl) URL.revokeObjectURL(voiceoverTtsAudioUrl);
    };
  }, [voiceoverTtsAudioUrl]);

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined" ?
          window.localStorage.getItem(LAST_VOLC_TTS_VOICE_KEY)
        : null;
      if (raw) {
        const o = JSON.parse(raw) as { preset?: string; custom?: string };
        const allowed = new Set(
          VOLCENGINE_TTS_VOICE_PRESETS.map((p) => p.id),
        );
        allowed.add(VOLCENGINE_TTS_VOICE_CUSTOM);
        if (typeof o.preset === "string" && allowed.has(o.preset)) {
          setVolcTtsVoicePreset(o.preset);
        }
        if (typeof o.custom === "string") setVolcTtsVoiceCustom(o.custom);
      }
    } catch {
      /* ignore */
    }
    setVolcTtsVoiceHydrated(true);
  }, []);

  useEffect(() => {
    if (!volcTtsVoiceHydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        LAST_VOLC_TTS_VOICE_KEY,
        JSON.stringify({
          preset: volcTtsVoicePreset,
          custom: volcTtsVoiceCustom,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    volcTtsVoiceHydrated,
    volcTtsVoicePreset,
    volcTtsVoiceCustom,
  ]);

  const volcTtsEffectiveVoiceType = useMemo(() => {
    if (volcTtsVoicePreset === VOLCENGINE_TTS_VOICE_CUSTOM) {
      return volcTtsVoiceCustom.trim();
    }
    return volcTtsVoicePreset.trim();
  }, [volcTtsVoicePreset, volcTtsVoiceCustom]);

  const canGenerateStandaloneCover = useMemo(
    () => Boolean(subject.trim() && subjectAppearance.trim()),
    [subject, subjectAppearance],
  );

  /** 与导出文件夹命名一致：切片标题优先，否则系列名，否则未命名 */
  const sliceFolderTitle = useMemo(
    () => sliceTitle.trim() || seriesTitle.trim() || "未命名标题",
    [sliceTitle, seriesTitle],
  );

  const voiceoverTtsDownloadFilename = useMemo(
    () =>
      voiceoverTtsBuildDownloadFilename(
        voiceoverTtsExportMime,
        sliceFolderTitle,
      ),
    [voiceoverTtsExportMime, sliceFolderTitle],
  );

  const [sliceSaveHint, setSliceSaveHint] = useState<string | null>(null);
  const [exportBundleBusy, setExportBundleBusy] = useState(false);
  /** 逐镜旁白 TTS：fileStem 为 {projectSeed}-scene-audio-NN，写入 slice-exports */
  const [sceneTtsByIndex, setSceneTtsByIndex] = useState<
    Record<number, { status: "running" | "success" | "failed"; error?: string }>
  >({});
  const [sceneTtsBatchBusy, setSceneTtsBatchBusy] = useState(false);
  const stopSceneTtsBatchRef = useRef(false);

  const [seedancePromptByIndex, setSeedancePromptByIndex] = useState<
    Record<number, SeedancePromptSceneOutput>
  >({});
  const [seedancePromptBusy, setSeedancePromptBusy] = useState(false);
  const [seedancePromptError, setSeedancePromptError] = useState<string | null>(
    null,
  );
  /** 非 null 时表示正在为某一镜单独生成 Seedance 文案 */
  const [seedanceSingleBusyIndex, setSeedanceSingleBusyIndex] = useState<
    number | null
  >(null);

  /** 出图成功后写入 slice-exports；不占用手动 busy，失败仅更新 sliceSaveHint */
  const persistSceneImageQuietly = useCallback(
    async (imageUrl: string, sceneIndex: number, fileStem: string) => {
      if (!subject.trim()) return;
      try {
        const res = await fetch("/api/save-slice-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            subject: subject.trim(),
            title: sliceFolderTitle,
            role: "scene",
            sceneIndex,
            fileStem,
          }),
        });
        const json = (await res.json()) as { error?: string; relativePath?: string };
        if (!res.ok) {
          setSliceSaveHint(
            `镜 ${sceneIndex} 自动保存失败：${json.error ?? String(res.status)}`,
          );
        }
      } catch (e) {
        setSliceSaveHint(
          e instanceof Error ?
            `镜 ${sceneIndex} 自动保存失败：${e.message}`
          : `镜 ${sceneIndex} 自动保存失败`,
        );
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
          imageProfiles?: MediaImageOption[];
        };
        if (!res.ok) {
          throw new Error(json.error ?? "加载媒体模型列表失败");
        }
        if (cancelled) return;
        const imgList = json.imageProfiles ?? [];
        setImageProfiles(imgList);
        setMediaProfilesError(null);
        const imgStored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LAST_IMAGE_PROFILE_KEY)
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
        setImageProfileId((prev) => {
          if (prev && imgList.some((p) => p.id === prev)) return prev;
          return pickImg();
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

  const selectedImageProfile = useMemo(
    () => imageProfiles.find((p) => p.id === imageProfileId),
    [imageProfiles, imageProfileId],
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

  /** 仅需主角即可导出（可仅写入 manifest，无静帧/音频也会落盘） */
  const canExportSliceBundle = Boolean(subject.trim());

  const canBatchSceneTts = useMemo(
    () =>
      Boolean(
        result?.scenes.length &&
          volcTtsEffectiveVoiceType.trim() &&
          subject.trim(),
      ),
    [result?.scenes.length, volcTtsEffectiveVoiceType, subject],
  );

  const runBatchSeedancePrompts = useCallback(async () => {
    if (!result?.scenes.length || !subject.trim()) return;
    setSeedanceSingleBusyIndex(null);
    setSeedancePromptBusy(true);
    setSeedancePromptError(null);
    try {
      const res = await fetch("/api/suggest-seedance-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          subject: subject.trim(),
          dynasty: dynasty.trim() || undefined,
          seriesTitle: seriesTitle.trim() || undefined,
          sliceTitle: sliceTitle.trim() || undefined,
          sliceAngle: sliceAngle.trim() || undefined,
          hook: result.hook,
          scenes: result.scenes.map((s) => ({
            index: s.index,
            visualDescription: s.visualDescription,
            narration: s.narration,
            durationSec: s.durationSec,
          })),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        prompts?: SeedancePromptSceneOutput[];
      };
      if (!res.ok) {
        setSeedancePromptError(json.error ?? "生成失败");
        return;
      }
      const list = json.prompts ?? [];
      if (!list.length) {
        setSeedancePromptError("接口未返回 prompts，请重试或查看服务端日志");
        return;
      }
      const next: Record<number, SeedancePromptSceneOutput> = {};
      for (const p of list) {
        next[p.index] = p;
      }
      setSeedancePromptByIndex(next);
    } catch (e) {
      setSeedancePromptError(
        e instanceof Error ? e.message : "Seedance 文案生成失败",
      );
    } finally {
      setSeedancePromptBusy(false);
    }
  }, [
    profileId,
    subject,
    dynasty,
    seriesTitle,
    sliceTitle,
    sliceAngle,
    result,
  ]);

  const runSingleSeedancePrompt = useCallback(
    async (sceneIndex: number) => {
      if (!result?.scenes.length || !subject.trim()) return;
      if (seedancePromptBusy) return;
      const s = result.scenes.find((x) => x.index === sceneIndex);
      if (!s?.visualDescription.trim()) return;
      setSeedanceSingleBusyIndex(sceneIndex);
      setSeedancePromptError(null);
      try {
        const res = await fetch("/api/suggest-seedance-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: profileId || undefined,
            subject: subject.trim(),
            dynasty: dynasty.trim() || undefined,
            seriesTitle: seriesTitle.trim() || undefined,
            sliceTitle: sliceTitle.trim() || undefined,
            sliceAngle: sliceAngle.trim() || undefined,
            hook: result.hook,
            scenes: [
              {
                index: s.index,
                visualDescription: s.visualDescription,
                narration: s.narration,
                durationSec: s.durationSec,
              },
            ],
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          prompts?: SeedancePromptSceneOutput[];
        };
        if (!res.ok) {
          setSeedancePromptError(json.error ?? "生成失败");
          return;
        }
        const p = json.prompts?.[0];
        if (!p || p.index !== s.index) {
          setSeedancePromptError("响应未包含本镜 Seedance 文案");
          return;
        }
        setSeedancePromptByIndex((prev) => ({ ...prev, [p.index]: p }));
      } catch (e) {
        setSeedancePromptError(
          e instanceof Error ? e.message : "Seedance 文案生成失败",
        );
      } finally {
        setSeedanceSingleBusyIndex(null);
      }
    },
    [
      profileId,
      subject,
      dynasty,
      seriesTitle,
      sliceTitle,
      sliceAngle,
      result,
      seedancePromptBusy,
    ],
  );

  const runExportSliceBundle = useCallback(async () => {
    if (!subject.trim()) return;
    setExportBundleBusy(true);
    setSliceSaveHint(null);
    try {
      const seedanceScenePrompts =
        Object.keys(seedancePromptByIndex).length > 0 ?
          Object.values(seedancePromptByIndex).sort(
            (a, b) => a.index - b.index,
          )
        : undefined;
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
          result,
          coverStillUrl: latestCoverUrl,
          assets: Object.fromEntries(
            Object.entries(assets).map(([k, v]) => [
              Number(k),
              {
                status: v.status,
                url: v.url,
              },
            ]),
          ),
          voiceoverFullText:
            voiceoverDraft.trim() || result?.voiceoverFullText?.trim() || undefined,
          ...(seedanceScenePrompts?.length ?
            { seedanceScenePrompts }
          : {}),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        manifestPath?: string;
        seedancePromptsPath?: string | null;
        exportFolder?: string;
        saved?: string[];
        errors?: string[];
      };
      if (!res.ok) {
        setSliceSaveHint(json.error ?? "导出失败");
        return;
      }
      const hintParts = [`manifest：${json.manifestPath ?? "manifest.json"}`];
      if (json.seedancePromptsPath) {
        hintParts.push(`Seedance：${json.seedancePromptsPath}`);
      }
      setSliceSaveHint(
        `已写入 slice-exports/${json.exportFolder ?? ""}（${hintParts.join("；")}）`,
      );
    } catch (e) {
      setSliceSaveHint(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExportBundleBusy(false);
    }
  }, [
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
    result,
    latestCoverUrl,
    assets,
    voiceoverDraft,
    seedancePromptByIndex,
  ]);

  const sceneAudioStem = useCallback(
    (sceneIndex: number) =>
      `${projectSeed}-scene-audio-${String(sceneIndex).padStart(2, "0")}`,
    [projectSeed],
  );

  const runSceneTtsSave = useCallback(
    async (sceneIndex: number, narration: string) => {
      const text = narration.trim();
      if (!text) {
        setSceneTtsByIndex((prev) => ({
          ...prev,
          [sceneIndex]: {
            status: "failed",
            error: "本镜旁白为空",
          },
        }));
        return;
      }
      if (!subject.trim()) return;
      const voiceType = volcTtsEffectiveVoiceType.trim();
      if (!voiceType) {
        setSceneTtsByIndex((prev) => ({
          ...prev,
          [sceneIndex]: {
            status: "failed",
            error: "请先在整稿区上方选择豆包音色",
          },
        }));
        return;
      }
      setSceneTtsByIndex((prev) => ({
        ...prev,
        [sceneIndex]: { status: "running" },
      }));
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "volcengine",
            text,
            voiceType,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          mimeType?: string;
          audioBase64?: string;
        };
        if (!res.ok) {
          setSceneTtsByIndex((prev) => ({
            ...prev,
            [sceneIndex]: {
              status: "failed",
              error: json.error ?? `合成失败（${res.status}）`,
            },
          }));
          return;
        }
        const b64 = json.audioBase64;
        if (!b64) {
          setSceneTtsByIndex((prev) => ({
            ...prev,
            [sceneIndex]: { status: "failed", error: "响应缺少音频数据" },
          }));
          return;
        }
        const mime =
          typeof json.mimeType === "string" && json.mimeType ?
            json.mimeType
          : "audio/mpeg";
        const saveRes = await fetch("/api/save-slice-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subject.trim(),
            title: sliceFolderTitle,
            audioBase64: b64,
            mimeType: mime,
            fileStem: sceneAudioStem(sceneIndex),
          }),
        });
        const saveJson = (await saveRes.json()) as { error?: string };
        if (!saveRes.ok) {
          setSceneTtsByIndex((prev) => ({
            ...prev,
            [sceneIndex]: {
              status: "failed",
              error: saveJson.error ?? "保存失败",
            },
          }));
          return;
        }
        setSceneTtsByIndex((prev) => ({
          ...prev,
          [sceneIndex]: { status: "success" },
        }));
      } catch (e) {
        setSceneTtsByIndex((prev) => ({
          ...prev,
          [sceneIndex]: {
            status: "failed",
            error: e instanceof Error ? e.message : "网络错误",
          },
        }));
      }
    },
    [subject, sliceFolderTitle, volcTtsEffectiveVoiceType, sceneAudioStem],
  );

  const runBatchSceneTts = useCallback(async () => {
    if (!result?.scenes.length) return;
    stopSceneTtsBatchRef.current = false;
    setSceneTtsBatchBusy(true);
    try {
      for (const s of result.scenes) {
        if (stopSceneTtsBatchRef.current) break;
        if (!s.narration.trim()) continue;
        await runSceneTtsSave(s.index, s.narration);
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setSceneTtsBatchBusy(false);
    }
  }, [result, runSceneTtsSave]);

  const resetAssets = useCallback(() => {
    setAssets({});
    setSceneTtsByIndex({});
    setSeedancePromptByIndex({});
    setSeedancePromptError(null);
  }, []);

  const runSuggestCharacters = async () => {
    if (!seriesTitle.trim()) return;
    setSuggestCharsBusy(true);
    setCharsHint(null);
    const excludeCharacters =
      characterSuggestions.length > 0 ?
        characterSuggestions.map((c) => c.name)
      : undefined;
    try {
      const res = await fetch("/api/suggest-theme-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim(),
          ...(excludeCharacters?.length ? { excludeCharacters } : {}),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        characters?: CharacterSuggestion[];
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
    const excludeSliceTitles =
      sliceSuggestions.length > 0 ?
        sliceSuggestions.map((s) => s.title)
      : undefined;
    try {
      const res = await fetch("/api/suggest-character-slices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          seriesTitle: seriesTitle.trim(),
          characterName: subject.trim(),
          videoDurationMin,
          ...(excludeSliceTitles?.length ? { excludeSliceTitles } : {}),
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

  const applyCharacterSuggestion = (c: CharacterSuggestion) => {
    setSubject(c.name);
    setSubjectAppearance(c.appearance);
    setDynasty(c.dynasty.trim());
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
          subjectAppearance: subjectAppearance.trim() || undefined,
          tone,
          stylePreset,
          videoDurationMin,
          storyboardChunkMode,
          stopAfterSpine: true,
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
        setSeedancePromptByIndex({});
        setSeedancePromptError(null);
        return;
      }
      const gen = json as GenerationResult;
      setResult(gen);
      setVoiceoverDraft(gen.voiceoverFullText ?? "");
      setSeedancePromptByIndex({});
      setSeedancePromptError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
      setResult(null);
      setVoiceoverDraft("");
      setSeedancePromptByIndex({});
      setSeedancePromptError(null);
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
          subjectAppearance: subjectAppearance.trim() || undefined,
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
      setVoiceoverDraftPanelExpanded(false);
      setSeedancePromptByIndex({});
      setSeedancePromptError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  const runVolcengineVoiceoverTts = async () => {
    const text = voiceoverDraft.trim();
    if (!text) return;
    setVoiceoverTtsBusy(true);
    setVoiceoverTtsFeedback(null);
    setVoiceoverTtsSaveHint(null);
    voiceoverTtsLastPayloadRef.current = null;
    setVoiceoverTtsAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const voiceType =
        volcTtsEffectiveVoiceType.trim() ?
          volcTtsEffectiveVoiceType.trim()
        : undefined;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "volcengine",
          text,
          ...(voiceType ? { voiceType } : {}),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        mimeType?: string;
        audioBase64?: string;
      };
      if (!res.ok) {
        setVoiceoverTtsFeedback({
          kind: "error",
          text: json.error ?? `合成失败（${res.status}）`,
        });
        return;
      }
      const mime =
        typeof json.mimeType === "string" && json.mimeType ?
          json.mimeType
        : "audio/mpeg";
      const b64 = json.audioBase64;
      if (!b64) {
        setVoiceoverTtsFeedback({
          kind: "error",
          text: "响应缺少音频数据",
        });
        return;
      }
      const binStr = atob(b64);
      const len = binStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      voiceoverTtsLastPayloadRef.current = { b64, mime };
      setVoiceoverTtsExportMime(mime);
      const objectUrl = URL.createObjectURL(blob);
      setVoiceoverTtsAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      setVoiceoverTtsFeedback({
        kind: "ok",
        text: "已通过火山引擎豆包语音合成。可试听；保存到项目请点「保存到切片文件夹」（与封面同一 slice-exports 目录）；亦可「下载到本机」。",
      });
    } catch (e) {
      setVoiceoverTtsFeedback({
        kind: "error",
        text: e instanceof Error ? e.message : "网络错误",
      });
    } finally {
      setVoiceoverTtsBusy(false);
    }
  };

  const saveVoiceoverTtsToSliceFolder = async () => {
    const p = voiceoverTtsLastPayloadRef.current;
    if (!p) {
      setVoiceoverTtsSaveHint("请先点击「豆包语音试听」完成合成。");
      return;
    }
    if (!subject.trim()) {
      setVoiceoverTtsSaveHint(
        "请先填写主角（人物），导出文件夹须与封面保存规则一致。",
      );
      return;
    }
    setVoiceoverTtsSaveBusy(true);
    setVoiceoverTtsSaveHint(null);
    try {
      const res = await fetch("/api/save-slice-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          title: sliceFolderTitle,
          audioBase64: p.b64,
          mimeType: p.mime,
          fileStem: "voiceover",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        folder?: string;
        relativePath?: string;
      };
      if (!res.ok) {
        setVoiceoverTtsSaveHint(json.error ?? "保存失败");
        return;
      }
      setVoiceoverTtsSaveHint(
        json.relativePath ?
          `已写入 ${json.relativePath.replace(/\\/g, "/")}`
        : "已保存到切片导出文件夹（与封面相同目录规则）。",
      );
    } catch (e) {
      setVoiceoverTtsSaveHint(
        e instanceof Error ? e.message : "保存失败",
      );
    } finally {
      setVoiceoverTtsSaveBusy(false);
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
          subjectAppearance: subjectAppearance.trim() || undefined,
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
      /** 独立封面图 URL；缺省时仍可退回镜 1 已出图（兼容旧流程） */
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
    opts?: { signal?: AbortSignal },
  ): Promise<{ success: boolean; url?: string; cancelled?: boolean }> => {
    setAssets((prev) => ({
      ...prev,
      [sceneIndex]: {
        ...prev[sceneIndex],
        sceneIndex,
        status: "running",
        error: undefined,
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
        signal: opts?.signal,
      });
      const json = (await res.json()) as {
        error?: string;
        url?: string;
        projectSeed?: string;
        provider?: string;
      };
      if (!res.ok) {
        if (res.status === 400 && json.error) {
          setError(String(json.error));
        }
        setAssets((prev) => {
          const r = prev[sceneIndex];
          const next: AssetRow = {
            sceneIndex,
            status: "failed",
            error: json.error ?? `HTTP ${res.status}`,
          };
          if (r?.url) {
            next.url = r.url;
            next.provider = r.provider;
          }
          return { ...prev, [sceneIndex]: next };
        });
        return { success: false };
      }
      const url = json.url as string;
      const seedForFile =
        typeof json.projectSeed === "string" && json.projectSeed.trim() ?
          json.projectSeed.trim()
        : projectSeed;
      const fileStem = `${seedForFile}-scene-img-${String(sceneIndex).padStart(2, "0")}`;
      setAssets((prev) => ({
        ...prev,
        [sceneIndex]: {
          ...prev[sceneIndex],
          sceneIndex,
          status: "success",
          url,
          provider: json.provider as string | undefined,
          error: undefined,
        },
      }));

      void persistSceneImageQuietly(url, sceneIndex, fileStem);

      return { success: true, url };
    } catch (e) {
      if (isAbortError(e) || opts?.signal?.aborted) {
        setAssets((prev) => {
          const r = prev[sceneIndex];
          const next: AssetRow = {
            sceneIndex,
            status: "failed",
            error: "已停止",
          };
          if (r?.url) {
            next.url = r.url;
            next.provider = r.provider;
          }
          return { ...prev, [sceneIndex]: next };
        });
        return { success: false, cancelled: true };
      }
      const msg = e instanceof Error ? e.message : "请求失败";
      setAssets((prev) => {
        const r = prev[sceneIndex];
        const next: AssetRow = {
          sceneIndex,
          status: "failed",
          error: msg,
        };
        if (r?.url) {
          next.url = r.url;
          next.provider = r.provider;
        }
        return { ...prev, [sceneIndex]: next };
      });
      return { success: false };
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

  const appendCoverToGalleryAndPersist = useCallback(
    (args: {
      coverUrl: string;
      seedForFile: string;
      provider?: string;
      coverKind?: "generate" | "upload";
    }) => {
      const { coverUrl, seedForFile, provider, coverKind = "generate" } = args;
      const doneVerb = coverKind === "upload" ? "上传" : "生成";
      const gid =
        typeof crypto !== "undefined" && "randomUUID" in crypto ?
          crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setCoverGallery((prev) => [
        { id: gid, url: coverUrl, provider },
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
              `封面已${doneVerb}；自动保存失败：${saveJson.error ?? saveRes.status}（可再点「生成封面图」或重新上传重试，或使用下方「导出资源」）`,
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
              `封面已${doneVerb}；自动保存失败：${e.message}（可再点「生成封面图」或重新上传重试，或使用「导出资源」）`
            : `封面已${doneVerb}；自动保存失败（可再点「生成封面图」或重新上传重试，或使用「导出资源」）`,
          );
        }
      })();
    },
    [subject, sliceFolderTitle],
  );

  const handleCoverUploadFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (!subject.trim()) {
        setError("上传封面图前请先填写「人物/主题」。");
        return;
      }
      if (coverGallery.length >= MAX_COVER_GALLERY) {
        setError(
          `已有 ${MAX_COVER_GALLERY} 张封面预览。请先勾选删除若干张后再上传。`,
        );
        return;
      }
      if (file.size > COVER_UPLOAD_MAX_BYTES) {
        setError(
          `图片须不超过 ${Math.floor(COVER_UPLOAD_MAX_BYTES / 1024 / 1024)}MB。`,
        );
        return;
      }
      if (!isLikelyCoverImageFile(file)) {
        setError("仅支持 JPEG、PNG、WebP、GIF 图片。");
        return;
      }
      setCoverUploadBusy(true);
      setError(null);
      setSliceSaveHint(null);
      try {
        const fileData = await readFileAsBase64(file);
        const res = await fetch("/api/upload-reference-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name || "cover.jpg",
            mimeType: file.type || "image/jpeg",
            fileSize: file.size,
            fileData,
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          url?: string;
          success?: boolean;
        };
        if (!res.ok || !json.url?.trim()) {
          setError(json.error ?? "上传失败");
          return;
        }
        const uploadStem = `${projectSeed}-upload-${
          typeof crypto !== "undefined" && "randomUUID" in crypto ?
            crypto.randomUUID().slice(0, 10)
          : `${Date.now()}`
        }`;
        appendCoverToGalleryAndPersist({
          coverUrl: json.url.trim(),
          seedForFile: uploadStem,
          provider: "tos",
          coverKind: "upload",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setCoverUploadBusy(false);
      }
    },
    [subject, coverGallery.length, projectSeed, appendCoverToGalleryAndPersist],
  );

  const runStandaloneCoverRequest = async (): Promise<boolean> => {
    if (!canGenerateStandaloneCover) {
      setError("请先填写人物，并在「形象描述」中填写人物形象（可与 AI 推荐人物一致）。");
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
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneIndex: 0,
          standaloneCover: true,
          visualDescription: "—",
          stylePreset,
          projectSeed,
          imageProfileId: imageProfileId || undefined,
          subject: subject.trim() || undefined,
          dynasty: dynasty.trim() || undefined,
          subjectAppearance: subjectAppearance.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string; url?: string; provider?: string };
      if (!res.ok) {
        if (res.status === 400 && json.error) {
          setError(String(json.error));
        }
        setCoverRequest({ status: "failed" });
        return false;
      }
      const coverUrl = json.url as string;
      appendCoverToGalleryAndPersist({
        coverUrl,
        seedForFile: projectSeed,
        provider: json.provider as string | undefined,
        coverKind: "generate",
      });

      return true;
    } catch (e) {
      setCoverRequest({ status: "failed" });
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
        const ac = new AbortController();
        batchAssetAbortRef.current = ac;
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
          { signal: ac.signal },
        );
        if (out.cancelled || stopBatchRef.current) break;
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
      await runStandaloneCoverRequest();
    } finally {
      setBatchBusy(false);
    }
  };

  /** 各镜顺序出图：镜 1 为正片首镜（文生）；镜 ≥2 以封面为图生图参考。场面跳变可单镜改「按切片内容生成」。 */
  const runRemainingAssetsFromCover = async () => {
    if (!result?.scenes.length) return;
    const coverUrl = latestCoverUrl;
    if (!coverUrl) {
      setError("请先在「步骤 2 · 生成封面图」成功生成封面图，再按封面批量生成镜头。");
      return;
    }
    setBatchBusy(true);
    setError(null);
    stopBatchRef.current = false;
    try {
      const ordered = [...result.scenes]
        .filter((s) => s.index >= 1)
        .sort((a, b) => a.index - b.index);
      const urlByIndex: Record<number, string> = {};
      const coverRef = {
        referenceImageUrl: coverUrl,
        referenceRole: "cover" as const,
      };
      for (const s of ordered) {
        if (stopBatchRef.current) break;
        const ac = new AbortController();
        batchAssetAbortRef.current = ac;
        const out = await runSingleAsset(
          s.index,
          s.visualDescription,
          s.narration,
          coverRef,
          { signal: ac.signal },
        );
        if (out.cancelled || stopBatchRef.current) break;
        if (out.success && out.url) {
          urlByIndex[s.index] = out.url;
        }
        if (stopBatchRef.current) break;
      }
    } finally {
      setBatchBusy(false);
    }
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
                    绿点表示模型档案或语音线路密钥已就绪
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
                          <select
                            aria-label="文案分镜模型厂商"
                            className={`${headerSelectClass} cursor-pointer`}
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
                          <select
                            aria-label="文案分镜模型档案"
                            className={`${headerSelectClass} cursor-pointer`}
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
                          <select
                            aria-label="文生图厂商"
                            className={`${headerSelectClass} cursor-pointer`}
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
                          <select
                            aria-label="文生图档案"
                            className={`${headerSelectClass} cursor-pointer`}
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
                  <div
                    className={`min-w-0 flex-1 border-t border-zinc-800/50 pt-4 xl:border-t-0 xl:pt-0 xl:border-l xl:border-zinc-800/50 xl:pl-6`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className={headerApiGroupClass}>语音合成</span>
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          ttsConfig === null ? "bg-zinc-600/50"
                          : ttsConfig.volcengine ?
                            "bg-emerald-500/85 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                          : "bg-amber-600/50"
                        }`}
                        title={
                          ttsConfig === null ? "正在检测…"
                          : ttsConfig.volcengine ?
                            "火山豆包线路密钥已配置（试听与逐镜语音使用）"
                          : "火山豆包线路未检测到 VOLCENGINE_TTS_*"
                        }
                      />
                    </div>
                    {ttsConfig === null ?
                      <p className="text-[10px] leading-relaxed text-zinc-600">
                        正在检测语音合成配置…
                      </p>
                    : <div className="space-y-2 text-[11px] leading-snug text-zinc-400">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              ttsConfig.volcengine ?
                                "bg-emerald-500/80"
                              : "bg-zinc-600/70"
                            }`}
                            aria-hidden
                          />
                          <span className="font-medium text-zinc-300">
                            火山豆包
                          </span>
                          <span className="text-zinc-600">
                            {ttsConfig.volcengine ? "已配置" : "未配置"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${
                              ttsConfig.iflytek ?
                                "bg-emerald-500/80"
                              : "bg-zinc-600/70"
                            }`}
                            aria-hidden
                          />
                          <span className="font-medium text-zinc-300">
                            讯飞在线
                          </span>
                          <span className="text-zinc-600">
                            {ttsConfig.iflytek ?
                              "已配置（接口可用，创作中心默认走火山）"
                            : "未配置"}
                          </span>
                        </div>
                      </div>
                    }
                  </div>
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
                    预设或自拟
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
                    <span className={groupTitleClass}>当前系列名 · 自拟</span>
                    <input
                      className={`${fieldClass} mt-1.5 min-w-0 w-full`}
                      placeholder="选预设填入，或直接输入系列名"
                      value={seriesTitle}
                      onChange={(e) => setSeriesTitle(e.target.value)}
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </section>

              <section className={stepInnerCardClass} aria-label="人物">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className={stepBlockTitleClass}>人物与背景</h3>
                    <p className="mt-1 text-[11px] text-zinc-600">
                      点「AI 推荐相关人物」按系列生成人选、形象与朝代；再次点击会排除当前列表中的人选。
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
                      AI 推荐 · 点击填入人物、形象与朝代
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {characterSuggestions.map((c) => (
                        <li key={c.name}>
                          <button
                            type="button"
                            onClick={() => applyCharacterSuggestion(c)}
                            className="w-full rounded-xl border border-zinc-700/90 bg-zinc-900/60 px-3 py-2.5 text-left transition hover:border-amber-600/45 hover:bg-zinc-900 hover:text-amber-100/90"
                          >
                            <span className="block text-xs text-zinc-200">
                              {c.name}
                            </span>
                            {c.dynasty ? (
                              <span className="mt-0.5 block text-[10px] font-medium text-sky-200/80">
                                {c.dynasty}
                              </span>
                            ) : null}
                            {c.appearance ? (
                              <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">
                                {c.appearance}
                              </span>
                            ) : null}
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
                      placeholder="如：曹操（AI 推荐或手填）"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={groupTitleClass}>
                      朝代 / 背景{" "}
                      <span className="font-normal text-zinc-600">
                        （选填 · AI 推荐可自动填入）
                      </span>
                    </span>
                    <input
                      className={`${fieldClass} mt-1.5`}
                      placeholder="如：东汉末 / 唐 · 不填由模型推断"
                      value={dynasty}
                      onChange={(e) => setDynasty(e.target.value)}
                    />
                  </label>
                  <label className="block min-w-0 sm:col-span-2">
                    <span className={groupTitleClass}>
                      形象描述{" "}
                      <span className="font-normal text-zinc-600">（选填）</span>
                    </span>
                    <textarea
                      className={`${fieldClass} mt-1.5 min-h-[4.5rem] resize-y`}
                      placeholder="如：中年将领，武冠战袍，眉宇沉毅，目光如炬（AI 推荐可自动填入）"
                      value={subjectAppearance}
                      onChange={(e) => setSubjectAppearance(e.target.value)}
                      rows={2}
                    />
                  </label>
                </div>
              </section>
            </div>
          </div>

          <div
            className={`${panelClass} border-l-2 border-l-emerald-600/35`}
          >
            <div className="min-w-0">
              <p className={sectionLabelClass}>步骤 2 · 生成封面图</p>

              {!mediaProfilesError &&
              imageProfiles.length > 0 &&
              !selectedImageProfile?.configured ? (
                <p className="mt-3 max-w-xl rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100/90">
                  当前文生图档案未检测到密钥，封面请求可能失败。请在页顶更换已配置的静帧档案。
                </p>
              ) : null}
              <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-zinc-400">
                根据步骤 1 的<strong className="font-medium text-zinc-500">人物、形象描述</strong>
                与<strong className="font-medium text-zinc-500">朝代/背景</strong>
                ，结合下方<strong className="font-medium text-zinc-500">画风预设</strong>
                生成竖屏外宣底图；纯画面无内嵌字，人物居左、右侧留白。
              </p>
            </div>
            <div className="mt-5 border-t border-zinc-800/70 pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <label className="block min-w-0 flex-1 sm:max-w-md">
                  <span className={groupTitleClass}>画风预设（封面与分镜）</span>
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
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end sm:gap-3">
                  <input
                    ref={coverUploadInputRef}
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    onChange={handleCoverUploadFileChange}
                  />
                  <button
                    type="button"
                    disabled={
                      batchBusy ||
                      coverUploadBusy ||
                      coverRequest.status === "running" ||
                      !subject.trim() ||
                      coverGallery.length >= MAX_COVER_GALLERY
                    }
                    title={
                      !subject.trim() ?
                        "请先填写步骤 1 的「人物/主题」"
                      : coverGallery.length >= MAX_COVER_GALLERY ?
                        `已达 ${MAX_COVER_GALLERY} 张上限，请先勾选并删除若干封面后再上传`
                      : "上传到火山引擎对象存储（TOS），用于封面预览、保存至切片目录及分镜图生图参考"
                    }
                    onClick={() => coverUploadInputRef.current?.click()}
                    className={coverUploadBtnClass}
                  >
                    {coverUploadBusy ? "封面上传中…" : "上传封面图"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      batchBusy ||
                      coverUploadBusy ||
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
                    : "生成封面图"}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5 border-t border-zinc-800/70 pt-5">
              {coverRequest.status === "failed" && coverRequest.error ? (
                <p className="mb-2 max-w-2xl text-sm leading-snug text-rose-200">
                  {coverRequest.error}
                </p>
              ) : null}
              {coverRequest.status === "running" ? (
                <p className="text-[11px] text-amber-200/80">正在请求封面…</p>
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
                                  "封面图（最新）"
                                : "历史封面图"
                              }
                              className="aspect-[9/16] w-full object-cover object-center"
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
                  {coverGallery.length >= MAX_COVER_GALLERY &&
                  coverRequest.status !== "running" ? (
                    <p className="mt-3 max-w-2xl rounded-lg border border-amber-900/45 bg-amber-950/20 px-3 py-2 text-[11px] leading-relaxed text-amber-100/95">
                      已满 {MAX_COVER_GALLERY}{" "}
                      张。请勾选需移除的封面，点击下方「删除已勾选」清空名额；若该张已成功自动保存至项目目录，将同步删除磁盘上的对应文件。
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className={`${panelClass} border-l-2 border-l-amber-600/25`}>
            <div>
              <p className={sectionLabelClass}>高光切片 · 步骤 3</p>
            </div>

            {slicesHint ? (
              <p className="mt-3 rounded-xl border border-rose-900/45 bg-rose-950/25 px-3 py-2.5 text-xs leading-relaxed text-rose-100/95">
                {slicesHint}
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 border-t border-zinc-800/80 pt-5 sm:grid-cols-2">
              <div className="block sm:col-span-2">
                <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                  <label className="flex min-w-0 flex-1 flex-col">
                    <span className={groupTitleClass}>切片标题</span>
                    <input
                      className={`${fieldClass} mt-1.5 w-full`}
                      placeholder="如：离皇位最近却不敢坐的人"
                      value={sliceTitle}
                      onChange={(e) => setSliceTitle(e.target.value)}
                    />
                  </label>
                  <label className="flex w-full shrink-0 flex-col sm:w-[12rem]">
                    <span className={groupTitleClass}>叙事时长</span>
                    <select
                      className={`${fieldClass} mt-1.5`}
                      value={videoDurationMin}
                      onChange={(e) => {
                        setVideoDurationMin(
                          Number(e.target.value) as VideoDurationMin,
                        );
                      }}
                    >
                      {VIDEO_DURATION_UI_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      suggestSlicesBusy || !seriesTitle.trim() || !subject.trim()
                    }
                    onClick={runSuggestSubtitles}
                    className={`${aiActionClass} w-full shrink-0 sm:w-auto sm:px-6`}
                  >
                    {suggestSlicesBusy ? "推荐中…" : "AI 推荐切片标题"}
                  </button>
                </div>
              </div>
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
            {sliceSuggestions.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium text-zinc-500">
                  AI 推荐 · 点击填入上方标题与切片说明
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

          <footer className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 px-4 py-5 sm:px-5">
            <p className={sectionLabelClass}>步骤 4 · 生成文案与分镜</p>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-zinc-500">
              叙事时长在步骤 3「切片标题」行右侧选择，会参与「AI
              推荐切片标题」与主生成镜数体量。请先设扩写切段与叙事基调。主流程固定为三步：叙事骨架（L1）→
              整稿口播（L2）→ 分镜扩写（L3），便于在中间确认口播再出分镜。完成后在下方批量出静帧。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-800/70 pt-4 sm:grid-cols-2 sm:items-end">
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
            <div className="mt-4 border-t border-zinc-800/70 pt-4">
              <button
                type="button"
                onClick={() => void runGenerate()}
                disabled={
                  loading ||
                  !subject.trim() ||
                  result?.pipelinePending === "scenes" ||
                  result?.pipelinePending === "voiceover"
                }
                className={stepPrimaryGenerateStandaloneBtnClass}
              >
                {loading ?
                  "生成中…"
                : result?.pipelinePending === "scenes" ?
                  "下一步：整稿区「生成分镜」"
                : result?.pipelinePending === "voiceover" ?
                  "叙事骨架（L1）已生成"
                : "生成叙事骨架（L1）"}
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
            <div className="flex flex-col gap-3 border-b border-zinc-800/80 bg-zinc-950/30 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                  {result.pipelinePending !== "voiceover" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVoiceoverDraftPanelExpanded((v) => !v)
                      }
                      className="mt-0.5 shrink-0 rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800/85 hover:text-zinc-200"
                      aria-expanded={voiceoverDraftPanelExpanded}
                      aria-controls={
                        voiceoverDraftPanelExpanded ?
                          "historai-voiceover-draft-panel"
                        : undefined
                      }
                      title={
                        voiceoverDraftPanelExpanded ?
                          "收起整稿口播全文"
                        : "展开整稿口播全文"
                      }
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                        className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                          voiceoverDraftPanelExpanded ? "rotate-0" : "-rotate-90"
                        }`}
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  ) : (
                    <span
                      className="mt-0.5 w-7 shrink-0"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={sectionLabelClass}>整稿口播（L2）</p>
                    <h2 className="mt-1 font-display text-base font-medium text-amber-100/95">
                      {result.pipelinePending === "voiceover" ?
                        "叙事骨架已定 · 请生成或粘贴整稿口播"
                      : result.pipelinePending === "scenes" ?
                        "请确认口播后再生成分镜"
                      : "顺读主干 · 可编辑后可重出分镜"}
                    </h2>
                    {result.pipelinePending !== "voiceover" &&
                    !voiceoverDraftPanelExpanded &&
                    voiceoverDraft.trim() ?
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-snug text-zinc-400">
                        {voiceoverDraft}
                      </p>
                    : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {result.pipelinePending === "voiceover" ?
                  <button
                    type="button"
                    disabled={
                      loading ||
                      !subject.trim() ||
                      !result.sceneSkeleton?.length
                    }
                    onClick={() => void runGenerateVoiceoverOnly()}
                    title="在已定的叙事骨架上生成整稿口播（L2）"
                    className={voiceoverToolbarPrimaryBtn}
                  >
                    {loading ? "生成中…" : "生成整稿口播（L2）"}
                  </button>
                : null}
                <button
                  type="button"
                  disabled={
                    voiceoverTtsBusy ||
                    loading ||
                    result.pipelinePending === "voiceover" ||
                    !voiceoverDraft.trim() ||
                    (volcTtsVoicePreset === VOLCENGINE_TTS_VOICE_CUSTOM &&
                      !volcTtsVoiceCustom.trim())
                  }
                  onClick={() => void runVolcengineVoiceoverTts()}
                  title="使用当前口播全文调用火山引擎豆包语音（需在 .env 配置 VOLCENGINE_TTS_*）；音色以下拉为准"
                  className={voiceoverToolbarTtsBtn}
                >
                  <svg
                    className="h-3.5 w-3.5 shrink-0 opacity-95"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M17.66 6.34a8 8 0 0 1 0 11.32" />
                  </svg>
                  {voiceoverTtsBusy ? "合成中…" : "豆包语音试听"}
                </button>
                <span
                  className="hidden h-6 w-px shrink-0 self-center bg-zinc-700/55 sm:block"
                  aria-hidden
                />
                <button
                  type="button"
                  disabled={
                    loading ||
                    !result.sceneSkeleton?.length ||
                    !voiceoverDraft.trim()
                  }
                  onClick={() => void runRegenerateFromVoiceover()}
                  title="保留当前 L1（黄金开头、时间线、分镜骨架），按下方口播生成分镜与画面描述（会清空已出图状态）"
                  className={voiceoverToolbarPrimaryBtn}
                >
                  {loading ?
                    "请求中…"
                  : result.pipelinePending === "scenes" ?
                    "生成分镜与画面稿"
                  : "按当前口播重出分镜"}
                </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-zinc-500">
                  豆包音色
                </span>
                <select
                  value={volcTtsVoicePreset}
                  onChange={(e) => setVolcTtsVoicePreset(e.target.value)}
                  className={`${headerSelectClass} max-w-full sm:max-w-[11.5rem]`}
                  aria-label="豆包语音音色"
                >
                  {VOLCENGINE_TTS_VOICE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id} title={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value={VOLCENGINE_TTS_VOICE_CUSTOM}>
                    自定义 voice_type…
                  </option>
                </select>
                {volcTtsVoicePreset === VOLCENGINE_TTS_VOICE_CUSTOM ?
                  <input
                    type="text"
                    value={volcTtsVoiceCustom}
                    onChange={(e) => setVolcTtsVoiceCustom(e.target.value)}
                    placeholder="例如 VC_BV411_streaming"
                    spellCheck={false}
                    className={`${headerSelectClass} min-w-[8rem] flex-1 sm:max-w-[14rem]`}
                    aria-label="自定义豆包 voice_type"
                  />
                : null}
              </div>
            </div>
            {result.pipelinePending !== "voiceover" &&
            (voiceoverTtsFeedback || voiceoverTtsAudioUrl) ?
              <div className="space-y-2 border-b border-zinc-800/70 bg-zinc-950/22 px-5 py-3 sm:px-6">
                {voiceoverTtsFeedback ?
                  <p
                    className={
                      voiceoverTtsFeedback.kind === "error" ?
                        "text-[12px] leading-relaxed text-rose-300/95"
                      : "text-[12px] leading-relaxed text-emerald-200/85"
                    }
                  >
                    {voiceoverTtsFeedback.text}
                  </p>
                : null}
                {voiceoverTtsAudioUrl ?
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <audio
                        controls
                        className="h-9 min-w-[min(100%,14rem)] flex-1 max-w-lg rounded-md"
                        src={voiceoverTtsAudioUrl}
                      >
                        您的浏览器不支持音频播放。
                      </audio>
                      <a
                        href={voiceoverTtsAudioUrl}
                        download={voiceoverTtsDownloadFilename}
                        className={`${voiceoverToolbarSecondaryBtn} shrink-0 no-underline`}
                      >
                        下载到本机
                      </a>
                      <button
                        type="button"
                        disabled={
                          voiceoverTtsSaveBusy ||
                          !voiceoverTtsLastPayloadRef.current
                        }
                        onClick={() => void saveVoiceoverTtsToSliceFolder()}
                        title="写入 slice-exports/主角_标题/，与自动保存的封面相同文件夹规则"
                        className={`${voiceoverToolbarTtsBtn} shrink-0`}
                      >
                        {voiceoverTtsSaveBusy ? "保存中…" : "保存到切片文件夹"}
                      </button>
                    </div>
                    {voiceoverTtsSaveHint ?
                      <p
                        className={
                          voiceoverTtsSaveHint.includes("失败") ||
                          voiceoverTtsSaveHint.includes("请先") ?
                            "text-[11px] leading-relaxed text-rose-300/90"
                          : "text-[11px] leading-relaxed text-emerald-200/85"
                        }
                      >
                        {voiceoverTtsSaveHint}
                      </p>
                    : null}
                  </div>
                : null}
              </div>
            : null}
            {result.pipelinePending === "voiceover" ? (
              <div className="p-5 sm:p-6">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-6 text-center text-sm text-zinc-400">
                  尚未生成整稿口播。请点击本区顶部工具栏「
                  <span className="text-amber-200/90">生成整稿口播（L2）</span>
                  」（豆包试听左侧）生成口播稿。
                </div>
              </div>
            ) : voiceoverDraftPanelExpanded ?
              <div
                id="historai-voiceover-draft-panel"
                className="p-5 sm:p-6"
              >
                <p className="mb-3 text-[12px] leading-relaxed text-zinc-500">
                  以下为当前口播稿。修改后可「豆包语音试听」（上方选音色；
                  服务端需配置 VOLCENGINE_TTS_*），再点击右侧「
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
              </div>
            : null}
          </section>

          {result.pipelinePending === "voiceover" ? (
            <section className="rounded-2xl border border-sky-900/35 bg-sky-950/15 px-5 py-4 sm:px-6">
              <p className="text-sm font-medium text-sky-100/95">
                当前仅有 L1（黄金开头、时间线、分镜骨架），整稿口播待生成。
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-sky-100/75">
                使用整稿口播区顶部「生成整稿口播（L2）」（在豆包试听左侧），完成后再编辑并扩写分镜。
              </p>
            </section>
          ) : null}

          {result.pipelinePending === "scenes" ? (
            <section className="rounded-2xl border border-amber-900/35 bg-amber-950/15 px-5 py-4 sm:px-6">
              <p className="text-sm font-medium text-amber-100/95">
                当前已有整稿口播，尚未生成分镜表（L3）。
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-amber-100/70">
                确认口播后可「豆包语音试听」（配置火山 TTS
                后），再点击整稿区「生成分镜与画面稿」；完成后下方会出现分镜表与出图入口。
              </p>
            </section>
          ) : null}

          {result && !result.pipelinePending ? (
          <section className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/45 via-zinc-950/50 to-zinc-950/70 shadow-xl shadow-black/25 ring-1 ring-zinc-800/40">
            <div className="relative border-b border-zinc-800/75 bg-gradient-to-br from-zinc-950/90 via-zinc-950/55 to-zinc-950/80 px-5 py-5 sm:px-6">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent"
                aria-hidden
              />
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className={sectionLabelClass}>分镜扩写（L3）</p>
                  <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-amber-50/95 sm:text-xl">
                    分镜与素材
                  </h2>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-500">
                    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-900/80 px-2 py-0.5 font-medium tabular-nums text-zinc-400 ring-1 ring-zinc-800/70">
                      共 {result.scenes.length} 镜
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="tabular-nums">
                      目标总时长约{" "}
                      {result.scenes.reduce((acc, sc) => acc + sc.durationSec, 0)}
                      s
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span>静帧竖屏 9:16</span>
                  </p>
                  {sliceSaveHint ? (
                    <p className="mt-3 max-w-xl rounded-lg border border-emerald-900/40 bg-emerald-950/25 px-3 py-2 text-[11px] leading-relaxed text-emerald-100/90 ring-1 ring-emerald-900/25">
                      {sliceSaveHint}
                    </p>
                  ) : null}
                </div>
                <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={
                      batchBusy ||
                      sceneTtsBatchBusy ||
                      !latestCoverUrl
                    }
                    onClick={() => void runRemainingAssetsFromCover()}
                    className={storyboardBatchToolbarBtn}
                  >
                    {batchBusy ? "生成中…" : "按封面批量"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      batchBusy ||
                      sceneTtsBatchBusy ||
                      !result?.scenes.length
                    }
                    onClick={runAllAssets}
                    className={storyboardBatchToolbarBtn}
                  >
                    {batchBusy ? "批量生成中…" : "按上一镜批量"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      sceneTtsBatchBusy ||
                      batchBusy ||
                      !canBatchSceneTts ||
                      !result?.scenes.some((sc) => sc.narration.trim())
                    }
                    onClick={() => void runBatchSceneTts()}
                    className={storyboardBatchToolbarBtn}
                  >
                    {sceneTtsBatchBusy ? "批量合成中…" : "批量生成语音"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      exportBundleBusy ||
                      batchBusy ||
                      sceneTtsBatchBusy ||
                      !canExportSliceBundle
                    }
                    onClick={() => void runExportSliceBundle()}
                    className={storyboardBatchToolbarBtn}
                  >
                    {exportBundleBusy ? "导出中…" : "导出资源"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      seedancePromptBusy ||
                      seedanceSingleBusyIndex !== null ||
                      loading ||
                      batchBusy ||
                      sceneTtsBatchBusy ||
                      exportBundleBusy ||
                      !result?.scenes.length ||
                      !subject.trim()
                    }
                    onClick={() => void runBatchSeedancePrompts()}
                    className={`${storyboardBatchToolbarBtn} ring-1 ring-violet-600/35`}
                    title="按导演思维拆解各镜 visualDescription，生成 Seedance 图生视频适用文案（分批调用模型）"
                  >
                    {seedancePromptBusy ? "生成中…" : "批量 Seedance 文案"}
                  </button>
                  {batchBusy ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopBatchRef.current = true;
                        batchAssetAbortRef.current?.abort();
                        setBatchBusy(false);
                      }}
                      className={storyboardBatchToolbarStopBtn}
                    >
                      停止生成
                    </button>
                  ) : null}
                  {sceneTtsBatchBusy ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopSceneTtsBatchRef.current = true;
                      }}
                      className={storyboardBatchToolbarStopBtn}
                    >
                      停止语音批量
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="px-3 pb-5 pt-1 sm:px-5 sm:pb-6">
              <div className="overflow-hidden rounded-xl border border-zinc-800/55 bg-zinc-950/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ring-1 ring-black/25">
                <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    <th className="sticky top-0 z-10 w-[4.5rem] border-b border-zinc-800/80 bg-zinc-950/98 py-3.5 pr-2 pl-3 backdrop-blur-md sm:w-[5rem] sm:pl-4">
                      镜号
                    </th>
                    <th className="sticky top-0 z-10 w-[7.5rem] border-b border-zinc-800/80 bg-zinc-950/98 py-3.5 pr-2 backdrop-blur-md sm:w-[8rem]">
                      状态
                    </th>
                    <th className="sticky top-0 z-10 min-w-[220px] border-b border-zinc-800/80 bg-zinc-950/98 py-3.5 pr-3 backdrop-blur-md">
                      画面与预览
                    </th>
                    <th className="sticky top-0 z-10 min-w-[160px] border-b border-zinc-800/80 bg-zinc-950/98 py-3.5 pr-3 backdrop-blur-md">
                      口播
                    </th>
                    <th className="sticky top-0 z-10 min-w-[13.5rem] border-b border-zinc-800/80 bg-zinc-950/98 py-3.5 pr-4 pl-1 backdrop-blur-md">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-b-0">
                  {result.scenes.map((s) => {
                    const row = assets[s.index];
                    const imgBadge =
                      row?.status === "running" ? (
                        <span className={badgeRunning}>生成中</span>
                      ) : row?.status === "success" ? (
                        <span className={badgeSuccess}>已出图</span>
                      ) : row?.status === "failed" ? (
                        <span className={badgeFail} title={row?.error}>
                          失败
                        </span>
                      ) : (
                        <span className={badgeMuted}>未生成</span>
                      );
                    const ttsRow = sceneTtsByIndex[s.index];
                    const ttsBadge =
                      ttsRow?.status === "running" ? (
                        <span className={badgeRunning}>合成中</span>
                      ) : ttsRow?.status === "success" ? (
                        <span className={badgeSuccess}>已保存</span>
                      ) : ttsRow?.status === "failed" ? (
                        <span className={badgeFail} title={ttsRow.error}>
                          失败
                        </span>
                      ) : (
                        <span className={badgeMuted}>未生成</span>
                      );
                    return (
                      <tr
                        key={s.index}
                        className="group border-b border-zinc-800/45 align-top transition-colors hover:bg-zinc-900/25"
                      >
                        <td className="py-4 pr-2 pl-3 align-top sm:pl-4">
                          <div className="flex flex-col items-center gap-2">
                            <span
                              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-zinc-800/95 to-zinc-900/95 text-sm font-bold tabular-nums text-amber-100 shadow-sm ring-2 ring-amber-600/20 ring-offset-2 ring-offset-zinc-950"
                              aria-label={`第 ${s.index} 镜`}
                            >
                              {s.index}
                            </span>
                            <span className="rounded-md bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-400 ring-1 ring-zinc-700/70">
                              {s.durationSec}s
                            </span>
                          </div>
                        </td>
                        <td className="py-4 pr-2 align-top">
                          <div className="flex max-w-[12rem] flex-col gap-2">
                            <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 ring-1 ring-zinc-800/35">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                                  静帧
                                </span>
                                {imgBadge}
                              </div>
                              {row?.status === "failed" && row.error ? (
                                <p className="mt-1.5 text-[10px] leading-snug text-rose-300/95">
                                  {row.error}
                                </p>
                              ) : null}
                            </div>
                            <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 ring-1 ring-zinc-800/35">
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                                  语音
                                </span>
                                {ttsBadge}
                              </div>
                              {ttsRow?.status === "failed" && ttsRow.error ? (
                                <p className="mt-1.5 text-[10px] leading-snug text-rose-300/95">
                                  {ttsRow.error}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 pr-3 align-top text-zinc-300">
                          <div className="rounded-xl border border-zinc-800/65 bg-gradient-to-b from-zinc-950/55 to-zinc-950/30 p-3 ring-1 ring-zinc-800/40">
                            <p className="max-w-md text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-300/95">
                              {s.visualDescription}
                            </p>
                          </div>
                          <div className="mt-3 flex max-w-[14rem] flex-col gap-2">
                            {row?.url ? (
                              <div className="overflow-hidden rounded-xl bg-black/50 shadow-inner ring-1 ring-zinc-700/80 transition group-hover:ring-zinc-600/70">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={row.url}
                                  alt={`第 ${s.index} 镜静帧`}
                                  className="aspect-[9/16] max-h-44 w-full object-cover object-center"
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-4 pr-3 align-top">
                          <div className="rounded-xl border border-zinc-800/65 bg-gradient-to-b from-zinc-950/55 to-zinc-950/30 p-3 ring-1 ring-zinc-800/40">
                            <p className="text-[13px] leading-relaxed text-zinc-300/95">
                              {s.narration}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 pr-4 pl-1 align-top">
                          <div className={storyboardOpStack}>
                            {s.index > 1 ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  disabled={row?.status === "running"}
                                  title={
                                    "与顶部「按上一镜批量」同一规则：优先以上一镜成片为参考（支持图生图时）；上一镜尚未出图则用封面图。"
                                  }
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
                                  按上一镜出图
                                </button>
                                <button
                                  type="button"
                                  disabled={row?.status === "running"}
                                  title="不传封面或上一镜参考图，按本分镜与口播（及页顶系列/切片语境）出图；远景、对峙或视角跳变时可避免构图被参考帧黏住。"
                                  className={storyboardOpSecondaryBtn}
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
                                <button
                                  type="button"
                                  disabled={
                                    !latestCoverUrl || row?.status === "running"
                                  }
                                  title={
                                    latestCoverUrl ?
                                      "以封面为参考强锁主角样貌；大场面或换视角可改用上方「按切片内容生成」（需档案支持参考图）"
                                    : "请先在「步骤 2 · 生成封面图」成功生成封面图"
                                  }
                                  className={storyboardOpCoverRefBtn}
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
                            <div className={storyboardOpDivider} />
                            <button
                              type="button"
                              disabled={
                                !s.narration.trim() ||
                                !subject.trim() ||
                                !volcTtsEffectiveVoiceType.trim() ||
                                sceneTtsByIndex[s.index]?.status === "running" ||
                                sceneTtsBatchBusy
                              }
                              title={
                                !volcTtsEffectiveVoiceType.trim() ?
                                  "请先在整稿口播区上方选择豆包音色"
                                : "读本镜旁白，火山豆包 TTS 合成并写入 slice-exports（fileStem：…-scene-audio-镜号）"
                              }
                              className={storyboardOpTtsBtn}
                              onClick={() =>
                                void runSceneTtsSave(s.index, s.narration)
                              }
                            >
                              {sceneTtsByIndex[s.index]?.status === "running"
                                ? "合成中…"
                                : "生成语音"}
                            </button>
                            <div className={storyboardOpDivider} />
                            <button
                              type="button"
                              disabled={
                                seedancePromptBusy ||
                                seedanceSingleBusyIndex !== null ||
                                loading ||
                                batchBusy ||
                                sceneTtsBatchBusy ||
                                !subject.trim() ||
                                !s.visualDescription.trim()
                              }
                              title="仅本镜：根据 visualDescription 生成 Seedance 图生视频文案"
                              className={storyboardOpSecondaryBtn}
                              onClick={() =>
                                void runSingleSeedancePrompt(s.index)
                              }
                            >
                              {seedanceSingleBusyIndex === s.index ?
                                "Seedance…"
                              : "Seedance 文案"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
                </div>
              </div>
              {seedancePromptError ? (
                <p className="mt-3 text-sm leading-relaxed text-rose-300/95">
                  {seedancePromptError}
                </p>
              ) : null}
              {Object.keys(seedancePromptByIndex).length > 0 ? (
                <div className="mt-4 rounded-xl border border-violet-900/40 bg-violet-950/[0.12] p-4 ring-1 ring-violet-900/25 sm:p-5">
                  <p className={sectionLabelClass}>Seedance 图生视频文案</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    基于 L3 各镜 visualDescription，对照「主体→动作→环境→镜头→风格→约束」输出分析与可直接粘贴的优化提示词；请以<strong className="text-zinc-400">本镜静帧</strong>
                    为参考图接入 Seedance。
                  </p>
                  <div className="mt-3 max-h-[min(70vh,28rem)] space-y-2 overflow-y-auto pr-1">
                    {result.scenes.map((s) => {
                      const sd = seedancePromptByIndex[s.index];
                      if (!sd) return null;
                      return (
                        <details
                          key={`seedance-${s.index}`}
                          className="group rounded-lg border border-zinc-800/65 bg-zinc-950/45 open:bg-zinc-950/55"
                        >
                          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-violet-100/95 marker:content-none [&::-webkit-details-marker]:hidden">
                            <span className="inline-flex items-center gap-2">
                              <span className="tabular-nums">第 {s.index} 镜</span>
                              <span className="text-[11px] font-normal text-zinc-500">
                                · Seedance / 图生视频
                              </span>
                            </span>
                          </summary>
                          <div className="space-y-3 border-t border-zinc-800/55 px-3 py-3 text-[12px] leading-relaxed text-zinc-300">
                            <div>
                              <p className="font-semibold text-zinc-400">
                                图生视频适配度
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">
                                {sd.adaptationFit}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-zinc-400">
                                Seedance 风格与模板要点
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">
                                {sd.officialTemplateNotes}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-zinc-400">
                                必要添加项与优化建议
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">
                                {sd.suggestions}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-amber-200/80">
                                优化参考版本（可粘贴）
                              </p>
                              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-3 font-mono text-[11px] text-zinc-200">
                                {sd.optimizedPrompt}
                              </pre>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          ) : null}
        </>
      )}
    </div>
  );
}
