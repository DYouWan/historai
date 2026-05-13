/**
 * Storyboard Prompts - 文案分镜：单次主生成 + 分阶段（叙事骨架 → 分块扩写）提示拼装
 */

import type {
  SceneSkeletonEntry,
  TimelineBeat,
  Tone,
  VideoDurationMin,
} from "@/lib/types";
import {
  getVideoDurationPreset,
  TIMELINE_SEGMENTS_HARD_MAX,
  type VideoDurationPreset,
} from "@/lib/video-duration";

export type StoryboardPromptParams = {
  seriesTitle?: string;
  sliceTitle?: string;
  sliceAngle?: string;
  subject: string;
  dynasty?: string;
  tone: Tone;
  stylePreset: string;
  videoDurationMin?: VideoDurationMin;
};

/** 极简 stakes 须在 index 1～返回值（含）内首次说清楚（与叙事骨架/分块扩写共用） */
export function stakeWindowEndInclusive(d: VideoDurationPreset): number {
  const mid = (d.minScenes + d.maxScenes) / 2;
  return Math.max(3, Math.min(8, Math.round(mid / 4)));
}

function buildSchemaHint(d: VideoDurationPreset): string {
  const stakeEnd = stakeWindowEndInclusive(d);
  return `你必须只输出合法 JSON（不要 Markdown，不要代码围栏）。**scenes 数组须含 ${d.minScenes}～${d.maxScenes} 条**，并满足「分镜节奏」与「总时长」硬约束（见下方产品核心）；单镜 durationSec 常见 ${d.perScenePreferredLabel}。结构如下：
{
  "hook": "黄金数秒抓耳：个人主角用第一人称「我」；群体用「他们」开场（不用「我们」代指该群体）。强反差/强悬念，指向唯一切面。**极简 stakes**：至迟在**第 ${stakeEnd} 镜（含）前**的口播链中，须让观众明白「此刻险在何处或赢面何在、这一下为何关键」；hook 可只负责钩子，stakes 由第 2～${stakeEnd} 镜与 hook 一脉相承补足，禁止拖到中段才首次交代。",
  "timeline": [
    { "label": "可选情绪或结构节点（如：铺垫反差）", "text": "与 hook、口播人称一致：白话叙事为主；个人「我」/ 群体「他们」；可穿插极短史据引句，实体信息用白话写清；禁止全知列传腔", "sources": ["《xx》或学者观点简述"] }
  ],
  "scenes": [
    {
      "index": 1,
      "visualDescription": "给画面生成模型用的中文画面描述：含时代/服饰/场景关键词；须与本镜 narration 声画实体对齐。可按叙事写对峙方轮廓、部属/人群反应、环境纵深或远景局势（口播仍为主角人称）；宜有景别变化，勿默认每镜只有主角单人特写",
      "narration": "本镜口播为**成片唯一可听主干**的一段：顺读须**不依赖 timeline 也能讲满本切片**；与同段 timeline 信息对应展开，勿只在 timeline 写全、口播只剩金句；与前、后镜顺读成链；1～2 句；个人「我」、群体「他们」；字数与 durationSec 匹配",
      "durationSec": ${d.perSceneCenterSec}
    }
  ],
  "factNotes": ["需要人工核对的重要史实提示"],
  "complianceNote": "若有敏感或争议点，给出口径提醒，否则写 null"
}`;
}

/** 系列 / 切口 / 时长 / 主角行（全文案与 L1 共用） */
function buildThemeSliceDurationSubjectLines(
  params: StoryboardPromptParams,
): {
  d: VideoDurationPreset;
  toneText: string;
  lead: string;
} {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const toneText =
    params.tone === "serious"
      ? "严肃科普：少用夸张梗，强调史料出处与限定语（如「学界认为」「史料记载」）。"
      : "叙事向：可适度悬念与反差，但仍需标注史料来源与不确定之处。";

  const hasTheme = Boolean(params.seriesTitle?.trim());
  const hasUserSlice = Boolean(
    params.sliceTitle?.trim() && params.sliceAngle?.trim(),
  );

  const themeBlock = hasTheme
    ? hasUserSlice
      ? `**人物向系列：**「${params.seriesTitle!.trim()}」\n叙事与人物必须与本系列定位一致；同时存在下方「切片标题/切口」时，**全文与分镜必须优先落实该切片标题与切口**，不得只写系列层面的泛泛介绍或人物小传。\n`
      : `**人物向系列：**「${params.seriesTitle!.trim()}」\n全文、分镜与人物叙事必须紧扣本系列定位；若尚未有切片标题，请在 hook 中点明本支视频唯一的具体切口。\n`
    : "";

  const sliceBlock = hasUserSlice
    ? `**切片标题 / 唯一切面（必须落实）：**\n标题：${params.sliceTitle!.trim()}\n切片说明：${params.sliceAngle!.trim()}\n`
    : "";

  const sliceRuleFallback =
    !hasTheme && !hasUserSlice
      ? `未给定人物向系列且未给定切片标题/切口时：你必须**自拟一个清晰、单一的「切面命题」**（用一句话说清本视频只讲哪一个冲突、悖论或抉择），并在 hook 或 timeline 首段的 label 中点明；禁止泛谈「一生」「生平」。\n`
      : "";

  const durationBlock = `**叙事目标时长（须与界面选择一致）**：${d.labelShort}。须严格满足下方「分镜节奏」中的**镜数区间**与 **总秒数区间**。\n\n`;

  const lead = `${themeBlock}${sliceBlock}${sliceRuleFallback}${durationBlock}主角/主题对象：${params.subject}
朝代/背景（可空）：${params.dynasty || "未指定"}
`;

  return { d, toneText, lead };
}

function buildStoryboardPromptParts(params: StoryboardPromptParams): {
  d: VideoDurationPreset;
  contextPrefix: string;
  productAndRequirements: string;
} {
  const { d, toneText, lead } = buildThemeSliceDurationSubjectLines(params);
  const stakeEnd = stakeWindowEndInclusive(d);

  const contextPrefix = `${lead}
**人称（硬约束）**：主角为「${params.subject}」。**若为具体个人**：**hook**、**timeline[].text**、**scenes[].narration**（或后续扩写阶段的口播）必须以第一人称「我」自述，用「我记得」「当日我」「史书里写我那件事……」等与史料衔接；**禁止**用「他/她」或直呼全名作主语描写自身言行。**若为并称群体、阵营或集体对象**：全流程以「**他们**」指称该群体作主语（**不要用「我们」**代指同一群体），口播仍须完整可念；**禁止**用单数「他」指代整个群体。引他人评价、摘史书时可短暂出现专名。若切片标题/切口已用「我」而主体实为个人，须与「我」线严格一致。

统一画风关键词（写入每镜的 visualDescription 前缀保持风格）：${params.stylePreset}

口吻：${toneText}

**语体（短视频可念）**：**hook**、**timeline[].text**、**sceneSkeleton[].beat** 以及后续口播扩写，须以**现代汉语白话**为主，像对镜头口述、能上字幕念顺；避免之乎者也、刻意骈俪对仗与史传仿写腔。**禁止**以文言或半文半白作为整条叙事主干。若引用典籍，仅用**极短**摘句点睛，且同段仍以白话叙事实体信息。

**声画分工（人物向成片）**：口播人称不变（个人「我」/ 群体「他们」）。**visualDescription** 按「导演分镜」写：**允许且应当在叙事需要时出现对立阵营轮廓、部属与人群反应、局势环境与纵深**，与口播实体信息一致即可；勿把整条片子写成「镜镜只有主角一张脸」的配图脚本。
`;

  const productAndRequirements = `**产品核心（必须遵守）**
- 这是 **${d.labelShort}** 量级的历史短视频切片，不是传记片：禁止编年体、禁止从出生/家世到死亡/盖棺的流水账，禁止百科词条式罗列。**「不写生平编年史」≠ 可半截收场**：用户选定的**唯一切面**必须在口播与叙事弧上**有头有尾**讲完——从钩子把观众带进这一条高光，经展开与推进，到回扣切口并收束，让观众感到「**这一条切片讲圆了**」，而非「只挂了系列名头、故事没落地」或「刚起势就断」。
- **极简前置 stakes（硬约束 / 路线图 ②）**：从 hook 接续的口播起，至**第 ${stakeEnd} 镜（含）**为止，须让观众**第一次**弄清本切口「为何会要命/赌注在哪」：**时间或局势锚点**、**双方或我方处境**、「**失手或选错的核心后果**」中至少压实**两项**（用字极简，**忌**百科式铺陈）；hook 可先只负责抓耳，stakes 由第 2 镜起与 hook **同一因果链**补足。**禁止**到中段以后才首次交代 stakes；**禁止**在上述窗口只有意象对联而无实体赌注信息。
- **唯一高峰「峰值镜」（硬约束 / 路线图 ②）**：全片只能有**一个**清晰的**叙事/情绪顶峰**（对决、翻盘、绝唱式亮相、一剑/一策定局等）；中段连续递进须把势能**主推**向该顶峰，禁止多个「泛泛高潮」平地并列。**timeline** 中须有**恰好一段**（一段即可）label 明示高峰语义：**须含**「高潮」「顶点」「翻盘」「一搏」「定局」「一绝」或其同义短语之一，且该段 text 所写的正是全片那一次顶峰；与之对应的镜群口播须形成整条片子的**最强戏剧瞬间**。
- **峰终体验（硬约束 / 路线图 ②）**：在遵守既有「倒数第二镜落槌、最后一镜余韵」前提下，结尾须符合**峰终定律**印象：**最后一镜**余韵须**语义或情境回扣**前文已落地的**那座唯一高峰**（回响、回声、留白均可），禁止高峰后忽然换题、贴片式 unrelated 金句；倒数第二镜落槌须与高峰**同一命题线**咬合（何人、何事、何种后果的最后一颗钉子）。
- 叙事必须是**故事体**：冲突 → 挣扎或反差 → 反转或落点 → 收束（可选：一句留互动/留白的口播，但不要编造虚假互动数据）。
- 输出 JSON 中的 timeline 数组表示**叙事推进与情绪节点**（如极简 stakes、推进、指向唯一高潮、回落收束），**不是**人物生平年表；段落之间要有因果与悬念，而非仅时间先后。
- **口播分工（硬约束）**：\`timeline[].text\` 用于**叙事节点标签下的展开与考据出处**，须与**人称规则**一致（个人「我」/ 群体「他们」），**不得**成为「只有读完 timeline 才懂故事」的独家正文。**成片可听内容以所有 \`scenes[].narration\` 自上而下连读为唯一主干**：连读须**单独讲满本切片**（铺垫→核心矛盾→推进→高点或反转→回扣用户切口→收束），信息与情绪上与各段 timeline **对应展开**（可更口语、拆成多镜），**禁止** timeline 长篇铺陈而口播只剩碎片警句。**用户切片说明**里的关键对照、时间跨度、落点对话或问句，须在口播链中落实，**禁止**仅出现在 timeline。每镜仍须让观众只看本镜字幕能跟上当下发生了什么——禁止整镜只有对联式金句而无事实钩子。
- **口播连贯与收束（硬约束）**：将所有 \`scenes[].narration\` **从上到下顺读**，须听成**一条连续故事线**，而不是互不相干的标语拼盘。镜与镜之间要有**时间顺序或因果承接**（可轻用「接着」「就在那时」「同一天夜里」「到第二天」等，勿篇篇另起无头句）。**中段**以可辨的**行动—反应—局势变化**为主；**禁止**从大约第 **${d.metaphorFromSceneApprox}** 镜起到结尾**连续超过 2 镜**只有隐喻/警句而没有**新的事实或动作信息**。**倒数第二镜**须用**直白陈述**把切口命题**落槌回扣**（何人、何事、何后果中至少再落实一项）；**最后一镜**再给余韵或一句可讨论留白，**禁止**仅靠抽象意象突然断住，让人以为口播没讲完。
- **镜头丰富度（硬约束）**：口播人称仍为个人「我」或群体「他们」，**不得**为配角另开口播线；但 **visualDescription 必须写出场面调度**。**禁止**连续 **3** 镜的画面重心仅为「主角单人同级别近景/特写」且画面中**看不到**任何他人轮廓、群体动向、对峙张力或环境/局势纵深（除非 timeline 已标明该段为极简独白实验——默认不允许）。全片 **visualDescription** 须在展开段**穿插**若干镜，明确写到以下**至少一类**：对立或可感知的外部压力（远景营阵、旗帜剪影、对岸火光等，不确定具体历史人物时勿捏造其五官特写）、部属/士卒/侍从/群臣的反应或局部动作、大环境或关键局势道具（战场纵深、江面、殿陛格局等）。主角仍可多次入画，但宜轮换景别与站位（侧背、人群中、前景遮挡等），避免「每一镜都是主角大头贴」。
- **分镜节奏（硬约束）**：不得在 timeline 写得极细却只给很少的镜。**总镜数须 ${d.minScenes}～${d.maxScenes}**，**不得少于 ${d.minScenes}** 镜。**从第 2 镜起到倒数第 3 镜**为展开区，其中须安排**至少连续 ${d.midStreakMin} 镜**递进矛盾、史实细节或反差，不得以一两镜带过核心过程。**收尾至少 2 镜**：倒数第二镜须把切口「落槌」；最后一镜余韵或留白。**总时长**：所有 \`scenes[].durationSec\` **相加须在 ${d.minTotalSec}～${d.maxTotalSec}**；单镜时长首选 **${d.perScenePreferredLabel} 秒**，极短独白才可 **${d.perSceneMinSec} 秒**，**避免**大量使用 **${d.shortSceneWarnBelow} 秒**糊弄；若加总明显低于 **${d.softMinTotalSec} 秒**，视为不达标须重新分配镜数与时长。

要求：
1. timeline **至少 ${d.timelineMin}** 段、**至多 ${TIMELINE_SEGMENTS_HARD_MAX}** 段（**建议**约 ${d.timelineMax} 段以内以保持紧凑，可多写以补充节点）；每段给出至少 1 条 sources（书名/章节/学者观点均可，勿编造页码）。整体覆盖：**前置窗口内或与 hook 接续的极简 stakes** → **向唯一高峰递进** → **顶峰爆发或认知瞬时反转** → **落槌回顾与余韵**，且 **其中必须有一段** timeline 对应上文「高峰 label」硬性要求。
2. scenes 与 timeline **同弧对齐**：每一段 timeline 的实质信息（人物动作、文献一句、反差落点等）须在对应镜群的口播中有展开或呼应，避免「timeline 已写透、口播像旁白提要」。总镜数 **${d.minScenes}～${d.maxScenes}**（须满足上文「中段连续递进镜数、末尾至少 2 镜」）；每镜 durationSec **以 ${d.perSceneCenterSec} 秒为居中参考**，按口播字数在 **${d.perSceneRangeLabel}** 间微调；**全片 durationSec 之和须在 ${d.minTotalSec}～${d.maxTotalSec}**；每镜 visualDescription 里重复画风关键词；**每镜 visualDescription 与本镜 narration 须声画一致**（口播中的可见场景、人物关系、关键器物、昼夜与氛围须在画面描述中有对应，禁止明显相悖）；镜序只服务同一切面。**visualDescription** 还须遵守上文「镜头丰富度」：勿全线镜头仅有主角单人特写。
3. **每镜 narration（硬约束）**：在已定人称前提下（个人主角用「我」，群体主角用「他们」），使用可读口播句式（陈述句为主）；单镜允许 1～2 句，**并尽量让下一镜首句自然承接上一镜**。**按约 3～4 汉字/秒的口播语速**核对：narration 与 \`durationSec\` 匹配。**悬念、隐喻仅作点缀**；**至少半数分镜**除修辞外还须带**实体信息**（时间、数字、具体动作、地名/身份、直接后果择一）。数字与易夸大处须有依据或「史载」「一说」限定（与 factNotes 一致）。
4. factNotes 列出最值得发布前复核的结论（最多 5 条）。
5. complianceNote：若涉及民族/宗教/疆界等高风险表述，给出口径提示；否则为 null。`;

  return { d, contextPrefix, productAndRequirements };
}

/** 人物向系列与人物、人称、画风、口吻等共用前缀（分块叙事骨架与扩写阶段复用） */
export function buildStoryboardContextPrefix(
  params: StoryboardPromptParams,
): string {
  return buildStoryboardPromptParts(params).contextPrefix;
}

/** L1 叙事骨架专用：系列/切口/时长/主角 + 画风口吻 + beat 场面提示；人称与白话语体见 `buildSpineSystemPrompt` */
export function buildSpineContextPrefix(
  params: StoryboardPromptParams,
): string {
  const { toneText, lead } = buildThemeSliceDurationSubjectLines(params);
  return `${lead}
**画风关键词（后续写入各镜 visualDescription 前缀）：**${params.stylePreset}

**口吻：**${toneText}

**场面侧重（写入 beat 即可）：**可点「主角反应 / 对峙压力 / 部属或人群 / 环境局势」之一；勿在此阶段写 visualDescription、完整口播或 scenes。
`;
}

/** 整稿口播专用上下文：保留人称与语体；声画改为撰稿视角一句（不写 visualDescription） */
export function buildVoiceoverContextPrefix(
  params: StoryboardPromptParams,
): string {
  const { toneText, lead } = buildThemeSliceDurationSubjectLines(params);
  return `${lead}
**人称（硬约束）**：主角为「${params.subject}」。**若为具体个人**：整稿口播各段（**paragraphs** 按镜序）必须以第一人称「我」自述，用「我记得」「当日我」「史书里写我那件事……」等与史料衔接；**禁止**用「他/她」或直呼全名作主语描写自身言行。**若为并称群体、阵营或集体对象**：全流程以「**他们**」指称该群体作主语（**不要用「我们」**）；**禁止**用单数「他」指代整个群体。引他人评价、摘史书时可短暂出现专名。

统一画风关键词（后续分镜写入各镜 visualDescription 前缀）：${params.stylePreset}

口吻：${toneText}

**语体**：须以**现代汉语白话**口述，像对镜头念顺；避免文言、骈俪作主架；典籍仅极短点睛，实体情节用白话。

**声画（本阶段）**：不输出画面描述；口播里写清场面实体（对峙、人群、环境等），供后续分镜扩写对齐。
`;
}

/** 整稿口播专用：去掉 L3 镜头丰富度、timeline/scenes 产出及 factNotes 等与本阶段无关条目 */
export function buildVoiceoverProductAndRequirementsOnly(
  params: StoryboardPromptParams,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
  return `**产品核心（整稿口播，必须遵守）**
- 这是 **${d.labelShort}** 量级的历史短视频切片，不是传记片：禁止编年体、禁止从出生/家世到死亡/盖棺的流水账，禁止百科词条式罗列。**「不写生平编年史」≠ 可半截收场**：用户选定的**唯一切面**必须在口播叙事上**有头有尾**讲完——从开篇把观众带进这一条高光，经展开与推进，到回扣切口并收束，让观众感到「**这一条切片讲圆了**」，而非「只挂了系列名头、故事没落地」或「刚起势就断」。
- **极简前置 stakes（硬约束）**：从**首段**起至**第 ${stakeEnd} 镜（含）所对应的口播**为止，须让观众**第一次**弄清本切口「为何会要命/赌注在哪」：**时间或局势锚点**、**双方或我方处境**、「**失手或选错的核心后果**」中至少压实**两项**（用字极简，**忌**百科式铺陈）；开篇可先只负责抓耳，stakes 由第 2 镜起与开篇**同一因果链**补足。**禁止**到中段以后才首次交代 stakes；**禁止**在上述窗口只有意象对联而无实体赌注信息。
- **唯一高峰**：全片只能有**一个**清晰的叙事/情绪顶峰（对决、翻盘、绝唱式亮相、一剑/一策定局等）；**已定叙事骨架**已在 timeline 落实高峰节拍——口播须在**对应连续镜群**写出最强戏剧瞬间，禁止多个泛泛高潮平地并列。
- **峰终体验**：**倒数第二镜**对应口播须把切口**落槌回扣**（何人、何事、何后果至少再落实一项）；**最后一镜**对应口播余韵须回扣前文**那座唯一高峰**（回响、留白均可），禁止高峰后忽然换题、贴片式无关金句。
- 叙事必须是**故事体**：冲突 → 挣扎或反差 → 反转或落点 → 收束（可选：一句留互动/留白的口播，但不要编造虚假互动数据）。
- **叙事推进**：全部 **${targetSceneCount}** 段顺序须体现 stakes→递进→唯一高峰→落槌余韵，与下列骨架 **beat** 顺序一致；**不是**人物生平年表。

- **口播主干**：输出 **paragraphs** 字符串数组，恰好 **${targetSceneCount}** 条，**第 i 条**对应 **index=i** 的镜，须落实该镜 beat 与 **durationSec**；顺读时自上而下连成一条故事线（条与条之间须有因果或时间承接，可轻用衔接词）。

- **连贯与收束**：各段自上而下顺读成一条连续故事线；段间须有因果或时间承接（可轻用「接着」「就在那时」「同一天夜里」等）。**中段**以行动—反应—局势变化为主；**禁止**从大约第 **${d.metaphorFromSceneApprox}** 段起到结尾**连续超过 2 段**只有隐喻/警句而没有新的事实或动作信息。

- **时长与字数**：按约 **3～4 汉字/秒** 核对每段与该镜 **durationSec**；骨架中各镜 duration 之和已定型，口播总体量须与之匹配；**避免**大量极短段糊弄。

**整稿口播硬要求**
1. 叙事弧与骨架 index 1～${targetSceneCount} **顺序对齐**，不得打乱或遗漏某一镜的核心 beat。
2. **至少半数段落**除修辞外须含实体信息（时间、数字、动作、地名/身份、后果择一）；数字与易夸大处须有依据或「史载」「一说」，不确定处加限定语。
`;
}

/** 与单次主生成相同的产品核心 + 要求 §1～5（不含 SCHEMA） */
export function buildStoryboardProductAndRequirementsOnly(
  params: StoryboardPromptParams,
): string {
  return buildStoryboardPromptParts(params).productAndRequirements;
}

export function buildSystemPrompt(
  videoDurationMin: VideoDurationMin = 1,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  const stakeEnd = stakeWindowEndInclusive(d);
  return `你是 HistorAI 的历史短视频脚本与分镜助手：帮用户讲透**一个**有传播力的「切面」（单一钩子与冲突线）。**峰值叙事**：**前 ${stakeEnd} 镜（含）**内必须把**极简 stakes** 讲清楚；全片只允许**一处**明明白白的高峰（timeline label 明示）；收尾须**回扣**那座高峰以满足峰终。**绝不写人物生平编年史**（禁止求全传、一生流水账），**但当前选定的这一条切片必须有头有尾讲完**：自成完整微型故事弧（起→承→转/高点→合/收束），不得因「非编年」而虎头蛇尾。你只输出 JSON，内容为中文。对不确定的史实要明确写出不确定性，不得把演义当成正史。**语体**：hook、timeline 与各镜 narration 以**现代汉语白话**口述为宜，便于字幕与收听；避免文言、骈句作主叙事。**人称**：个人用「我」，群体用「他们」。**画面**：分镜 visualDescription 须穿插对峙、部属反应或环境局势镜头，避免全线只有主角单人特写。**分镜 ${d.minScenes}～${d.maxScenes}**、成片目标 **${d.labelShort}**（总时长须落在产品约束的秒数区间内）。**所有 scenes 的 narration 连读须自足讲完本切片**（勿把完整故事只写在 timeline、口播留空壳）。顺读须连成故事线，有因果或时间承接；末段须有直白落槌再加回扣高峰的余韵，勿连堆隐喻断尾。**narration** 与每镜时长字数匹配。`;
}

export function buildUserPrompt(params: StoryboardPromptParams): string {
  const { d, contextPrefix, productAndRequirements } =
    buildStoryboardPromptParts(params);
  return `${contextPrefix}

${productAndRequirements}

${buildSchemaHint(d)}`;
}

// --- 分阶段分块（叙事骨架 → 扩写），与 orchestrator  chunked 路径共用 ---

export type SceneSkeletonRow = SceneSkeletonEntry;

export function buildSpineSystemPrompt(
  videoDurationMin: VideoDurationMin,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  const stakeEnd = stakeWindowEndInclusive(d);
  return `你是 HistorAI 的**叙事骨架规划**助手：只搭建本条短片的结构骨架（hook、timeline、逐镜节拍），不撰写完整口播或分镜画面文案。

【输出】
- 只输出**合法 JSON**，中文；不得 Markdown、代码围栏或非 JSON。
- **不写** visualDescription、narration、scenes；字段仅限用户消息中的骨架 JSON 结构。

【sceneSkeleton（核心）】
- 恰好 **${targetSceneCount}** 条，与叙事目标 **${d.labelShort}**、全片镜数区间 **${d.minScenes}～${d.maxScenes}** 对齐；条数必须**等于 ${targetSceneCount}**，供后续自动分块扩写。
- 每条含：**index**、**beat**（本镜叙事要点，约 20～60 字）、**durationSec**。
- **beat** 宜预见后续画面的**场面调度**：间歇写到对峙压力、部属/人群反应或环境局势；避免条条都是「主角独白站桩」。
- **前置 ${stakeEnd} 镜（含）内**：整条 beat 链须能看出**极简 stakes** 已被落实（与主产品 stakes 窗口一致）。
- **末段几条 beat**：须指向**峰终回扣**（回扣全片**唯一**高峰命题，勿换题收尾）。

【hook / timeline / 备注】
- **hook**、**timeline**、**factNotes**、**complianceNote** 与主产品峰值叙事规则一致。
- **timeline** 须含**恰好一段** label 明示高峰语义：**须出现**「高潮」「顶点」「翻盘」「一搏」「定局」「一绝」或其同义语之一，且该段 text 对应全片那一次顶峰。

【人称与史实】
- **具体个人**：**hook**、**timeline[].text**、每条 **beat** 叙事主干须第一人称「我」；禁止以「他/她」或直呼全名作主语描写自身言行。
- **并称群体/阵营**：主干须用「**他们**」，**禁用「我们」**指同一群体；禁止单数「他」指代全体。
- 不确定史实须在输出中标注（可与 factNotes 呼应）；禁止把演义当正史写死。

【语体】
- **hook**、**timeline[].text**、每条 **beat** 为后续口播蓝本：须**现代汉语白话**、短小上口；禁止文言或骈俪作主架；典籍仅极短点睛，实体用白话。`;
}

export function buildSpineUserPrompt(
  params: StoryboardPromptParams,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
  const spineLead = buildSpineContextPrefix(params);

  const spineBody = `你必须只输出合法 JSON（不要 Markdown，不要代码围栏）。结构如下：
{
  "hook": "黄金数秒开场，个人「我」或群体「他们」，强悬念，指向唯一切面；极简 stakes 至迟在第 ${stakeEnd} 镜前由 beat 链体现",
  "timeline": [
    { "label": "节点", "text": "与 hook 人称一致；白话叙事为主，史据放 sources", "sources": ["《xx》或学者观点"] }
  ],
  "sceneSkeleton": [
    { "index": 1, "beat": "本镜要发生的动作/信息/情绪，供下一阶段扩写口播与画面", "durationSec": ${d.perSceneCenterSec} }
  ],
  "factNotes": ["最多 5 条复核提示"],
  "complianceNote": null
}

**结构骨架硬约束**
1. **sceneSkeleton 必须恰好 ${targetSceneCount} 条**；index 须为 1～${targetSceneCount} 连续整数，不得缺号或重复。
2. 每条 **durationSec** 须在 **${d.perSceneMinSec}～${d.perSceneMaxSec}**；全片 durationSec 之和须落在 **${d.minTotalSec}～${d.maxTotalSec}**（若略有偏差，后续扩写阶段会微调单镜时长，此处尽量接近）。
3. **beat** 为扩写蓝图：须让读者能预见口播将包含的**实体信息**（时间、地点、数字、动作等择一），并可标注本镜画面侧重（主角反应 / 对立面压力 / 部属群像 / 环境局势之一），勿写空泛形容词堆砌；**不要**在此阶段写完整口播长句。
4. timeline **至少 ${d.timelineMin}** 段、**至多 ${TIMELINE_SEGMENTS_HARD_MAX}** 段（**建议**约 ${d.timelineMax} 段以内），每段至少 1 条 sources；**其中一段 label 必须含高峰关键词**（与 System「唯一高峰」一致）。
5. **禁止输出** scenes、visualDescription、narration。

请开始：输出 JSON，sceneSkeleton 恰好 **${targetSceneCount}** 条。`;

  return `${spineLead}\n\n${spineBody}`;
}

export function buildVoiceoverSystemPrompt(
  videoDurationMin: VideoDurationMin,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  return `你是 HistorAI 的**整稿口播撰稿**助手：在已定叙事骨架（sceneSkeleton 镜数与 beats）之上，写出**成片可顺读的唯一口播主干**（以按镜分条的段落数组交付）。你只输出合法 JSON，中文。**不写** visualDescription；**不写** scenes。

【段落数组】
- 只输出 **paragraphs**：恰好 **${targetSceneCount}** 个字符串，**顺序即镜序**（第 i 条对应 index=i）。现代汉语白话，合读须像真人从头到尾讲圆一条故事弧；相邻条之间须有因果或时间承接（可适当用「接着」「就在那时」「后来」「到那天」等轻衔接），**禁止**写成互不粘连的 caption 拼盘。
- **每条**一般为 **1～3 句**，合并相关动作与信息，**禁止**为凑镜数把「走一步、喘一声」拆成大量极短条。

【其余硬约束】
- 第 i 段对应 index=i 的镜，须落实该镜 skeleton 的 beat 与 durationSec；约 **3～4 汉字/秒** 核对字数与口播时长。
- 人称、stakes、唯一高峰、峰终、禁止编年史等产品规则与主生成一致（见用户消息）。
- 不得编造与 factNotes 冲突的史实；不确定处加「史载」「一说」等。
- 叙事目标 **${d.labelShort}**。`;
}

export function buildVoiceoverUserPrompt(
  params: StoryboardPromptParams,
  targetSceneCount: number,
  skeletonTable: string,
): string {
  const prefix = buildVoiceoverContextPrefix(params);
  const product = buildVoiceoverProductAndRequirementsOnly(
    params,
    targetSceneCount,
  );

  return `${prefix}

${product}

**已定叙事骨架（镜数与节拍，不可增删镜）**
${skeletonTable}

请只输出合法 JSON（不要 Markdown，不要代码围栏）：根对象**仅含** **paragraphs**（字符串数组），恰好 **${targetSceneCount}** 条，按镜序。`;
}

export function buildChunkSystemPrompt(): string {
  return `你是 HistorAI 的**分镜扩写**助手：只输出合法 JSON，中文。根对象仅含 **scenes** 数组，条数须与用户指定区间**完全一致**，index 连续。每条含 index、visualDescription（须带统一画风关键词前缀）、narration（口播）、durationSec。\n\n**口播母稿锁定**：用户为每镜提供了**口播母稿段落**，你必须以其为内容与事实依据：可将 wording 微调度口播节奏与时长，**禁止**引入相反事实、新人称线或偏离母稿命题；visualDescription 自由发挥场面调度但须与 narration 声画实体对齐。\n\n同一 index 下 **visualDescription 与 narration 必须声画实体对齐**：口播里观众能「看见」的须在画面描述中落实。**visualDescription** 须落实主产品的**镜头丰富度**。须与给定 timeline、sceneSkeleton 严格对齐；不得编造与 factNotes 矛盾的夸大数字。覆盖**叙事高峰镜群**时压实势能顶点；收尾块遵守**落槌 + 回扣高峰的余韵**。`;
}

export function buildChunkUserPrompt(args: {
  params: StoryboardPromptParams;
  d: VideoDurationPreset;
  chunkStart: number;
  chunkEnd: number;
  hook: string;
  timeline: TimelineBeat[];
  factNotes: string[];
  skeletonRows: SceneSkeletonRow[];
  /** 与 skeletonRows 逐行对应的本镜口播母稿 */
  lockedParagraphs: string[];
  previousLastNarration: string | null;
  nextChunkFirstBeat: string | null;
}): string {
  const { params, d, chunkStart, chunkEnd, hook, timeline, factNotes } = args;
  const prefix = buildStoryboardContextPrefix(params);
  const timelineJson = JSON.stringify(timeline, null, 2);
  const skTable = args.skeletonRows
    .map(
      (r) =>
        `- index=${r.index} durationSec=${r.durationSec} beat：${r.beat}`,
    )
    .join("\n");

  const paraLines =
    args.skeletonRows.length !== args.lockedParagraphs.length ?
      ""
    : args.skeletonRows
        .map(
          (r, i) =>
            `- **index=${r.index}**（母稿，须落实为 narration 内容与事实）\n${args.lockedParagraphs[i]}`,
        )
        .join("\n\n");

  const prev =
    args.previousLastNarration?.trim() ?
      `**上一块最后一镜口播（须自然承接，可复述半句或因果衔接，勿机械重复）：**\n${args.previousLastNarration.trim()}\n`
    : "**本块含全片首镜**：首条 scenes 的 narration 须能接住 hook，并与 hook 不矛盾。\n";

  const next =
    args.nextChunkFirstBeat?.trim() ?
      `**下一块首镜骨架 beat（扩写时勿剧透整块，仅作语气连贯参考）：**\n${args.nextChunkFirstBeat.trim()}\n`
    : "**本块含全片收尾镜**：最后两条须落实「落槌 + 余韵」，与产品收束规则一致。\n";

  return `${prefix}

**扩写区间**：仅生成 **index 从 ${chunkStart} 到 ${chunkEnd}（含）** 的 scenes，**恰好 ${chunkEnd - chunkStart + 1} 条**。

**黄金 hook（须与首镜口播一脉相承）**
${hook}

**timeline（全文结构，不得改写）**
${timelineJson}

**本块 sceneSkeleton（必须逐条落实为画面与时长；口播内容以下方母稿为准）**
${skTable}

**本块口播母稿（须逐条落实为 narration，仅允许口语化与时长微调）**
${paraLines || "（内部错误：母稿与骨架条数不一致）"}

**factNotes（扩写时不得违反）**
${JSON.stringify(factNotes, null, 2)}

${prev}
${next}

**画面与口播硬约束**
- 每镜 visualDescription 开头须含画风关键词：**${params.stylePreset}**（可与主提示「统一画风关键词」同字）。
- **每镜成对自检**：写完 narration 后补写 visualDescription 时，逐项核对本镜口播中的**可见要素**是否已写入画面（人物关系、场景地点、关键道具、昼夜/氛围）；二者不得矛盾（例：口播夜渡而画面烈日营门）。
- **镜头丰富度**：遵守主产品「镜头丰富度」——间歇写对峙面、部属/人群或大环境局势；**禁止**本块内连续 3 条 visual 仅为「主角单人同级别近景/特写」且无他人轮廓或局势纵深。
- narration：个人「我」/ 群体「他们」；1～2 句；约 3～4 汉字/秒核对与 durationSec 匹配；**至少半数分镜**带实体信息。
- 单镜 durationSec 须在 **${d.perSceneMinSec}～${d.perSceneMaxSec}**。

只输出 JSON：\`{ "scenes": [ ... ] }\`，scenes 数组**恰好** ${chunkEnd - chunkStart + 1} 条，index 依次为 ${chunkStart}…${chunkEnd}。`;
}

/** 整稿口播 JSON 解析失败时追加到 user */
export function appendStoryboardVoiceoverRetryInstruction(
  user: string,
  parseErrorMessage: string,
  targetSceneCount: number,
): string {
  return `${user}\n\n【自动重试】${parseErrorMessage}\n请只输出合法 JSON：根对象仅含 **paragraphs** 数组，恰好 ${targetSceneCount} 条字符串（按镜序）。`;
}

/** 分块 JSON 解析失败时追加到 user，触发自动重试 */
export function appendStoryboardChunkRetryInstruction(
  chunkUser: string,
  parseErrorMessage: string,
  chunkStart: number,
  chunkEnd: number,
): string {
  const n = chunkEnd - chunkStart + 1;
  return `${chunkUser}\n\n【自动重试】${parseErrorMessage}\n请只输出 JSON：{ "scenes": [...] }，且 scenes 恰好 ${n} 条，index ${chunkStart}～${chunkEnd}。`;
}
