/**
 * 文生图 / 图生图：封面与跟镜的中文约束与拼装片段（供 image-coherence 调度）
 */

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

/** 封面：切题底图 + 纯画面（无任何内嵌文案，供后期人工叠字） */
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

export function buildStandaloneCoverLead(hasReference: boolean): string {
  return hasReference ?
      "【竖屏封面底图｜参考重生】"
    : "【竖屏封面底图】列表或外宣用的单帧首图；只根据下文切片命题、标题、系列语境与主角作画。";
}

export function buildCoverReferenceFigureIntro(): string {
  return [
    "【参考图｜图生图·封面重生】首条消息中的参考图来自用户指定的竖屏封面或人物定妆。",
    "请**保留**参考图中主角的面部结构、年龄气质、须发样式、衣冠形制与主色系，避免换脸成另一历史人物；",
    "在此人物一致性的前提下，依据下方「切片命题／切片标题／系列语境」**重新设计**场景环境、机位、肢体、道具与光影戏剧张力，生成一张**新的**外宣竖屏底图（构图可与参考不同）。",
  ].join("");
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
  return "【正片第 1 镜｜叙事开场】承接 hook 后的第一个可见画面；**非**外宣独立封面（封面请用「生成封面底图」单独出图）。";
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
