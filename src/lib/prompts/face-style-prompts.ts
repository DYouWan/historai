/**
 * 人脸定稿专用画风关键词（与封面 STYLE_SNIPPET 分离，避免 semi-realistic / 侧光误导侧脸与写实）
 */

import type { StylePreset } from "@/lib/types";

/** 人脸定稿英文画风（正脸、插画向，与封面共用 preset 但措辞不同） */
export const FACE_STYLE_SNIPPET: Record<StylePreset, string> = {
  anime:
    "anime historical character portrait illustration, clean linework, cel or soft digital paint, front-facing headshot, both eyes fully visible, symmetrical face, controlled saturation, illustration not photograph",
  anime_modern:
    "2D Chinese fantasy anime illustration portrait, same art style as cover key visual, clean visible linework, cel shading or soft digital paint, anime illustration face, front-facing headshot, both eyes visible, tight head-and-shoulders, soft even front lighting, simple minimal background, not photorealistic not live action not 3D render not photograph",
  cinematic:
    "cinematic character portrait still, front-facing, both eyes visible, soft key light on face, shallow depth of field, film still look, not documentary photo",
};

/** 人脸定稿中文造型锚点 */
export const FACE_STYLE_ANCHOR_ZH: Record<StylePreset, string> = {
  anime:
    "历史向动漫插画正脸：略二次元比例、线稿干净、赛璐璐或轻厚涂；**正面**头肩、双眼完整；饱和适中；**非**真人摄影、**非**剧照。",
  anime_modern:
    "精品古风二次元插画正脸：与系列封面**同系**线稿 + 赛璐璐/轻厚涂立绘；面部与须发为主，衣冠至肩胸；正面柔光、双眼对称；**非**真人摄影、**非**3D写实渲染、**非**剧照。",
  cinematic:
    "电影质感正脸肖像：肤色与环境分离、写实材质；**正面**头肩、双眼完整；**非**纪录片抓拍、**非**新闻摄影。",
};

/** 人脸英文画风后缀（仅补 base 未写的禁侧脸与禁字，避免与正文正脸约束重复） */
export function faceStyleSnippetNoText(baseSnippet: string): string {
  return `${baseSnippet}, no profile view, no extreme side face, no text, no letters, no subtitle, no watermark, text-free image`;
}

const FACE_NEGATIVE_SHARED =
  "profile view, side face, 90 degree angle, three-quarter view, head turned away, one eye hidden, looking away from camera, extreme head turn, over-shoulder shot, text, letters, subtitle, watermark, plaque, calligraphy";

/** DashScope 等人脸定稿 negative（anime / cinematic） */
export const FACE_IMAGE_NEGATIVE_PROMPT = `${FACE_NEGATIVE_SHARED}, photorealistic, live action, documentary, passport photo, chibi, flat cel anime`;

/** 古风插画人脸：禁写实/3D，**不**禁 flat cel，避免把脸推成摄影风 */
export const FACE_IMAGE_NEGATIVE_PROMPT_ANIME_MODERN = `${FACE_NEGATIVE_SHARED}, photorealistic, hyperrealistic skin, live action, 3D render, CGI, octane render, unreal engine, documentary, passport photo, ID photo`;

/** 按画风返回人脸 negative */
export function faceImageNegativePromptForStyle(style: StylePreset): string {
  if (style === "anime_modern") return FACE_IMAGE_NEGATIVE_PROMPT_ANIME_MODERN;
  return FACE_IMAGE_NEGATIVE_PROMPT;
}

const FACE_VOLCENGINE_SUFFIX_DEFAULT =
  "No profile view, no extreme side face, no photorealistic live-action. Absolutely no text or letters in the image.";

const FACE_VOLCENGINE_SUFFIX_ANIME_MODERN =
  "2D illustrated anime portrait, same style as cover illustration. No profile view, no extreme side face. No photorealistic, no live-action, no 3D CGI render. Absolutely no text or letters in the image.";

/** 火山方舟人脸定稿末尾英文硬约束 */
export function faceVolcenginePromptSuffixForStyle(style: StylePreset): string {
  if (style === "anime_modern") return FACE_VOLCENGINE_SUFFIX_ANIME_MODERN;
  return FACE_VOLCENGINE_SUFFIX_DEFAULT;
}

/** @deprecated 使用 faceVolcenginePromptSuffixForStyle */
export const FACE_VOLCENGINE_PROMPT_SUFFIX = FACE_VOLCENGINE_SUFFIX_DEFAULT;
