/**
 * User Templates - User Prompt 模板（动态参数部分）
 */

import { themeAxisHintForSeries } from "@/lib/prompts/series-prompts";

/**
 * 推荐人物 - User Prompt（系列名 + 任务；规则见 CHAR_SYSTEM）
 * @param excludeNames 上一轮已在界面展示过的人选，须从本次输出中排除（逐字一致）
 */
export function buildCharacterRecommendUserPrompt(
  seriesTitle: string,
  excludeNames?: string[],
): string {
  const theme = seriesTitle.trim();
  const head = `人物向系列名称：「${theme}」
---
请生成本系列可选主角人选列表（8～12 个，互不重复）。`;

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
 */
export function buildSliceRecommendUserPrompt(
  seriesTitle: string,
  characterName: string,
  excludeTitles?: string[],
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

  const head = `人物向系列名称：「${theme}」
核心人物/对象：「${ch}」${axisBlock}
---
请生成峰值切片方案（6～8 条，互不重复，单点高峰）。只输出 JSON：{"suggestions":[{"title":"…","angle":"…"}]}`;

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
