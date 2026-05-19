/**
 * 文生图 / 图生图：封面与跟镜的中文约束与拼装片段（供 image-coherence 调度）
 */

import { buildPortraitCoverPromptAnimeHistorical } from "@/lib/prompts/cover-prompts-anime-historical";
import { buildPortraitCoverPromptAnimeModern } from "@/lib/prompts/cover-prompts-anime-modern";
import { buildPortraitCoverPromptCinematic } from "@/lib/prompts/cover-prompts-cinematic";
import {
  anchorSubjectLabelForImage,
  IMAGE_SUBJECT_FALLBACK_ANCHOR,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/cover-prompts-shared";
import type { StylePreset } from "@/lib/types";

export {
  anchorSubjectLabelForImage,
  IMAGE_SUBJECT_FALLBACK_ANCHOR,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
};

/** 峰值说明可较长，封面提示里截断以免顶满厂商上限 */
export const PEAK_DESCRIPTION_COVER_PROMPT_MAX = 520;

/** @deprecated 使用 PEAK_DESCRIPTION_COVER_PROMPT_MAX */
export const SLICE_ANGLE_COVER_PROMPT_MAX = PEAK_DESCRIPTION_COVER_PROMPT_MAX;

/** 文生图提示里附带口播长度上限 */
export const NARRATION_IN_IMAGE_PROMPT_MAX = 280;

/** 封面文生图 negative_prompt（DashScope 等支持时叠加） */
export const COVER_IMAGE_NEGATIVE_PROMPT =
  "text, letters, words, typography, Chinese characters, English text, numbers, subtitle, caption, watermark, logo, signature, plaque, couplet, calligraphy, banner, signboard, shop sign, UI overlay, speech bubble, fake text, gibberish text, title bar, headline, meme text, book page, newspaper";

/** 封面硬性禁字（中英混排，放提示首尾；勿写「标题/UI/叠字」以免模型真画字） */
export const COVER_NO_TEXT_BLOCK = [
  "【硬性·零文字画面】输出必须是**无任何可读字形**的纯插画/摄影帧。",
  "**严禁**：汉字、字母、数字、假字、乱码、字幕、横幅、对联、匾额、招牌、书卷文字、印章篆文、屏幕界面、水印、Logo、气泡字。",
  "**留白区**仅允许虚化景物与柔和色块，供剪辑**后期**合成文案；**禁止在画面里预写标题、装饰字或「待填字」空框**。",
].join("");

/**
 * 独立封面：按画风预设路由到各自提示模块（历史动漫 / 现代动漫 / 电影质感）
 */
export function buildPortraitCoverPromptSnippet(opts: {
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
  stylePreset: StylePreset;
}): string {
  if (opts.stylePreset === "anime_modern") {
    return buildPortraitCoverPromptAnimeModern({
      subject: opts.subject,
      subjectAppearance: opts.subjectAppearance,
      dynasty: opts.dynasty,
    });
  }
  if (opts.stylePreset === "cinematic") {
    return buildPortraitCoverPromptCinematic({
      subject: opts.subject,
      subjectAppearance: opts.subjectAppearance,
      dynasty: opts.dynasty,
    });
  }
  return buildPortraitCoverPromptAnimeHistorical({
    subject: opts.subject,
    subjectAppearance: opts.subjectAppearance,
    dynasty: opts.dynasty,
  });
}

/** 封面：竖屏外宣底图；人物居左、虚化环境背景、右侧/上方合成留白 */
export function buildCoverBaseOnlyPromptSnippet(opts: {
  subject?: string | null;
  seriesTitle?: string | null;
  peakTitle?: string | null;
  peakDescription?: string | null;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const slice = opts.peakTitle?.trim();
  const series = opts.seriesTitle?.trim();
  const angle = opts.peakDescription?.trim();
  const angleClip = angle ?
    safePromptInline(angle, PEAK_DESCRIPTION_COVER_PROMPT_MAX)
  : "";
  const seriesCtx = series ? safePromptInline(series, 80) : "";

  const lines: string[] = [];

  lines.push(
    `【封面图｜竖屏外宣】唯一视觉中心「${protagonist}」。电影感单帧，忌泛古代肖像或与命题无关的场面。`,
  );

  lines.push(
    "【版式｜人物居左】竖幅外宣首帧。（版式细则见历史向动漫封面模块，切片命题封面沿用简化表述。）",
  );

  if (angleClip) {
    lines.push(`【切口说明｜优先】${angleClip}`);
  } else {
    lines.push(
      `【切口说明】未填：据下列标题/系列与主角，提炼本支「单一高峰」的具象画面。`,
    );
  }

  if (slice) {
    lines.push(`【峰值标题】「${safePromptInline(slice, 80)}」`);
  }

  if (seriesCtx) {
    if (angleClip && slice) {
      lines.push(
        `【系列语境】「${seriesCtx}」须与切口一致，勿让系列名喧宾夺主。`,
      );
    } else if (angleClip && !slice) {
      lines.push(`【系列语境】「${seriesCtx}」`);
    } else if (!angleClip && slice) {
      lines.push(`【系列】「${seriesCtx}」`);
    } else {
      lines.push(`【系列选题】「${seriesCtx}」`);
    }
  }

  lines.push(
    "【禁止内嵌字】全画面不得出现可读汉字、字母、数字贴片、水印、logo、匾额对联等；不留空白字框。构图适配竖屏首帧裁剪。",
  );

  return lines.join("\n");
}

export function clipNarrationForImagePrompt(n?: string | null): string {
  const t = n?.trim() ?? "";
  if (!t) return "";
  if (t.length <= NARRATION_IN_IMAGE_PROMPT_MAX) return t;
  return `${t.slice(0, NARRATION_IN_IMAGE_PROMPT_MAX)}…`;
}

/** 与本镜 narration 对齐的说明片段（可无） */
export function narrationCoherenceSnippet(narration?: string | null): string {
  const clip = clipNarrationForImagePrompt(narration);
  if (!clip) return "";
  return `【本镜口播摘录（画面须与之相符：主要人物在场关系、地点环境、手持物或关键道具、昼夜与氛围勿与下列矛盾）】${clip}`;
}

export function buildStandaloneCoverLead(hasReference: boolean): string {
  return hasReference ?
    "【任务】参考图重生外宣竖屏底图：保留人物相貌与衣冠主色，场景与构图按下文命题重设；画面仍须零可读文字。"
  : "【任务】文生外宣竖屏插画：仅人物与环境，**绝对零文字**（无字幕、无招牌、无对联、无水印）。";
}

/** 封面英文画风后缀，强化禁字（拼在【画风】行末） */
export function coverStyleSnippetNoText(baseSnippet: string): string {
  return `${baseSnippet}, no text, no letters, no subtitle, no watermark, no signage, no calligraphy, text-free image`;
}

export function buildCoverReferenceFigureIntro(): string {
  return (
    "【参考图】延续参考中的面部结构与衣冠主色，勿换脸；场景、机位、光影与道具按下方命题新建，可与参考构图不同。"
  );
}

export function buildProtagonistLineCoverPrimary(name: string): string {
  return `主角（须为画面唯一核心人物，观众可辨识其时代气质）：「${name}」。`;
}

export function buildProtagonistLineSimple(name: string): string {
  return `主角：「${name}」。`;
}

export function buildDynastyLineNarrative(dynasty: string): string {
  return `时代与叙事背景：${dynasty}。`;
}

export function buildDynastyLineBackground(dynasty: string): string {
  return `时代背景：${dynasty}。`;
}

export function buildDynastyLineShort(dynasty: string): string {
  return `时代：${dynasty}。`;
}

export const IMAGE_SCENE_BOARD_LABEL = "【本镜分镜画面】";

/** 分镜已写多方场面时，避免文生图默认收成单人头像 */
export const IMAGE_SCENE_CAST_HINT =
  "【场面调度】紧随其后的分镜画面若写到敌军、部属、人群、对峙、远景营阵或环境纵深，须按描述取景构图，勿擅自缩成仅主角单人肖像特写（除非分镜明确如此）；主角朝代服饰气质仍须一致。";

export function buildScene1OpeningPrompt(): string {
  return "【正片第 1 镜｜叙事开场】落实镜序表 index=1 的 beat；**非**外宣独立封面（封面请用「生成封面图」单独出图）。";
}

export function buildFollowSceneImg2ImgLead(sceneIndex: number): string {
  return `【第 ${sceneIndex} 镜｜图生图·人物与造型连贯】`;
}

export function buildFollowSceneTextOnlyLead(sceneIndex: number): string {
  return `【第 ${sceneIndex} 镜｜文生图·须与首帧人物幻想一致】`;
}

export const IMAGE_REF_FACE_HOLD_PREFIX =
  "请保留参考图中主角的面部结构、年龄气质、须发样式、衣冠形制与主色系；";

export const IMAGE_REF_SCENE_ADJUST_SUFFIX =
  "仅依据下列描述调整场景环境、机位、肢体动作与手持物，禁止换脸成另一历史人物。";

/** 图生图：避免参考帧构图「黏住」下一镜（对峙/远景/换视角时尤其明显） */
export const IMAGE_REF_IDENTITY_ONLY_HINT =
  "【参考图边界】参考图**仅**约束主角面相、须发与衣冠主色系；取景框、机位远近、场面人数、对峙关系与环境纵深须**完全服从**下方「本镜分镜画面」，允许与参考图构图显著不同。";

export const IMAGE_TEXT_ONLY_FACE_HINT =
  "当前模型不支持参考图，请仅凭文本保持与首镜相同的历史人物脸型、发型、胡须与衣冠主色（不要换成其他名人脸）。";
