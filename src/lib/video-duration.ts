import type { VideoDurationMin } from "@/lib/types";

/**
 * 界面「叙事时长」每一档对应的成片体量参数（镜数、总秒数、timeline、单镜时长等）。
 * 具体含义见各字段注释；档位数据见 {@link VIDEO_DURATION_PRESETS}。
 */
export interface VideoDurationPreset {
  /** 与 UI / {@link VideoDurationMin} 一致的档位键（成片目标分钟数） */
  minutes: VideoDurationMin;
  /** 写入提示词的体量短标签，如「约 1 分钟」 */
  labelShort: string;
  /** 分镜条数（镜数）推荐下限：叙事骨架 / 整稿 / 扩写时约束「大约多少镜」讲清切片 */
  minScenes: number;
  /** 分镜条数（镜数）推荐上限 */
  maxScenes: number;
  /** 中段连续递进最少镜数（不含开篇与收尾若干镜），避免核心过程一笔带过 */
  midStreakMin: number;
  /** 各镜 `durationSec` 之和的目标下限（秒） */
  minTotalSec: number;
  /** 各镜 `durationSec` 之和的目标上限（秒） */
  maxTotalSec: number;
  /**
   * 总时长软下限（秒）：全片加总明显低于此时，本地可对各镜做温和补足（如逐镜 +1s），
   * 见 `boostSceneDurationsIfShort`。
   */
  softMinTotalSec: number;
  /** `timeline` 数组段数的**服务端硬下限**；校验须 `length >= timelineMin` */
  timelineMin: number;
  /**
   * `timeline` 段数的**建议参考上限**（写入提示词，引导紧凑）；**不作为服务端上界**，
   * 上界见 {@link TIMELINE_SEGMENTS_HARD_MAX}。
   */
  timelineMax: number;
  /** 口播「禁止从约本镜起连续多段只有隐喻」等规则的起算镜序（约） */
  metaphorFromSceneApprox: number;
  /** 单镜时长居中参考（秒）：骨架示例默认值、口播字数与时长对齐的参照 */
  perSceneCenterSec: number;
  /** 单镜 `durationSec` 允许下限（秒），与校验/提示一致 */
  perSceneMinSec: number;
  /** 单镜 `durationSec` 允许上限（秒），与校验/提示一致 */
  perSceneMaxSec: number;
  /** 单镜秒数允许范围的展示文案（写入提示词），如「5～10」 */
  perSceneRangeLabel: string;
  /** 单镜「更推荐」的秒数区间文案（写入提示词），如「6～9」，引导少贴下限糊弄 */
  perScenePreferredLabel: string;
  /** 视为「过短镜」的秒数阈值；提示中写避免大量使用低于此值的时长 */
  shortSceneWarnBelow: number;
}

/**
 * `timeline` 段数绝对上限（防模型输出失控过长 JSON）。
 * 校验规则：`timeline.length` 须 **≥** 当前档位 {@link VideoDurationPreset.timelineMin}，
 * 且 **≤** 本常量；档位 {@link VideoDurationPreset.timelineMax} 仅作提示建议，不卡上界。
 */
export const TIMELINE_SEGMENTS_HARD_MAX = 32;

/** 各叙事时长档位 → 体量参数；键与 {@link VideoDurationPreset.minutes} 一致 */
export const VIDEO_DURATION_PRESETS: Record<
  VideoDurationMin,
  VideoDurationPreset
> = {
  1: {
    minutes: 1,
    labelShort: "约 1 分钟",
    minScenes: 8,
    maxScenes: 12,
    midStreakMin: 4,
    minTotalSec: 54,
    maxTotalSec: 88,
    softMinTotalSec: 50,
    timelineMin: 3,
    timelineMax: 6,
    metaphorFromSceneApprox: 6,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 10,
    perSceneRangeLabel: "5～10",
    perScenePreferredLabel: "6～9",
    shortSceneWarnBelow: 4,
  },
  3: {
    minutes: 3,
    labelShort: "约 3 分钟",
    minScenes: 18,
    maxScenes: 26,
    midStreakMin: 12,
    minTotalSec: 160,
    maxTotalSec: 200,
    softMinTotalSec: 150,
    timelineMin: 5,
    timelineMax: 9,
    metaphorFromSceneApprox: 14,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 11,
    perSceneRangeLabel: "5～11",
    perScenePreferredLabel: "6～10",
    shortSceneWarnBelow: 4,
  },
  5: {
    minutes: 5,
    labelShort: "约 5 分钟",
    minScenes: 34,
    maxScenes: 48,
    midStreakMin: 22,
    minTotalSec: 270,
    maxTotalSec: 330,
    softMinTotalSec: 255,
    timelineMin: 6,
    timelineMax: 12,
    metaphorFromSceneApprox: 24,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 12,
    perSceneRangeLabel: "5～12",
    perScenePreferredLabel: "6～11",
    shortSceneWarnBelow: 4,
  },
  8: {
    minutes: 8,
    labelShort: "约 8 分钟",
    minScenes: 54,
    maxScenes: 74,
    midStreakMin: 36,
    minTotalSec: 444,
    maxTotalSec: 516,
    softMinTotalSec: 426,
    timelineMin: 8,
    timelineMax: 14,
    metaphorFromSceneApprox: 39,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 12,
    perSceneRangeLabel: "5～12",
    perScenePreferredLabel: "6～11",
    shortSceneWarnBelow: 4,
  },
  10: {
    minutes: 10,
    labelShort: "约 10 分钟",
    minScenes: 68,
    maxScenes: 92,
    midStreakMin: 46,
    minTotalSec: 560,
    maxTotalSec: 640,
    softMinTotalSec: 540,
    timelineMin: 10,
    timelineMax: 16,
    metaphorFromSceneApprox: 50,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 12,
    perSceneRangeLabel: "5～12",
    perScenePreferredLabel: "6～11",
    shortSceneWarnBelow: 4,
  },
  12: {
    minutes: 12,
    labelShort: "约 12 分钟",
    minScenes: 81,
    maxScenes: 107,
    midStreakMin: 56,
    minTotalSec: 672,
    maxTotalSec: 768,
    softMinTotalSec: 652,
    timelineMin: 12,
    timelineMax: 18,
    metaphorFromSceneApprox: 60,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 12,
    perSceneRangeLabel: "5～12",
    perScenePreferredLabel: "6～11",
    shortSceneWarnBelow: 4,
  },
  15: {
    minutes: 15,
    labelShort: "约 15 分钟",
    minScenes: 100,
    maxScenes: 130,
    midStreakMin: 70,
    minTotalSec: 840,
    maxTotalSec: 960,
    softMinTotalSec: 820,
    timelineMin: 14,
    timelineMax: 22,
    metaphorFromSceneApprox: 76,
    perSceneCenterSec: 7,
    perSceneMinSec: 5,
    perSceneMaxSec: 12,
    perSceneRangeLabel: "5～12",
    perScenePreferredLabel: "6～11",
    shortSceneWarnBelow: 4,
  },
};

export function parseVideoDurationMin(v: unknown): VideoDurationMin {
  const n = Number(v);
  if (
    n === 3 ||
    n === 5 ||
    n === 8 ||
    n === 10 ||
    n === 12 ||
    n === 15
  ) {
    return n;
  }
  return 1;
}

export function getVideoDurationPreset(
  m: unknown,
): VideoDurationPreset {
  const key = parseVideoDurationMin(m);
  return VIDEO_DURATION_PRESETS[key];
}

/** 分块/单次生成共用的目标镜数（取时长预设区间中点，便于叙事骨架阶段锁条数） */
export function targetSceneCountForPreset(d: VideoDurationPreset): number {
  return Math.round((d.minScenes + d.maxScenes) / 2);
}

/** 人物创作中心下拉选项（镜数区间随预设与 prompts 一致） */
export const VIDEO_DURATION_UI_OPTIONS: {
  value: VideoDurationMin;
  label: string;
}[] = [
  {
    value: 1,
    label: "约 1 分钟（8～12 镜）",
  },
  {
    value: 3,
    label: "约 3 分钟（18～26 镜）",
  },
  {
    value: 5,
    label: "约 5 分钟（34～48 镜）",
  },
  {
    value: 8,
    label: "约 8 分钟（54～74 镜）",
  },
  {
    value: 10,
    label: "约 10 分钟（68～92 镜）",
  },
  {
    value: 12,
    label: "约 12 分钟（81～107 镜）",
  },
  {
    value: 15,
    label: "约 15 分钟（100～130 镜）",
  },
];
