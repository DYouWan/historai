/**
 * 文生图 / 图生图：封面与跟镜的中文约束与拼装片段（供 image-coherence 调度）
 */

import type { StylePreset } from "@/lib/types";

/** 未填 subject 时的主角占位说明 */
export const IMAGE_SUBJECT_FALLBACK_ANCHOR =
  "主角（请以分镜画面描述中的具体历史人物为准，须为画面唯一视觉中心）";

/** 切片说明可较长，封面提示里截断以免顶满厂商上限 */
export const SLICE_ANGLE_COVER_PROMPT_MAX = 520;

/** 文生图提示里附带口播长度上限 */
export const NARRATION_IN_IMAGE_PROMPT_MAX = 280;

function safePromptInline(s: string, max: number): string {
  return s.replace(/[\r\n"]+/g, " ").trim().slice(0, max);
}

export function anchorSubjectLabelForImage(subject?: string | null): string {
  const t = subject?.trim();
  if (t) return t;
  return IMAGE_SUBJECT_FALLBACK_ANCHOR;
}

/** 独立封面（人物形象驱动）中，外形描述写入提示的上限 */
export const SUBJECT_APPEARANCE_COVER_PROMPT_MAX = 420;

/**
 * 独立封面：以主角 + 人物形象描述为主，保留竖屏外宣版式与留白规则；不再使用切片标题/切口命题。
 */
export function buildPortraitCoverPromptSnippet(opts: {
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
  /** 与【画风】【造型锚点】一致，避免首行写死「电影感」与动漫预设冲突 */
  stylePreset: StylePreset;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const app = safePromptInline(
    opts.subjectAppearance,
    SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
  );
  const frameCue =
    opts.stylePreset === "cinematic" ?
      "电影感单帧，镜头与光影偏剧情片静帧。"
    : "动漫插画单帧，勿做成真人剧照硬套二次元。";
  const lines: string[] = [];

  lines.push(
    `【封面图｜竖屏外宣】唯一视觉中心「${protagonist}」。${frameCue}人物外形须与下文「人物形象」一致，忌泛古代脸谱化。`,
  );

  lines.push(
    [
      "【版式｜人物居左】竖幅列表首帧。",
      "**主角全身或胸像至可见下身，横向约占画幅宽度 ≤40%**；人物与关键道具靠左，脸与视线可略朝右；忌顶天立地居中。",
      "**右侧为低密度留白**：极浅纯色/极淡渐变/轻肌理；勿人脸、手或其它主体；勿抢眼景物或大块几何。",
      "**留白区禁可读文字、Logo、伪字、徽记**；**画面上方约 20% 高度内须更干净**，便于叠 UI/标题。",
    ].join(""),
  );

  lines.push(`【人物形象】须如实体现：${app}`);

  const dyn = opts.dynasty?.trim();
  if (dyn) {
    lines.push(
      `【时代服饰】须符合「${safePromptInline(dyn, 48)}」的常见冠服与器物气质；勿混用其它朝代典型装束。`,
    );
  }

  lines.push(
    "【禁止内嵌字】全画面不得出现可读汉字、字母、数字贴片、水印、logo、匾额对联等；不留空白字框。构图适配竖屏首帧裁剪。",
  );

  return lines.join("\n");
}

/** 封面：竖屏外宣底图；纯画面无内嵌字；版式为人物居左、右侧留白（供后期叠字） */
export function buildCoverBaseOnlyPromptSnippet(opts: {
  subject?: string | null;
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  sliceAngle?: string | null;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const slice = opts.sliceTitle?.trim();
  const series = opts.seriesTitle?.trim();
  const angle = opts.sliceAngle?.trim();
  const angleClip = angle ?
    safePromptInline(angle, SLICE_ANGLE_COVER_PROMPT_MAX)
  : "";
  const seriesCtx = series ? safePromptInline(series, 80) : "";

  const lines: string[] = [];

  lines.push(
    `【封面图｜竖屏外宣】唯一视觉中心「${protagonist}」。电影感单帧，忌泛古代肖像或与命题无关的场面。`,
  );

  lines.push(
    [
      "【版式｜人物居左】竖幅信息流列表首帧。",
      "**主角整个人物在画幅中的横向占位（从头到脚，或胸像至可见下身）不超过宽度约 40%**；人物与关键道具整体靠左，脸与视线可略朝右；忌人物过大或居中顶天立地。",
      "**右侧余下为负形留白、信息密度须极低**：宜极浅纯色、极淡渐变或极轻阴影肌理；避免明显布褶、大团云雾、可辨几何块或抢眼景物；该区域内不要人脸、手部特写或其它主体。",
      "**留白区内严禁任何可读文字、Logo、符号、装饰性伪字或图形徽记**（模型勿用假字填充空区）。",
      "**留白区靠画面上方约 20% 高度内须格外干净**，以便后期列表 UI、头像或标题条叠盖。",
    ].join(""),
  );

  if (angleClip) {
    lines.push(`【切口说明｜优先】${angleClip}`);
  } else {
    lines.push(
      `【切口说明】未填：据下列标题/系列与主角，提炼本支「单一高峰」的具象画面。`,
    );
  }

  if (slice) {
    lines.push(`【切片标题】「${safePromptInline(slice, 80)}」`);
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
    "【任务】参考图重生外宣竖屏底图：保留人物相貌与衣冠主色，场景与构图按下文命题重设。"
  : "【任务】文生外宣竖屏底图：仅依据下文命题与主角，纯画面无字。";
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
  return "【正片第 1 镜｜叙事开场】承接 hook 后的第一个可见画面；**非**外宣独立封面（封面请用「生成封面图」单独出图）。";
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
