import type { ImageProfileDriver } from "@/lib/media-profiles";
import type { StylePreset } from "@/lib/types";

/** 与文生图模型拼接的英文画风关键词（沿用原逻辑） */
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

function anchorName(subject?: string | null): string {
  const t = subject?.trim();
  if (t) return t;
  return "主角（请以分镜画面描述中的具体历史人物为准，须为画面唯一视觉中心）";
}

/** 封面：切题底图 + 纯画面（无任何内嵌文案，供后期人工叠字） */
function safePromptInline(s: string, max: number): string {
  return s.replace(/[\r\n"]+/g, " ").trim().slice(0, max);
}

/** 切片说明可较长，封面提示里截断以免顶满厂商上限 */
const SLICE_ANGLE_COVER_PROMPT_MAX = 520;

function coverBaseOnlyPromptSnippet(opts: {
  subject?: string | null;
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  /** 切片命题／说明：封面构图与氛围的首要依据 */
  sliceAngle?: string | null;
}): string {
  const protagonist = anchorName(opts.subject);
  const slice = opts.sliceTitle?.trim();
  const series = opts.seriesTitle?.trim();
  const angle = opts.sliceAngle?.trim();
  const angleClip = angle ?
    safePromptInline(angle, SLICE_ANGLE_COVER_PROMPT_MAX)
  : "";
  const titleShort = slice ?
    safePromptInline(slice, 80)
  : series ?
    safePromptInline(series, 80)
  : "";
  const seriesContext = series ? safePromptInline(series, 64) : "";

  const propositionBlock =
    angleClip ?
      `【切片命题｜封面须优先落实】以下为用户填写的**切口说明**，画面构图、典型瞬间、对峙关系、环境氛围、情绪张力须**主要**由此提炼，避免只套用泛化系列名而与命题脱节：${angleClip}`
    : `【切片命题】用户未填切口说明：请结合「切片标题／系列」与主角，提炼单一高峰瞬间的具象画面。`;

  const titleBlock = titleShort ?
    `【切片标题（辅助点题）】「${titleShort}」。`
  : "";
  const seriesBlock =
    seriesContext && angleClip ?
      `【人物向系列（语境）】「${seriesContext}」——须与命题一致，勿用系列名盖过切口说明。`
    : seriesContext ?
      `【人物向系列】「${seriesContext}」。`
    : "";

  return (
    `【封面底图｜纯画面】历史短视频**外宣/列表用竖屏底图**：须像「这一支只讲这一下」的电影感瞬间，避免泛古代肖像或无关场面。主角须与「${protagonist}」一致，且为画面唯一视觉中心。`
  ).concat(
    propositionBlock,
    titleBlock,
    seriesBlock,
    `【严禁内嵌任何文字】画面中不得出现可读汉字、英文字母、数字贴片、水印、字幕条、角标 logo、印刷字、匾额对联、条幅标语等（含潦草手写体字幕）；不要求也不允许生成封面标题——**留白由后期人工配字**。可适当在上部或一侧保留干净天空、幔帐、单色墙面等柔和留白，便于成片叠字；不要画空白字框或明显「预留字形」占位。构图适合竖屏短视频首帧裁剪。`,
  );
}

/** 文生图提示里附带口播长度上限，避免顶满厂商上限 */
const NARRATION_IN_IMAGE_PROMPT_MAX = 280;

export function clipNarrationForImagePrompt(n?: string | null): string {
  const t = n?.trim() ?? "";
  if (!t) return "";
  if (t.length <= NARRATION_IN_IMAGE_PROMPT_MAX) return t;
  return `${t.slice(0, NARRATION_IN_IMAGE_PROMPT_MAX)}…`;
}

/** 独立封面：仅文本命题 + 画风；不向模型注入「第几镜」等产品概念 */
export function standaloneCoverVisualGuide(stylePreset: string): string {
  return `【封面画面】「${stylePreset}」画风；竖屏**单帧静图**。构图、环境、光影与**戏剧张力**须严格贴合上文「切片命题／标题／系列语境」；电影感留白便于后期叠字；自成一张可单独用作列表首帧、信息完整的画面。`;
}

/** 与本镜 narration 对齐的说明片段（可无） */
export function narrationCoherenceSnippet(narration?: string | null): string {
  const clip = clipNarrationForImagePrompt(narration);
  if (!clip) return "";
  return `【本镜口播摘录（画面须与之相符：主要人物在场关系、地点环境、手持物或关键道具、昼夜与氛围勿与下列矛盾）】${clip}`;
}

export function driverSupportsReferenceImage(
  driver: ImageProfileDriver,
): boolean {
  return driver === "dashscope_qwen_image" || driver === "volcengine_seedream";
}

export type ImageCoherencePlan = {
  sceneRole: "cover" | "follow";
  referenceRole: "previous" | "cover" | null;
  useReferenceImage: boolean;
  /** 已拼好的完整提示词（含画风英文片 + 中文约束 + 分镜） */
  fullPrompt: string;
};

/**
 * - **standaloneCover**：仅外宣封面底图（切片意象），与正片镜 1 脱钩。
 * - **sceneIndex === 1 且非独立封面**：正片首镜，用分镜 visual + 口播，不含切片封面大块。
 * - **sceneIndex > 1**：图生图或文生跟镜。
 */
export function planImageCoherencePrompt(args: {
  sceneIndex: number;
  stylePreset: StylePreset;
  visualDescription: string;
  /** 仅生成独立封面底图（与正片镜 1 分离）；为 true 时不使用本请求的 visual/narration 作画面主体 */
  standaloneCover?: boolean;
  /** 封面底图：系列 / 切片标题 / 切片说明（独立封面或旧逻辑用；说明优先） */
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  sliceAngle?: string | null;
  /** 本镜口播；与 visual 一并约束出图，减少声画脱节 */
  narration?: string | null;
  subject?: string | null;
  dynasty?: string | null;
  referenceImageUrl?: string | null;
  referenceRole?: "previous" | "cover" | null;
  driver: ImageProfileDriver;
}): ImageCoherencePlan {
  const name = anchorName(args.subject);
  const dynasty = args.dynasty?.trim();
  const style = args.stylePreset;
  const snippet = STYLE_SNIPPET[style];
  const anchorZh = STYLE_ANCHOR_ZH[style];
  const visual = args.visualDescription.trim();
  const narrLine = narrationCoherenceSnippet(args.narration);

  const useReferenceImage = Boolean(
    args.referenceImageUrl?.trim() &&
      args.sceneIndex > 1 &&
      driverSupportsReferenceImage(args.driver),
  );

  if (args.standaloneCover) {
    const coverBaseSnippet = coverBaseOnlyPromptSnippet({
      subject: args.subject,
      seriesTitle: args.seriesTitle,
      sliceTitle: args.sliceTitle,
      sliceAngle: args.sliceAngle,
    });
    const guide = standaloneCoverVisualGuide(args.stylePreset);
    const hasRef =
      Boolean(args.referenceImageUrl?.trim()) &&
      driverSupportsReferenceImage(args.driver);
    const refIntro = hasRef ?
      [
        "【参考图｜图生图·封面重生】首条消息中的参考图来自用户指定的竖屏封面或人物定妆。",
        "请**保留**参考图中主角的面部结构、年龄气质、须发样式、衣冠形制与主色系，避免换脸成另一历史人物；",
        "在此人物一致性的前提下，依据下方「切片命题／切片标题／系列语境」**重新设计**场景环境、机位、肢体、道具与光影戏剧张力，生成一张**新的**外宣竖屏底图（构图可与参考不同）。",
      ].join("")
    : "";

    const fullPrompt = [
      hasRef ?
        "【竖屏封面底图｜参考重生】"
      : "【竖屏封面底图】列表或外宣用的单帧首图；只根据下文切片命题、标题、系列语境与主角作画。",
      refIntro,
      `主角（须为画面唯一核心人物，观众可辨识其时代气质）：「${name}」。`,
      dynasty ? `时代与叙事背景：${dynasty}。` : "",
      coverBaseSnippet,
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      guide,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      sceneRole: "cover",
      referenceRole: hasRef ? "cover" : null,
      useReferenceImage: hasRef,
      fullPrompt,
    };
  }

  if (args.sceneIndex === 1) {
    const fullPrompt = [
      "【正片第 1 镜｜叙事开场】承接 hook 后的第一个可见画面；**非**外宣独立封面（封面请用「生成封面底图」单独出图）。",
      `主角：「${name}」。`,
      dynasty ? `时代与叙事背景：${dynasty}。` : "",
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      narrLine,
      "【本镜分镜画面】",
      visual,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      sceneRole: "follow",
      referenceRole: null,
      useReferenceImage: false,
      fullPrompt,
    };
  }

  if (args.sceneIndex < 2) {
    throw new Error(
      `非法 sceneIndex「${args.sceneIndex}」：正片镜须 ≥1；独立外宣封面请传 standaloneCover 且 sceneIndex 为 0`,
    );
  }

  const refLabel =
    args.referenceRole === "cover"
      ? "封面定稿首帧"
      : args.referenceRole === "previous"
        ? "上一镜成片"
        : "前序已定帧";

  if (useReferenceImage) {
    const fullPrompt = [
      `【第 ${args.sceneIndex} 镜｜图生图·人物与造型连贯】`,
      `参考图为${refLabel}。请保留参考图中主角的面部结构、年龄气质、须发样式、衣冠形制与主色系；`,
      "仅依据下列描述调整场景环境、机位、肢体动作与手持物，禁止换脸成另一历史人物。",
      `主角姓名/称谓：「${name}」。`,
      dynasty ? `时代背景：${dynasty}。` : "",
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      narrLine,
      "【本镜分镜画面】",
      visual,
    ].join(" ");

    return {
      sceneRole: "follow",
      referenceRole: args.referenceRole ?? null,
      useReferenceImage: true,
      fullPrompt,
    };
  }

  const fullPrompt = [
    `【第 ${args.sceneIndex} 镜｜文生图·须与首帧人物幻想一致】`,
    `主角：「${name}」。当前模型不支持参考图，请仅凭文本保持与首镜相同的历史人物脸型、发型、胡须与衣冠主色（不要换成其他名人脸）。`,
    dynasty ? `时代：${dynasty}。` : "",
    `【造型锚点】${anchorZh}`,
    `【画风】${snippet}`,
    narrLine,
    "【本镜分镜画面】",
    visual,
  ].join(" ");

  return {
    sceneRole: "follow",
    referenceRole: args.referenceRole ?? null,
    useReferenceImage: false,
    fullPrompt,
  };
}
