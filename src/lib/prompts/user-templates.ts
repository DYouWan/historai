/**
 * User Templates - User Prompt 模板（动态参数部分）
 */

import { themeAxisHintForSeries } from "@/lib/prompts/series-prompts";
import type { VideoDurationMin } from "@/lib/types";
import { VIDEO_DURATION_PRESETS } from "@/lib/video-duration";

/**
 * 内置系列轴线单行：【本系列轴线】题眼：…（axisHint 已含「题眼：」前缀）
 * @param labelSuffix 紧挨「】」后的补充说明（② 形象阶段用），与题眼之间留一空格外显
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
 * 推荐人物 ② 批量形象 - User Prompt（规则见 CHAR_APPEARANCE_SYSTEM）
 */
export function buildCharacterAppearanceUserPrompt(
  seriesTitle: string,
  roster: CharacterRosterRow[],
): string {
  const theme = seriesTitle.trim();
  const table = roster
    .map((r) => `- name：${r.name} · dynasty：${r.dynasty}`)
    .join("\n");
  return `人物向系列名称：「${theme}」${characterAppearanceAxisBlock(theme)}
---
下列人选已锁定（**不得修改 name**）。请为**每一位**写 **appearance**（25～58 字；眉/眼/须发/脸型至少一类；批内互不相同；禁套话与场面）。

【锁定名单】
${table}

只输出 JSON：{"appearances":[{"name":"…","appearance":"…"}]}，条数须与名单一致，name 逐字一致。`;
}

/** @deprecated 使用 buildCharacterRosterUserPrompt + buildCharacterAppearanceUserPrompt */
export function buildCharacterRecommendUserPrompt(
  seriesTitle: string,
  excludeNames?: string[],
): string {
  return buildCharacterRosterUserPrompt(seriesTitle, excludeNames);
}

/**
 * 推荐切片标题 - User Prompt（系列名 + 对象 + 任务；规则见 SLICE_SYSTEM）
 * @param excludeTitles 上一轮已在界面展示过的 title，本次不得再输出相同字符串
 * @param videoDurationMin 成片目标时长档位；影响切口体量与 angle 粒度
 */
export function buildSliceRecommendUserPrompt(
  seriesTitle: string,
  characterName: string,
  excludeTitles?: string[],
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
【成片叙事体量】用户选定成片目标 **${preset.labelShort}**（叙事体量约 **${preset.minScenes}～${preset.maxScenes} 镜**、总时长与单镜秒数随主流程该档位约束）：请让每条切口的 **angle 场面粒度与信息节奏** 与此体量相称；**title** 一律 **6～12 字短钩**（硬上限 14 字），勿写成百科目录或长问句。`
    : "";

  const head = `人物向系列名称：「${theme}」${axisBlock}
核心人物/对象：「${ch}」${durationBlock}
---
请生成峰值切片方案（6～8 条，互不重复，单点高峰）。
**title**：封面大字短钩（坦白刃/当场刀/反差刃/身份翻等），6～12 字、含「我」；切口须**「${ch}」专属名场面**，勿照抄 system 示范里的他人情节（勿批量「没爱过某帝/沉湖/一句话杀某臣」换名）。
**angle**：1～3 句白话单场戏，承担场面与 stakes。
输出前自检：停划、顺口、未套示例换皮。只输出 JSON：{"suggestions":[{"title":"…","angle":"…"}]}`;

  const cleaned = Array.from(
    new Set(
      (excludeTitles ?? [])
        .map((t) => String(t ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);

  if (!cleaned.length) return head;

  const bullets = cleaned.map((t) => `- ${t}`).join("\n");
  return `${head}

【须排除】下列 title 不得出现在本次 suggestions 中（须全新切口）：
${bullets}`;
}
