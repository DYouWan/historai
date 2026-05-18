/**
 * 动漫插画（历史向）封面专用提示 — 与 cover-prompts-anime-modern 分离，便于单独调参
 */

import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/cover-prompts-shared";

/** 历史向竖屏外宣版式：人物居左 + 古代/史诗感虚化环境 */
export const COVER_VERTICAL_LAYOUT_RULES_ANIME_HISTORICAL = [
  "【版式｜人物居左】竖幅外宣首帧。",
  "**主角全身或胸像至可见下身，横向约占画幅宽度 ≤40%**；人物与关键道具靠左，脸与视线可略朝右；忌顶天立地居中。",
  "**背景**：大光圈浅景深，主角左侧清晰锐利。",
  "**右侧及远景须有与时代/叙事相符的虚化环境**（殿宇檐影、帷幕、宫墙远廓、薄雾烟尘、柔光斑等），须**明显背景虚化（bokeh）、整体亮度与对比度低于主角**；**忌**整幅右侧铺满纯白/纯灰空底、无环境感的色块。",
  "**后期合成留白**：右侧与**画面上方约 20%** 须更疏、更干净、低对比；**勿**清晰第二人物、手脸特写、抢眼器物、**勿任何牌匾对联或带字道具**。",
].join("");

export const COVER_ANIME_HISTORICAL_APPEARANCE_FALLBACK =
  "主角史书通行造型与衣冠气质，须具可辨识时代感，忌泛化古代脸谱。";

export function buildStandaloneCoverLeadAnimeHistorical(hasReference: boolean): string {
  return hasReference ?
      "【任务】参考图重生外宣竖屏历史向动漫插画：保留人物相貌与衣冠主色，场景与构图按下文命题重设；画面仍须零可读文字。"
    : "【任务】文生外宣竖屏历史向动漫插画：仅人物与时代感环境，**绝对零文字**（无字幕、无招牌、无对联、无水印）。";
}

export function buildPortraitCoverPromptAnimeHistorical(opts: {
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const app = safePromptInline(
    opts.subjectAppearance,
    SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
  );
  const lines: string[] = [];

  lines.push(
    `【封面图｜竖屏外宣·历史向动漫】唯一视觉中心「${protagonist}」。动漫插画单帧，勿做成真人剧照硬套二次元；人物外形须与下文「人物形象」一致，忌泛古代脸谱化。`,
  );
  lines.push(COVER_VERTICAL_LAYOUT_RULES_ANIME_HISTORICAL);
  lines.push(`【人物形象】须如实体现：${app}`);

  const dyn = opts.dynasty?.trim();
  if (dyn) {
    lines.push(
      `【时代服饰】须符合「${safePromptInline(dyn, 48)}」的常见冠服与器物气质；勿混用其它朝代典型装束。`,
    );
  }

  return lines.join("\n");
}
