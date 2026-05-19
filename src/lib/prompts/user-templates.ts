/**
 * User Templates - User Prompt 模板（动态参数部分）
 */

import { peakTopicSeriesUserAddon } from "@/lib/prompts/peak-topic-recommend-prompts";
import { themeAxisHintForSeries } from "@/lib/prompts/series-prompts";
import type { VideoDurationMin } from "@/lib/types";
import { VIDEO_DURATION_PRESETS } from "@/lib/video-duration";

/**
 * 内置系列轴线单行：【本系列轴线】+ axisHint 正文
 * @param labelSuffix 紧挨「】」后的补充说明（② 形象阶段用），与轴线正文之间留一空格外显
 */
function themeAxisUserLine(
  seriesTitle: string,
  labelSuffix?: string,
): string {
  const axis = themeAxisHintForSeries(seriesTitle.trim());
  if (!axis?.trim()) return "";
  const suffix = labelSuffix?.trim() ?? "";
  const head = suffix ? `【本系列轴线】${suffix} ` : "【本系列轴线】";
  return `\n${head}${axis.trim()}`;
}

/** ① 人选：轴线仅辅助选题 */
function characterRosterAxisBlock(seriesTitle: string): string {
  return themeAxisUserLine(seriesTitle);
}

/** ② 批量形象：轴线仅辅助外形气质 */
function characterAppearanceAxisBlock(seriesTitle: string): string {
  return themeAxisUserLine(
    seriesTitle,
    "（仅用于各人物外形气质侧重，勿写场面或剧情）",
  );
}

function characterRecommendExcludeBlock(excludeNames?: string[]): string {
  const cleaned = Array.from(
    new Set(
      (excludeNames ?? [])
        .map((n) => String(n ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);
  if (!cleaned.length) return "";
  const bullets = cleaned.map((n) => `- ${n}`).join("\n");
  return `

【须排除】下列称谓不得出现在本次 characters 列表中（勿换同一人之别称重复输出）：
${bullets}`;
}

/**
 * 推荐人物 ① 人选 - User Prompt（规则见 CHAR_ROSTER_SYSTEM）
 */
export function buildCharacterRosterUserPrompt(
  seriesTitle: string,
  excludeNames?: string[],
): string {
  const theme = seriesTitle.trim();
  const head = `人物向系列名称：「${theme}」${characterRosterAxisBlock(theme)}
---
请生成本系列相关历史人物名单（8～12 个，name 互不重复）；每人仅含 **name** 与 **dynasty**（时代短标签）。`;
  return head + characterRecommendExcludeBlock(excludeNames);
}

export type CharacterRosterRow = { name: string; dynasty: string };

/**
 * 推荐人物 ② 批量形象 - User Prompt（产出规则见 CHAR_APPEARANCE_SYSTEM；此处仅系列气质 + 锁定名单）
 */
export function buildCharacterAppearanceUserPrompt(
  seriesTitle: string,
  roster: CharacterRosterRow[],
): string {
  const theme = seriesTitle.trim();
  const table = roster
    .map((r) => `- name：${r.name} · dynasty：${r.dynasty}`)
    .join("\n");
  const axis = characterAppearanceAxisBlock(theme);
  const head = axis ?
    `人物向系列名称：「${theme}」${axis}`
  : `人物向系列名称：「${theme}」`;
  return `${head}
---
【锁定名单】
${table}`;
}

/** @deprecated 使用 buildCharacterRosterUserPrompt + buildCharacterAppearanceUserPrompt */
export function buildCharacterRecommendUserPrompt(
  seriesTitle: string,
  excludeNames?: string[],
): string {
  return buildCharacterRosterUserPrompt(seriesTitle, excludeNames);
}

/**
 * 推荐峰值选题 - User Prompt（系列名 + 对象 + 任务；规则见 PEAK_TOPIC_SYSTEM）
 * @param excludePeakTitles 上一轮已在界面展示过的 peakTitle，本次不得再输出相同字符串
 * @param videoDurationMin 成片目标时长档位；影响 peakDescription 粒度
 */
export function buildPeakTopicRecommendUserPrompt(
  seriesTitle: string,
  characterName: string,
  excludePeakTitles?: string[],
  videoDurationMin?: VideoDurationMin,
): string {
  const theme = seriesTitle.trim();
  const ch = characterName.trim();
  const axisBlock = themeAxisUserLine(theme);

  const preset =
    videoDurationMin != null ?
      VIDEO_DURATION_PRESETS[videoDurationMin]
    : undefined;
  const durationBlock =
    preset ?
      `
【成片叙事体量】**${preset.labelShort}**（约 **${preset.minScenes}～${preset.maxScenes} 镜**）：**peakDescription** 场面粒度与此相称。`
    : "";

  const seriesTitleAddon = peakTopicSeriesUserAddon(theme);

  const head = `人物向系列名称：「${theme}」${axisBlock}${seriesTitleAddon}
核心人物/对象：「${ch}」${durationBlock}
---
请生成峰值选题方案（6～8 条，互不重复，单点高峰）。

**peakTitle**：简洁工作标题，扣系列轴线与「${ch}」专属名场面；勿传播钩、勿生平章节名。
**peakDescription**：1～3 句白话单场戏，写清场面、对手与 stakes。

只输出 JSON：{"suggestions":[{"peakTitle":"…","peakDescription":"…"}]}`;

  const cleaned = Array.from(
    new Set(
      (excludePeakTitles ?? [])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);

  if (!cleaned.length) return head;

  const bullets = cleaned.map((t) => `- ${t}`).join("\n");
  return `${head}

【须排除】下列 peakTitle 不得出现在本次 suggestions 中（须全新切口）：
${bullets}`;
}

/** @deprecated 使用 buildPeakTopicRecommendUserPrompt */
export const buildSliceRecommendUserPrompt = buildPeakTopicRecommendUserPrompt;
