/**
 * 动漫插画·历史向（anime）人脸定稿 — 与 cover-prompts-anime-historical 分离维护
 */

import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/face-prompts-shared";
import { FACE_PORTRAIT_LAYOUT_RULES } from "@/lib/prompts/face-prompts-shared";

export const FACE_ANIME_HISTORICAL_APPEARANCE_FALLBACK =
  "主角史书通行造型与衣冠气质，须具可辨识时代感；正脸动漫插画，忌泛化脸谱、忌真人剧照。";

export const FACE_RENDER_STYLE_ANIME_HISTORICAL = [
  "【人物画风｜历史向动漫插画·正脸定稿】与系列外宣封面同源的历史向动漫插画：线稿干净，赛璐璐或轻厚涂。",
  "略二次元比例；**正面**头肩，双眼完整对称；**非**真人摄影硬套、**非**写实证件照。",
  "用均匀或略偏正面光，**禁止**为戏剧侧光而转向大角度侧脸。",
].join("");

export function buildPortraitFacePromptAnimeHistorical(opts: {
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const app = safePromptInline(
    opts.subjectAppearance,
    SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
  );
  const lines: string[] = [
    `【人脸定稿｜历史向动漫】唯一人物「${protagonist}」。身份锚点；画风须与系列封面动漫插画一致。`,
    FACE_PORTRAIT_LAYOUT_RULES,
    FACE_RENDER_STYLE_ANIME_HISTORICAL,
    `【人物形象】须如实体现：${app}`,
  ];
  const dyn = opts.dynasty?.trim();
  if (dyn) {
    lines.push(
      `【时代服饰】须符合「${safePromptInline(dyn, 48)}」的常见冠服气质；勿混用其它朝代典型装束。`,
    );
  }
  return lines.join("\n");
}
