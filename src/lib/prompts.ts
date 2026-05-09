import type { Tone, VideoDurationMin } from "@/lib/types";
import {
  getVideoDurationPreset,
  type VideoDurationPreset,
} from "@/lib/video-duration";

/** 极简 stakes 须在 index 1～返回值（含）内首次说清楚（与脊柱/分块扩写共用） */
export function stakeWindowEndInclusive(d: VideoDurationPreset): number {
  const mid = (d.minScenes + d.maxScenes) / 2;
  return Math.max(3, Math.min(8, Math.round(mid / 4)));
}

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

function buildSchemaHint(d: VideoDurationPreset): string {
  const stakeEnd = stakeWindowEndInclusive(d);
  return `你必须只输出合法 JSON（不要 Markdown，不要代码围栏）。**scenes 数组须含 ${d.minScenes}～${d.maxScenes} 条**，并满足「分镜节奏」与「总时长」硬约束（见下方产品核心）；单镜 durationSec 常见 ${d.perScenePreferredLabel}。结构如下：
{
  "hook": "黄金数秒抓耳：个人主角用第一人称「我」；群体用「他们」开场（不用「我们」代指该群体）。强反差/强悬念，指向唯一切面。**极简 stakes**：至迟在**第 ${stakeEnd} 镜（含）前**的口播链中，须让观众明白「此刻险在何处或赢面何在、这一下为何关键」；hook 可只负责钩子，stakes 由第 2～${stakeEnd} 镜与 hook 一脉相承补足，禁止拖到中段才首次交代。",
  "timeline": [
    { "label": "可选情绪或结构节点（如：铺垫反差）", "text": "与 hook、口播人称一致：个人用「我」自述，群体用「他们」指称；可嵌套史据引句；禁止与个人线混用全知列传腔", "sources": ["《xx》或学者观点简述"] }
  ],
  "scenes": [
    {
      "index": 1,
      "visualDescription": "给画面生成模型用的中文画面描述，含时代/服饰/场景关键词；须与本镜 narration 声画实体对齐（场所、人物站位、关键道具、昼夜氛围等口播可见信息不可矛盾）",
      "narration": "本镜口播为**成片唯一可听主干**的一段：顺读须**不依赖 timeline 也能讲满本切片**；与同段 timeline 信息对应展开，勿只在 timeline 写全、口播只剩金句；与前、后镜顺读成链；1～2 句；个人「我」、群体「他们」；字数与 durationSec 匹配",
      "durationSec": ${d.perSceneCenterSec}
    }
  ],
  "factNotes": ["需要人工核对的重要史实提示"],
  "complianceNote": "若有敏感或争议点，给出口径提醒，否则写 null"
}`;
}

function buildStoryboardPromptParts(params: StoryboardPromptParams): {
  d: VideoDurationPreset;
  contextPrefix: string;
  productAndRequirements: string;
} {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
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

  const durationBlock = `**成片目标时长（须与界面选择一致）**：${d.labelShort}。须严格满足下方「分镜节奏」中的**镜数区间**与 **总秒数区间**。\n\n`;

  const contextPrefix = `${themeBlock}${sliceBlock}${sliceRuleFallback}${durationBlock}主角/主题对象：${params.subject}
朝代/背景（可空）：${params.dynasty || "未指定"}

**人称（硬约束）**：主角为「${params.subject}」。**若为具体个人**：**hook**、**timeline[].text**、**scenes[].narration**（或后续扩写阶段的口播）必须以第一人称「我」自述，用「我记得」「当日我」「史书里写我那件事……」等与史料衔接；**禁止**用「他/她」或直呼全名作主语描写自身言行。**若为并称群体、阵营或集体对象**：全流程以「**他们**」指称该群体作主语（**不要用「我们」**代指同一群体），口播仍须完整可念；**禁止**用单数「他」指代整个群体。引他人评价、摘史书时可短暂出现专名。若切片标题/切口已用「我」而主体实为个人，须与「我」线严格一致。

统一画风关键词（写入每镜的 visualDescription 前缀保持风格）：${params.stylePreset}

口吻：${toneText}
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
- **分镜节奏（硬约束）**：不得在 timeline 写得极细却只给很少的镜。**总镜数须 ${d.minScenes}～${d.maxScenes}**，**不得少于 ${d.minScenes}** 镜。**从第 2 镜起到倒数第 3 镜**为展开区，其中须安排**至少连续 ${d.midStreakMin} 镜**递进矛盾、史实细节或反差，不得以一两镜带过核心过程。**收尾至少 2 镜**：倒数第二镜须把切口「落槌」；最后一镜余韵或留白。**总时长**：所有 \`scenes[].durationSec\` **相加须在 ${d.minTotalSec}～${d.maxTotalSec}**；单镜时长首选 **${d.perScenePreferredLabel} 秒**，极短独白才可 **${d.perSceneMinSec} 秒**，**避免**大量使用 **${d.shortSceneWarnBelow} 秒**糊弄；若加总明显低于 **${d.softMinTotalSec} 秒**，视为不达标须重新分配镜数与时长。

要求：
1. timeline 共 **${d.timelineMin}～${d.timelineMax}** 段；每段给出至少 1 条 sources（书名/章节/学者观点均可，勿编造页码）。整体覆盖：**前置窗口内或与 hook 接续的极简 stakes** → **向唯一高峰递进** → **顶峰爆发或认知瞬时反转** → **落槌回顾与余韵**，且 **其中必须有一段** timeline 对应上文「高峰 label」硬性要求。
2. scenes 与 timeline **同弧对齐**：每一段 timeline 的实质信息（人物动作、文献一句、反差落点等）须在对应镜群的口播中有展开或呼应，避免「timeline 已写透、口播像旁白提要」。总镜数 **${d.minScenes}～${d.maxScenes}**（须满足上文「中段连续递进镜数、末尾至少 2 镜」）；每镜 durationSec **以 ${d.perSceneCenterSec} 秒为居中参考**，按口播字数在 **${d.perSceneRangeLabel}** 间微调；**全片 durationSec 之和须在 ${d.minTotalSec}～${d.maxTotalSec}**；每镜 visualDescription 里重复画风关键词；**每镜 visualDescription 与本镜 narration 须声画一致**（口播中的可见场景、人物关系、关键器物、昼夜与氛围须在画面描述中有对应，禁止明显相悖）；镜序只服务同一切面。
3. **每镜 narration（硬约束）**：在已定人称前提下（个人主角用「我」，群体主角用「他们」），使用可读口播句式（陈述句为主）；单镜允许 1～2 句，**并尽量让下一镜首句自然承接上一镜**。**按约 3～4 汉字/秒的口播语速**核对：narration 与 \`durationSec\` 匹配。**悬念、隐喻仅作点缀**；**至少半数分镜**除修辞外还须带**实体信息**（时间、数字、具体动作、地名/身份、直接后果择一）。数字与易夸大处须有依据或「史载」「一说」限定（与 factNotes 一致）。
4. factNotes 列出最值得发布前复核的结论（最多 5 条）。
5. complianceNote：若涉及民族/宗教/疆界等高风险表述，给出口径提示；否则为 null。`;

  return { d, contextPrefix, productAndRequirements };
}

/** 人物向系列与人物、人称、画风、口吻等共用前缀（分块脊柱与扩写阶段复用） */
export function buildStoryboardContextPrefix(
  params: StoryboardPromptParams,
): string {
  return buildStoryboardPromptParts(params).contextPrefix;
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
  return `你是 HistorAI 的历史短视频脚本与分镜助手：帮用户讲透**一个**有传播力的「切面」（单一钩子与冲突线）。**峰值叙事**：**前 ${stakeEnd} 镜（含）**内必须把**极简 stakes** 讲清楚；全片只允许**一处**明明白白的高峰（timeline label 明示）；收尾须**回扣**那座高峰以满足峰终。**绝不写人物生平编年史**（禁止求全传、一生流水账），**但当前选定的这一条切片必须有头有尾讲完**：自成完整微型故事弧（起→承→转/高点→合/收束），不得因「非编年」而虎头蛇尾。你只输出 JSON，内容为中文。对不确定的史实要明确写出不确定性，不得把演义当成正史。**人称**：个人用「我」，群体用「他们」。**分镜 ${d.minScenes}～${d.maxScenes}**、成片目标 **${d.labelShort}**（总时长须落在产品约束的秒数区间内）。**所有 scenes 的 narration 连读须自足讲完本切片**（勿把完整故事只写在 timeline、口播留空壳）。顺读须连成故事线，有因果或时间承接；末段须有直白落槌再加回扣高峰的余韵，勿连堆隐喻断尾。**narration** 与每镜时长字数匹配。`;
}

export function buildUserPrompt(params: StoryboardPromptParams): string {
  const { d, contextPrefix, productAndRequirements } =
    buildStoryboardPromptParts(params);
  return `${contextPrefix}

${productAndRequirements}

${buildSchemaHint(d)}`;
}
