/**
 * 古风插画（anime_modern）人脸定稿 — 与 cover-prompts-anime-modern 分离维护
 */

import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/face-prompts-shared";
import { FACE_PORTRAIT_LAYOUT_RULES } from "@/lib/prompts/face-prompts-shared";

export const FACE_ANIME_MODERN_APPEARANCE_FALLBACK =
  "二十余岁古风人物，略二次元五官、线稿清晰；冠服简括至肩胸；与封面立绘同气质，忌真人摄影脸、忌3D写实渲染。";

/** 与封面「精品古风插画」同系立绘，强调 2D 线稿正脸（非写实肖像） */
export const FACE_RENDER_STYLE_ANIME_MODERN = [
  "【人物画风｜精品古风插画·正脸定稿】与系列外宣封面**同一套**二次元古风立绘：**清晰线稿** + 赛璐璐或轻厚涂上色（**非**真人摄影、**非**3D写实渲染、**非**电影剧照）。",
  "五官与比例**须贴近封面立绘**（略二次元、轮廓干净、插画皮肤无写实毛孔）；画面以面部与须发为主；忌Q版、忌网红模板脸、忌证件照/摄影棚人像质感。",
  "冠服与须发**简略呈现**，细节服从下文「人物形象」；**勿**史诗场景或权谋氛围抢面部。**光影**正面或略偏柔光，面部明暗均匀；**禁止**强侧光、半脸深阴影或侧脸/四分之三脸构图。",
].join("");

export function buildPortraitFacePromptAnimeModern(opts: {
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
    `【人脸定稿｜精品古风插画】唯一人物「${protagonist}」。身份锚点供分镜锁脸；**须与系列封面同一套二次元立绘脸**（**非**另起写实摄影脸或3D渲染脸）。`,
    FACE_PORTRAIT_LAYOUT_RULES,
    FACE_RENDER_STYLE_ANIME_MODERN,
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
