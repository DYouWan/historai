/**
 * 人脸定稿图（身份锚点）路由与任务头 — 与封面外宣版式分离
 */

import { buildPortraitFacePromptAnimeHistorical } from "@/lib/prompts/face-prompts-anime-historical";
import { buildPortraitFacePromptAnimeModern } from "@/lib/prompts/face-prompts-anime-modern";
import { buildPortraitFacePromptCinematic } from "@/lib/prompts/face-prompts-cinematic";
import { FACE_ANIME_HISTORICAL_APPEARANCE_FALLBACK } from "@/lib/prompts/face-prompts-anime-historical";
import { FACE_ANIME_MODERN_APPEARANCE_FALLBACK } from "@/lib/prompts/face-prompts-anime-modern";
import { FACE_CINEMATIC_APPEARANCE_FALLBACK } from "@/lib/prompts/face-prompts-cinematic";
import { FACE_PORTRAIT_LAYOUT_RULES } from "@/lib/prompts/face-prompts-shared";
import type { StylePreset } from "@/lib/types";

export { FACE_PORTRAIT_LAYOUT_RULES } from "@/lib/prompts/face-prompts-shared";

export const FACE_APPEARANCE_FALLBACK =
  "主角史书通行造型，眉/眼/须发或脸型须清晰可辨，忌泛化古代脸谱。";

export function faceAppearanceFallbackForStyle(style: StylePreset): string {
  if (style === "anime_modern") return FACE_ANIME_MODERN_APPEARANCE_FALLBACK;
  if (style === "cinematic") return FACE_CINEMATIC_APPEARANCE_FALLBACK;
  if (style === "anime") return FACE_ANIME_HISTORICAL_APPEARANCE_FALLBACK;
  return FACE_APPEARANCE_FALLBACK;
}

export function buildStandaloneFaceLead(): string {
  return "【任务】文生人物人脸定稿：正脸头肩/胸像与极简背景，**绝对零文字**（无字幕、招牌、水印）；画风须与系列封面一致。";
}

/** 按画风预设路由到各自人脸提示模块 */
export function buildPortraitFacePromptSnippetByStyle(opts: {
  stylePreset: StylePreset;
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
}): string {
  if (opts.stylePreset === "anime_modern") {
    return buildPortraitFacePromptAnimeModern({
      subject: opts.subject,
      subjectAppearance: opts.subjectAppearance,
      dynasty: opts.dynasty,
    });
  }
  if (opts.stylePreset === "cinematic") {
    return buildPortraitFacePromptCinematic({
      subject: opts.subject,
      subjectAppearance: opts.subjectAppearance,
      dynasty: opts.dynasty,
    });
  }
  return buildPortraitFacePromptAnimeHistorical({
    subject: opts.subject,
    subjectAppearance: opts.subjectAppearance,
    dynasty: opts.dynasty,
  });
}
