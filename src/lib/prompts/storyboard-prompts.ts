/**
 * Storyboard Prompts - L1 叙事方案 / L2 整稿口播 / L3 分镜扩写
 */

import {
  formatReviewChecklistForPrompt,
  formatStoryArcForPrompt,
} from "@/lib/storyboard-spine";
import type {
  ReviewChecklist,
  SceneSkeletonEntry,
  StoryArc,
  Tone,
  VideoDurationMin,
} from "@/lib/types";
import {
  getVideoDurationPreset,
  type VideoDurationPreset,
} from "@/lib/video-duration";

export type StoryboardPromptParams = {
  seriesTitle?: string;
  peakTitle?: string;
  peakDescription?: string;
  subject: string;
  dynasty?: string;
  tone: Tone;
  videoDurationMin?: VideoDurationMin;
};

/** 写入 L1～L3 提示的峰值选题正文：优先峰值说明，无说明时退回峰值标题 */
export function formatUserPeakTopicProposition(
  params: Pick<StoryboardPromptParams, "peakTitle" | "peakDescription">,
): string | null {
  const description = params.peakDescription?.trim();
  if (description) return description;
  const title = params.peakTitle?.trim();
  return title || null;
}

/** @deprecated 使用 formatUserPeakTopicProposition */
export const formatUserSliceProposition = formatUserPeakTopicProposition;

/** 极简 stakes 须在 index 1～返回值（含）内首次说清楚 */
export function stakeWindowEndInclusive(d: VideoDurationPreset): number {
  const mid = (d.minScenes + d.maxScenes) / 2;
  return Math.max(3, Math.min(8, Math.round(mid / 4)));
}

type StoryboardPromptStage = "spine" | "voiceover" | "expand";

function buildToneText(params: StoryboardPromptParams): string {
  return params.tone === "serious"
    ? "严肃科普：少用夸张梗，强调史料出处与限定语（如「学界认为」「史料记载」）。"
    : "叙事向：可适度悬念与反差，但仍需标注史料来源与不确定之处。";
}

/** L1 / L2：系列、切面、时长、主角（L3 勿用，改走 buildExpandContextPrefix） */
function buildNarrativePlanningLead(
  params: StoryboardPromptParams,
  stage: Extract<StoryboardPromptStage, "spine" | "voiceover">,
): { d: VideoDurationPreset; toneText: string; lead: string } {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const toneText = buildToneText(params);
  const hasTheme = Boolean(params.seriesTitle?.trim());
  const sliceProposition = formatUserPeakTopicProposition(params);
  const hasUserSlice = Boolean(sliceProposition);

  const themeBlock = hasTheme
    ? hasUserSlice
      ? `**人物向系列：**「${params.seriesTitle!.trim()}」\n须与本系列定位一致；同时存在下方「唯一切面」时，**${stage === "spine" ? "本方案" : "口播"}须优先落实该切面**，不得只写系列层面的泛泛介绍或人物小传。\n`
      : `**人物向系列：**「${params.seriesTitle!.trim()}」\n${stage === "spine" ? "叙事方案" : "口播"}须紧扣本系列定位；若尚未给定唯一切面，请在首个 milestone 或 peak 中点明本支视频唯一的具体切口。\n`
    : "";

  const sliceBlock = hasUserSlice
    ? `**唯一切面（必须落实）：**${sliceProposition}\n`
    : "";

  const sliceRuleFallback =
    stage === "spine" && !hasTheme && !hasUserSlice
      ? `未给定人物向系列且未给定唯一切面时：你必须**自拟一个清晰、单一的「切面命题」**（用一句话说清本视频只讲哪一个冲突、悖论或抉择），并在首个 milestone 或 peak.intent 中点明；禁止泛谈「一生」「生平」。\n`
      : "";

  const durationBlock = `**叙事目标时长（须与界面选择一致）**：${d.labelShort}。镜数与总秒数须满足本档位硬约束。\n\n`;

  const lead = `${themeBlock}${sliceBlock}${sliceRuleFallback}${durationBlock}主角/主题对象：${params.subject}
朝代/背景（可空）：${params.dynasty || "未指定"}
`;

  return { d, toneText, lead };
}

/** L3 分镜扩写：母稿与 storyArc 已在同条 user 中，仅保留场面扩写所需语境 */
export function buildExpandContextPrefix(
  params: StoryboardPromptParams,
): string {
  return `主角/主题对象：${params.subject}
朝代/背景（可空）：${params.dynasty || "未指定"}

**visualDescription（硬约束）**：写主体、动作、环境、景别/机位；与母稿 narration 声画实体对齐；勿镜镜只有主角大头贴；**勿**写画风/媒介/插画风格标签（文生图环节由系统注入）。

**narration**：以本块「口播母稿」为内容与事实依据，仅允许口语化与时长微调；**禁止**改事实、改人称或重写命题。
`;
}

/** L3 分镜扩写：本块镜头与时长（叙事弧由上方 storyArc + 母稿承担） */
export function buildExpandProductAndRequirements(
  _params: StoryboardPromptParams,
  chunkSceneCount: number,
): string {
  const d = getVideoDurationPreset(_params.videoDurationMin ?? 1);
  return `**本块硬约束**
- **镜头丰富度**：本块 **${chunkSceneCount}** 镜内 **禁止** 连续 3 条 visualDescription 仅为「主角单人同级别近景/特写」且无他人轮廓或局势纵深。
- narration 约 **3～4 汉字/秒**，与 durationSec 匹配。
- 单镜 durationSec：**${d.perSceneMinSec}～${d.perSceneMaxSec}**；与镜序表可微调但勿大幅偏离。`;
}

export function buildSpineContextPrefix(
  params: StoryboardPromptParams,
): string {
  const { toneText, lead } = buildNarrativePlanningLead(params, "spine");
  return `${lead}
**口吻：**${toneText}

**L1 只做叙事骨架**：storyArc（milestones + peak + closing）与 sceneSkeleton.beat；勿写完整口播或分镜画面字段。
**场面侧重（写入 beat 即可）：**可点「主角反应 / 对峙压力 / 部属或人群 / 环境局势」之一；勿写 visualDescription、narration 或 scenes。
`;
}

export function buildVoiceoverContextPrefix(
  params: StoryboardPromptParams,
): string {
  const { toneText, lead } = buildNarrativePlanningLead(params, "voiceover");
  return `${lead}
**人称（硬约束）**：主角为「${params.subject}」。**若为具体个人**：整稿口播各段（**paragraphs** 按镜序）必须以第一人称「我」自述；**禁止**用「他/她」或直呼全名作主语描写自身言行。**若为并称群体、阵营或集体对象**：以「**他们**」指称该群体（**不要用「我们」**）；**禁止**用单数「他」指代整个群体。

**口吻：**${toneText}

**语体**：须以**现代汉语白话**口述；避免文言、骈俪作主架。

**声画（本阶段）**：不输出画面描述；口播里写清场面实体，供后续分镜扩写对齐。
`;
}

export function buildVoiceoverProductAndRequirementsOnly(
  params: StoryboardPromptParams,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
  return `**产品核心（整稿口播，必须遵守）**
- 这是 **${d.labelShort}** 量级的历史短视频切片，不是传记片：禁止编年体、禁止从出生/家世到死亡/盖棺的流水账，禁止百科词条式罗列。**「不写生平编年史」≠ 可半截收场**：用户选定的**唯一切面**必须在口播叙事上**有头有尾**讲完。
- **极简前置 stakes（硬约束）**：从**首段**起至**第 ${stakeEnd} 镜（含）所对应的口播**为止，须让观众**第一次**弄清本切口「为何会要命/赌注在哪」。
- **唯一高峰**：全片只能有**一个**清晰的叙事/情绪顶峰；**已定 storyArc.peak** 已登记高峰——口播须在**对应连续镜群**写出最强戏剧瞬间。
- **峰终体验**：**倒数第二镜**对应口播须把切口**落槌回扣**；**最后一镜**对应口播余韵须回扣前文**那座唯一高峰**。
- **口播主干**：输出 **paragraphs** 字符串数组，恰好 **${targetSceneCount}** 条，**第 i 条**对应 **index=i** 的镜；顺读须连成一条故事线。

**整稿口播硬要求**
1. 叙事弧与骨架 index 1～${targetSceneCount} **顺序对齐**，不得打乱或遗漏某一镜的核心 beat。
2. **至少半数段落**除修辞外须含实体信息；数字与易夸大处须有依据或「史载」「一说」。`;
}

export type SceneSkeletonRow = SceneSkeletonEntry;

export function buildSpineSystemPrompt(
  videoDurationMin: VideoDurationMin,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  const stakeEnd = stakeWindowEndInclusive(d);
  const milestoneMin = Math.max(2, d.timelineMin - 1);
  return `你是 HistorAI 的**叙事方案（L1）**助手：只产出导演策划案（故事弧 + 镜序表 + 可选核对清单），不撰写完整口播或分镜画面。

【输出】
- 只输出**合法 JSON**，中文；不得 Markdown、代码围栏或非 JSON。
- **不写** visualDescription、narration、scenes。

【storyArc（主交付之一）】
- **milestones**：至少 **${milestoneMin}** 条推进节点；每条 **intent** 约 1～2 句白话；可选 **sceneRange**、**label**、**sources**（全弧 sources 合计至少 2 条）。
- **peak**：全片**唯一**高峰；**label** 须含「高潮」「顶点」「翻盘」「一搏」「定局」「一绝」或其同义语之一；**intent** 写清顶峰戏剧瞬间。
- **closing**：收束方向一句，须回扣 peak 命题（峰终）。
- 前置 **${stakeEnd} 镜（含）** 内 sceneSkeleton.beat 链须能看出极简 stakes。

【sceneSkeleton（主交付之二）】
- 恰好 **${targetSceneCount}** 条；**index**、**beat**（场记体要点 20～60 字，勿写完整口播）、**durationSec**。

【reviewChecklist（附件，简短）】
- **factsToVerify**：最多 5 条；**publishCautions**：敏感口径一句或 null。

【人称与语体】
- milestones、peak、closing、各 **beat** 均现代汉语白话；个人向策划可用「我」、群体用「他们」。`;
}

export function buildSpineUserPrompt(
  params: StoryboardPromptParams,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
  const spineLead = buildSpineContextPrefix(params);
  const milestoneMin = Math.max(2, d.timelineMin - 1);
  const spineBody = `你必须只输出合法 JSON（不要 Markdown，不要代码围栏）。结构如下：
{
  "storyArc": {
    "milestones": [
      { "label": "铺垫", "intent": "白话节点意图", "sceneRange": "1-2", "sources": ["《xx》或学者观点"] }
    ],
    "peak": { "label": "翻盘高潮", "intent": "全片唯一顶峰", "sceneRange": "6-7", "sources": ["史料简述"] },
    "closing": "收束回扣高峰的一句方向"
  },
  "sceneSkeleton": [
    { "index": 1, "beat": "场记体：本镜动作/信息/场面侧重", "durationSec": ${d.perSceneCenterSec} }
  ],
  "reviewChecklist": {
    "factsToVerify": ["最多 5 条"],
    "publishCautions": null
  }
}

**叙事方案硬约束**
1. **sceneSkeleton 恰好 ${targetSceneCount} 条**；index 1～${targetSceneCount} 连续。
2. 每条 **durationSec** 在 **${d.perSceneMinSec}～${d.perSceneMaxSec}**；全片之和尽量落在 **${d.minTotalSec}～${d.maxTotalSec}**。
3. **beat** 为场记要点；前 **${stakeEnd}** 镜 beat 链须体现极简 stakes。
4. **storyArc.milestones** 至少 **${milestoneMin} 条**；**peak.label** 须含高峰关键词；sources 合计至少 2 条。
5. **禁止** scenes、visualDescription、narration。

请开始：输出 JSON。`;

  return `${spineLead}\n\n${spineBody}`;
}

export function buildVoiceoverSystemPrompt(
  videoDurationMin: VideoDurationMin,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  return `你是 HistorAI 的**整稿口播撰稿**助手：在已定叙事方案（sceneSkeleton + storyArc）之上，写出**成片可顺读的唯一口播主干**（paragraphs 数组）。你只输出合法 JSON，中文。**不写** visualDescription；**不写** scenes。

- 只输出 **paragraphs**：恰好 **${targetSceneCount}** 个字符串，顺序即镜序。
- 第 i 段落实 index=i 的 beat 与 durationSec；约 **3～4 汉字/秒**。
- 不得与 reviewChecklist.factsToVerify 冲突；叙事目标 **${d.labelShort}**。`;
}

export function buildVoiceoverUserPrompt(
  params: StoryboardPromptParams,
  targetSceneCount: number,
  skeletonTable: string,
  storyArc: StoryArc,
  reviewChecklist: ReviewChecklist,
): string {
  const prefix = buildVoiceoverContextPrefix(params);
  const product = buildVoiceoverProductAndRequirementsOnly(
    params,
    targetSceneCount,
  );

  return `${prefix}

${product}

**已定叙事方案 · 故事弧（须全文落实，勿改写结构）**
${formatStoryArcForPrompt(storyArc)}

**发布前核对（口播不得违反）**
${formatReviewChecklistForPrompt(reviewChecklist)}

**已定镜序表（镜数与节拍，不可增删镜）**
${skeletonTable}

请只输出合法 JSON：根对象**仅含** **paragraphs**（字符串数组），恰好 **${targetSceneCount}** 条，按镜序。`;
}

export function buildChunkSystemPrompt(): string {
  return `你是 HistorAI 的**分镜扩写（L3）**助手：只输出合法 JSON，中文。根对象仅含 **scenes** 数组，条数须与用户指定区间**完全一致**，index 连续。每条含 index、visualDescription、narration、durationSec。

依据用户提供的 **storyArc**、镜序 **beat** 与锁定的口播母稿扩写；勿改写叙事弧或重定切面。`;
}

export function buildChunkUserPrompt(args: {
  params: StoryboardPromptParams;
  chunkStart: number;
  chunkEnd: number;
  storyArc: StoryArc;
  reviewChecklist: ReviewChecklist;
  skeletonRows: SceneSkeletonRow[];
  lockedParagraphs: string[];
  previousLastNarration: string | null;
  nextChunkFirstBeat: string | null;
}): string {
  const { params, chunkStart, chunkEnd, storyArc, reviewChecklist } = args;
  const chunkCount = chunkEnd - chunkStart + 1;
  const prefix = buildExpandContextPrefix(params);
  const product = buildExpandProductAndRequirements(params, chunkCount);
  const arcJson = formatStoryArcForPrompt(storyArc);
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
      `**上一块最后一镜口播（须自然承接）：**\n${args.previousLastNarration.trim()}\n`
    : `**本块含全片首镜**：首条 narration 须落实 index=1 的 beat 与 storyArc 前段里程碑意图，勿另起无关切面。\n`;

  const next =
    args.nextChunkFirstBeat?.trim() ?
      `**下一块首镜 beat（勿剧透，仅作连贯参考）：**\n${args.nextChunkFirstBeat.trim()}\n`
    : "**本块含全片收尾镜**：最后两条须落实「落槌 + 余韵」。\n";

  return `${prefix}

${product}

**扩写区间**：仅生成 **index ${chunkStart}～${chunkEnd}（含）** 的 scenes，**恰好 ${chunkCount} 条**。

**叙事方案 · storyArc（不得改写）**
${arcJson}

**发布前核对**
${formatReviewChecklistForPrompt(reviewChecklist)}

**本块镜序表**
${skTable}

**本块口播母稿**
${paraLines || "（内部错误：母稿与骨架条数不一致）"}

${prev}
${next}

只输出 JSON：\`{ "scenes": [ ... ] }\`，index 依次为 ${chunkStart}…${chunkEnd}。`;
}

export function appendStoryboardVoiceoverRetryInstruction(
  user: string,
  parseErrorMessage: string,
  targetSceneCount: number,
): string {
  return `${user}\n\n【自动重试】${parseErrorMessage}\n请只输出合法 JSON：根对象仅含 **paragraphs** 数组，恰好 ${targetSceneCount} 条字符串（按镜序）。`;
}

export function appendStoryboardChunkRetryInstruction(
  chunkUser: string,
  parseErrorMessage: string,
  chunkStart: number,
  chunkEnd: number,
): string {
  const n = chunkEnd - chunkStart + 1;
  return `${chunkUser}\n\n【自动重试】${parseErrorMessage}\n请只输出 JSON：{ "scenes": [...] }，且 scenes 恰好 ${n} 条，index ${chunkStart}～${chunkEnd}。`;
}
