import type { VideoDurationMin } from "@/lib/types";

/** 界面「成片时长」与主生成硬约束（镜数、总秒数、timeline 段数等） */
export interface VideoDurationPreset {
  minutes: VideoDurationMin;
  /** 用于 system / 用户提示的短标签 */
  labelShort: string;
  minScenes: number;
  maxScenes: number;
  /** 「中段」至少连续递进镜数（不含首镜与收尾镜） */
  midStreakMin: number;
  minTotalSec: number;
  maxTotalSec: number;
  /** 本地补足时长：加总低于此则逐镜 +1s */
  softMinTotalSec: number;
  timelineMin: number;
  timelineMax: number;
  /** 「口播连贯」中禁止连堆隐喻的起算镜序（约） */
  metaphorFromSceneApprox: number;
  perSceneCenterSec: number;
  perSceneMinSec: number;
  perSceneMaxSec: number;
  perSceneRangeLabel: string;
  perScenePreferredLabel: string;
  shortSceneWarnBelow: number;
}

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
  if (n === 3 || n === 5 || n === 8 || n === 10 || n === 15) return n;
  return 1;
}

export function getVideoDurationPreset(
  m: unknown,
): VideoDurationPreset {
  const key = parseVideoDurationMin(m);
  return VIDEO_DURATION_PRESETS[key];
}

/** 分块/单次生成共用的目标镜数（取时长预设区间中点，便于脊柱阶段锁条数） */
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
    value: 15,
    label: "约 15 分钟（100～130 镜）",
  },
];
