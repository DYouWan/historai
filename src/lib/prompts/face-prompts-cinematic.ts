/**
 * 电影质感（cinematic）人脸定稿 — 与 cover-prompts-cinematic 分离维护
 */

import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/face-prompts-shared";
import { FACE_PORTRAIT_LAYOUT_RULES } from "@/lib/prompts/face-prompts-shared";

export const FACE_CINEMATIC_APPEARANCE_FALLBACK =
  "主角史书通行造型，面部结构与须发清晰；电影感正脸肖像，忌泛化古代脸谱。";

export const FACE_RENDER_STYLE_CINEMATIC = [
  "【人物画风｜电影质感·正脸定稿】剧情片静帧式正脸肖像：材质写实但仍是**构图受控的插画/静帧**，非新闻抓拍。",
  "正面头肩，双眼完整；自然光或柔主光，**禁止**大角度侧脸与纯侧面。",
].join("");

export function buildPortraitFacePromptCinematic(opts: {
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
    `【人脸定稿｜电影质感】唯一人物「${protagonist}」。正脸身份锚点；与系列封面电影静帧气质一致。`,
    FACE_PORTRAIT_LAYOUT_RULES,
    FACE_RENDER_STYLE_CINEMATIC,
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
