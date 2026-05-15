/**
 * User Templates - User Prompt 模板（动态参数部分）
 */

import { themeAxisHintForSeries } from "@/lib/prompts/series-prompts";
import type { VideoDurationMin } from "@/lib/types";
import { VIDEO_DURATION_PRESETS } from "@/lib/video-duration";

/**
 * 推荐人物 - User Prompt（系列名 + 任务；规则见 CHAR_SYSTEM）
 * @param excludeNames 上一轮已在界面展示过的人选，须从本次输出中排除（逐字一致）
 */
export function buildCharacterRecommendUserPrompt(
  seriesTitle: string,
  excludeNames?: string[],
): string {
  const theme = seriesTitle.trim();
  const axis = themeAxisHintForSeries(theme);
  const axisBlock =
    axis ?
      `
【本系列轴线】（仅用于筛选人选与外形气质侧重，勿写入 appearance 的场景背景）
${axis}`
    : "";

  const head = `人物向系列名称：「${theme}」${axisBlock}
---
请生成本系列相关历史人物列表（8～12 个，name 互不重复）；每人须含 **appearance**（人物外形；其中面部用至多一句写眉目/须发或脸型轮廓之一，勿空泛套话）与 **dynasty**（时代短标签）；系列名仅帮助推导形象与时代，**appearance 勿写地点、战场、事件场面**。`;

  const cleaned = Array.from(
    new Set(
      (excludeNames ?? [])
        .map((n) => String(n ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);

  if (!cleaned.length) return head;

  const bullets = cleaned.map((n) => `- ${n}`).join("\n");
  return `${head}

【须排除】下列称谓不得出现在本次 characters 列表中（勿换同一人之别称重复输出）：
${bullets}`;
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
  const axis = themeAxisHintForSeries(theme);
  const axisBlock =
    axis ?
      `
【本系列轴线】
${axis}`
    : "";

  const preset =
    videoDurationMin != null ?
      VIDEO_DURATION_PRESETS[videoDurationMin]
    : undefined;
  const durationBlock =
    preset ?
      `
【成片叙事体量】用户选定成片目标 **${preset.labelShort}**（叙事体量约 **${preset.minScenes}～${preset.maxScenes} 镜**、总时长与单镜秒数随主流程该档位约束）：请让每条切口的 **angle 场面粒度与信息节奏** 与此体量相称；**title** 一律 **6～12 字短钩**（硬上限 14 字），勿写成百科目录或长问句。`
    : "";

  const head = `人物向系列名称：「${theme}」
核心人物/对象：「${ch}」${axisBlock}${durationBlock}
---
请生成峰值切片方案（6～8 条，互不重复，单点高峰；**title 优先高传播、顺口、强停划**）。只输出 JSON：{"suggestions":[{"title":"…","angle":"…"}]}`;

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
