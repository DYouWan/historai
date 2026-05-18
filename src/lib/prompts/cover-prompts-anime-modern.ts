/**
 * 动漫插画-现代：精品古风人物插画向（立绘感、细腻笔触、侧光层次）
 * 「现代」指当代插画审美与绘制精度，**非**都市/近现当代场景；与 cover-prompts-anime-historical（偏常规动漫赛璐璐）分离。
 */

import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/cover-prompts-shared";

/** 人物绘制气质（与历史向「略二次元赛璐璐」区分） */
export const COVER_RENDER_STYLE_ANIME_MODERN = [
  "【人物画风｜精品古风插画】插画立绘质感：介于二次元与写实之间，**有**精致线稿与厚涂/细腻数字笔触，**无**低幼Q版、**无**廉价扁平赛璐璐番剧脸。",
  "人物比例趋近成年写实插画（如二十余岁古风男子/女子），五官立体、轮廓分明（可冷峻英气，如剑眉星目）；忌圆脸萌系、忌泛化网红动漫模板脸。",
  "服饰与发饰按人物形象精细刻画纹样与材质（如龙纹袍、银饰发冠、高束长发等），层次清晰；整体偏权谋、史诗或高级感插画气质。",
  "光影：侧光或轮廓光塑造面部阴影与体积感，肤色与环境分离；色彩克制、对比明确，笔触细腻。",
].join("");

/** 竖屏外宣版式：人物居左 + 古风建筑虚化环境（与历史向版式结构一致，环境描述偏木质古建） */
export const COVER_VERTICAL_LAYOUT_RULES_ANIME_MODERN = [
  "【版式｜人物居左】竖幅外宣首帧（精品古风插画向）。",
  "**主角全身或胸像至可见下身，横向约占画幅宽度 ≤40%**；人物与关键道具靠左，脸与视线可略朝右；忌顶天立地居中。",
  "**背景**：大光圈浅景深，主角左侧清晰锐利。",
  "**右侧及远景须有与叙事/时代相符的古风建筑虚化环境**（木质殿宇、廊庑立柱、格窗帷幔、远处檐影、薄雾烟尘、柔光斑等），须**明显背景虚化（bokeh）、整体亮度与对比度低于主角**；**忌**整幅右侧纯白/纯灰空底。",
  "**后期合成留白**：右侧与**画面上方约 20%** 须更疏、更干净、低对比；**勿**清晰第二人物、手脸特写、抢眼器物、**勿任何牌匾对联或带字道具**。",
].join("");

export const COVER_ANIME_MODERN_APPEARANCE_FALLBACK =
  "二十余岁古风人物，冷峻立体五官、剑眉星目；衣冠发饰精致（如玄色银纹袍、银饰高束发冠）；气质偏权谋或史诗感，忌萌系扁平动漫脸。";

export function buildStandaloneCoverLeadAnimeModern(hasReference: boolean): string {
  return hasReference ?
      "【任务】参考图重生外宣竖屏精品古风插画：保留人物相貌、衣冠纹样与发饰主色，场景与侧光构图按下文命题重设；画面仍须零可读文字。"
    : "【任务】文生外宣竖屏精品古风人物插画：古风服饰与木质古建环境，侧光层次，**绝对零文字**（无字幕、无招牌、无对联、无水印）。";
}

export function buildPortraitCoverPromptAnimeModern(opts: {
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
    `【封面图｜竖屏外宣·精品古风插画】唯一视觉中心「${protagonist}」。单帧人物插画，立绘级精度；外形须与下文「人物形象」一致，按精品古风插画理解（**非**常规扁平二次元番剧画风）。`,
  );
  lines.push(COVER_RENDER_STYLE_ANIME_MODERN);
  lines.push(COVER_VERTICAL_LAYOUT_RULES_ANIME_MODERN);
  lines.push(`【人物形象】须如实体现：${app}`);

  const dyn = opts.dynasty?.trim();
  if (dyn) {
    lines.push(
      `【时代服饰】须符合「${safePromptInline(dyn, 48)}」的常见冠服与器物气质；勿混用其它朝代典型装束。`,
    );
  }

  return lines.join("\n");
}

/** 正片跟镜：保持精品古风插画人物一致性 */
export const IMAGE_SCENE_CAST_HINT_ANIME_MODERN =
  "【场面调度】紧随其后的分镜画面若写到他人、人群、对峙或环境纵深，须按描述取景构图，勿擅自缩成仅主角单人肖像特写（除非分镜明确如此）；主角脸型、衣冠纹样、发饰与首帧一致，保持精品古风插画质感，勿降级为萌系扁平动漫脸。";

export const IMAGE_TEXT_ONLY_FACE_HINT_ANIME_MODERN =
  "当前模型不支持参考图，请仅凭文本保持与首镜相同的古风人物脸型、眉骨气质、发型与衣冠主色（不要换成其他名人脸，勿改成Q版或廉价赛璐璐番剧脸）。";
