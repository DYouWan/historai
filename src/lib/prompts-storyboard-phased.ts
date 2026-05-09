import {
  buildStoryboardContextPrefix,
  stakeWindowEndInclusive,
  type StoryboardPromptParams,
} from "@/lib/prompts";
import type { TimelineBeat, VideoDurationMin } from "@/lib/types";
import {
  getVideoDurationPreset,
  type VideoDurationPreset,
} from "@/lib/video-duration";

export type SceneSkeletonRow = {
  index: number;
  beat: string;
  durationSec: number;
};

export function buildSpineSystemPrompt(
  videoDurationMin: VideoDurationMin,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(videoDurationMin);
  const stakeEnd = stakeWindowEndInclusive(d);
  return `你是 HistorAI 的**分镜脊柱规划**助手（第一阶段）。你只输出**合法 JSON**，中文。**不写**逐镜的 visualDescription 与 narration；改为输出 **sceneSkeleton**：恰好 **${targetSceneCount}** 条，每条含 index、beat（本镜叙事要点，20～60 字）、durationSec。**hook** 与 **timeline**、**factNotes**、**complianceNote** 须与主产品规则一致；**timeline 须包含一段高峰 label（含「高潮」「顶点」「翻盘」「一搏」「定局」「一绝」或其同义语之一）**；前置 **${stakeEnd} 镜**内 beat 链条须能看出**极简 stakes** 被落实。成片目标 **${d.labelShort}**，全片须规划 **${d.minScenes}～${d.maxScenes}** 镜；你输出的 sceneSkeleton 条数必须**恰好等于 ${targetSceneCount}**（用于后续自动分块扩写）。不确定史实须标注不确定性。人称：个人「我」，群体「他们」。末段 beats 指向**峰终回扣**（回扣唯一高峰命题）。`;
}

export function buildSpineUserPrompt(
  params: StoryboardPromptParams,
  targetSceneCount: number,
): string {
  const d = getVideoDurationPreset(params.videoDurationMin ?? 1);
  const stakeEnd = stakeWindowEndInclusive(d);
  const prefix = buildStoryboardContextPrefix(params);

  const spineSchema = `你必须只输出合法 JSON（不要 Markdown，不要代码围栏）。结构如下：
{
  "hook": "黄金数秒开场，个人「我」或群体「他们」，强悬念，指向唯一切面；极简 stakes 至迟在第 ${stakeEnd} 镜前由 beat 链体现",
  "timeline": [
    { "label": "节点", "text": "与 hook 人称一致；可嵌史据", "sources": ["《xx》或学者观点"] }
  ],
  "sceneSkeleton": [
    { "index": 1, "beat": "本镜要发生的动作/信息/情绪，供下一阶段扩写口播与画面", "durationSec": ${d.perSceneCenterSec} }
  ],
  "factNotes": ["最多 5 条复核提示"],
  "complianceNote": null
}

**脊柱阶段硬约束**
1. **sceneSkeleton 必须恰好 ${targetSceneCount} 条**；index 须为 1～${targetSceneCount} 连续整数，不得缺号或重复。
2. 每条 **durationSec** 须在 **${d.perSceneMinSec}～${d.perSceneMaxSec}**；全片 durationSec 之和须落在 **${d.minTotalSec}～${d.maxTotalSec}**（若略有偏差，后续扩写阶段会微调单镜时长，此处尽量接近）。
3. **beat** 为扩写蓝图：须让读者能预见口播将包含的**实体信息**（时间、地点、数字、动作等择一），勿写空泛形容词堆砌；**不要**在此阶段写完整口播长句。
4. timeline 共 **${d.timelineMin}～${d.timelineMax}** 段，每段至少 1 条 sources；**其中一段 label 必须含高峰关键词**（与主产品「唯一高峰」一致）。
5. **禁止输出 scenes 字段**；禁止输出 visualDescription / narration。

${prefix}

请开始：输出 JSON，sceneSkeleton 恰好 **${targetSceneCount}** 条。`;
  return spineSchema;
}

export function buildChunkSystemPrompt(): string {
  return `你是 HistorAI 的**分镜扩写**助手（第二阶段）。你只输出合法 JSON，中文。输出根对象仅含 **scenes** 数组，且条数必须与用户指定的区间**完全一致**，index 连续。每条含 index、visualDescription（须带统一画风关键词前缀）、narration（口播，人称与脊柱一致）、durationSec。同一 index 下 **visualDescription 与 narration 必须声画实体对齐**：口播里观众能「看见」的（主要人物站位、环境场所、关键手持物、昼夜与天气氛围、人群/敌军是否入画等）须在画面描述中落实；若口播点名具体数字、器物或地点，画面不得画成明显相反或无关场景（不确定处用保守构图，勿编造与 factNotes 冲突的细节）。须与给定 timeline、sceneSkeleton 及前后衔接要求严格对齐；不得编造与 factNotes 矛盾的夸大数字。覆盖**叙事高峰镜群**时须在事实信息与时长允许下压实势能顶点；若为全片收尾块，严格遵守主产品的**落槌 + 回扣高峰的余韵**。`;
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

**本块 sceneSkeleton（必须逐条落实为口播+画面）**
${skTable}

**factNotes（扩写时不得违反）**
${JSON.stringify(factNotes, null, 2)}

${prev}
${next}

**画面与口播硬约束**
- 每镜 visualDescription 开头须含画风关键词：**${params.stylePreset}**（可与主提示「统一画风关键词」同字）。
- **每镜成对自检**：写完 narration 后补写 visualDescription 时，逐项核对本镜口播中的**可见要素**是否已写入画面（人物关系、场景地点、关键道具、昼夜/氛围）；二者不得矛盾（例：口播夜渡而画面烈日营门）。
- narration：个人「我」/ 群体「他们」；1～2 句；约 3～4 汉字/秒核对与 durationSec 匹配；**至少半数分镜**带实体信息。
- 单镜 durationSec 须在 **${d.perSceneMinSec}～${d.perSceneMaxSec}**。

只输出 JSON：\`{ "scenes": [ ... ] }\`，scenes 数组**恰好** ${chunkEnd - chunkStart + 1} 条，index 依次为 ${chunkStart}…${chunkEnd}。`;
}
