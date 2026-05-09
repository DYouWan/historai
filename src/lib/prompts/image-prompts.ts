/**
 * Image Prompts - 文生图画风关键词与中文造型锚点（与 coherence 拼装共用）
 */

import type { StylePreset } from "@/lib/types";

/** 与文生图模型拼接的英文画风关键词 */
export const STYLE_SNIPPET: Record<StylePreset, string> = {
  ink: "Chinese ink wash, negative space, muted palette",
  gongbi: "fine-line gongbi, mineral colors, silk texture",
  cinematic: "cinematic lighting, 35mm, shallow depth of field",
  docu: "documentary still, desaturated, archival mood",
  watercolor: "historical watercolor illustration, soft bleed edges",
};

/** 中文造型锚点：封面定人物 + 按封面批量生成镜头文本兜底时复用 */
export const STYLE_ANCHOR_ZH: Record<StylePreset, string> = {
  ink: "水墨写意：面部用线简练、留白、淡墨皴擦；衣冠以素雅墨色与赭石点染，宣纸肌理。",
  gongbi: "工笔重彩：线条匀细、矿物色平涂与晕染；人物仪容端庄，服饰纹样清晰可辨。",
  cinematic: "电影感：自然光或伦勃朗式侧光，肤色与环境色分离明确，质感偏写实。",
  docu: "纪实摄影感：低饱和、自然肤色、轻微颗粒与景深，避免过度美颜。",
  watercolor: "历史插画水彩：边缘水渍、湿画法混色，人物与背景气蕴统一。",
};
