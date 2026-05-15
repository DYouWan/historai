/**
 * Image Prompts - 文生图画风关键词与中文造型锚点（与 coherence 拼装共用）
 */

import type { StylePreset } from "@/lib/types";

/** 与文生图模型拼接的英文画风关键词 */
export const STYLE_SNIPPET: Record<StylePreset, string> = {
  anime:
    "anime historical key visual, clean linework, cel or soft digital paint, controlled saturation",
  cinematic: "cinematic lighting, 35mm still, shallow depth of field",
};

/** 中文造型锚点：封面定人物 + 按封面批量生成镜头文本兜底时复用 */
export const STYLE_ANCHOR_ZH: Record<StylePreset, string> = {
  anime:
    "动漫插画：略二次元比例、线稿干净、赛璐璐或轻厚涂；饱和适中、高光明确；衣冠简化但具时代感。",
  cinematic: "电影质感：侧光或自然光、肤色与环境分离、写实材质与景深。",
};

/** 写入叙事/分镜提示的人类可读画风名（与 UI 下拉一致） */
export const STYLE_PRESET_LABEL_ZH: Record<StylePreset, string> = {
  anime: "动漫插画",
  cinematic: "电影质感",
};

/** 请求体或旧 manifest 中可能含已下线预设，统一收敛为当前支持的两种 */
export function normalizeStylePreset(v: unknown): StylePreset {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "cinematic" ? "cinematic" : "anime";
}
