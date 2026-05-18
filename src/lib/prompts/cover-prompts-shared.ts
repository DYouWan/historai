/** 各封面提示模块共用的截断与主角占位（避免 cover ↔ image-coherence 循环依赖） */

export const SUBJECT_APPEARANCE_COVER_PROMPT_MAX = 420;

export const IMAGE_SUBJECT_FALLBACK_ANCHOR =
  "主角（请以分镜画面描述中的具体历史人物为准，须为画面唯一视觉中心）";

export function safePromptInline(s: string, max: number): string {
  return s.replace(/[\r\n"]+/g, " ").trim().slice(0, max);
}

export function anchorSubjectLabelForImage(subject?: string | null): string {
  const t = subject?.trim();
  if (t) return t;
  return IMAGE_SUBJECT_FALLBACK_ANCHOR;
}
