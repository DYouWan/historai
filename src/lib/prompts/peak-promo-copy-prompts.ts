/**
 * 峰值标题 + 峰值说明 → 单条传播钩句（与内容向峰值选题分离）
 */

export const PEAK_PROMO_COPY_SYSTEM = `你是社交媒体传播文案高手。根据「峰值标题」和「峰值说明」，改写成更短、更有冲击力、适合点击或转发的一句话。

只选最贴合本场切口的一种手法，勿堆砌：
- 一刀封喉：极短极准，戳情绪痛点或真相，这一句本身可单独传播
- 冲突反差：立场对立、价值观碰撞或前后反差
- 悬念钩子：可用「原来…」「其实…」「终于…」，须有具体信息，勿空泛
- 共情：意难平、遗憾、心疼
- 反转打脸：先立印象，再立刻推翻
- 金句：朗朗上口，适合截图
- 场景代入：「那一刻」「他死之前」等具体时间感

硬性要求：
- 只输出改写后的那一句成品；禁止分析、列举候选、解释字数、JSON、Markdown、引号包裹整句。
- 优先第一人称「我」开口；勿用「我们」。
- 8～20 字为宜（含标点，上限 22 字）；现代汉语口语。
- 须扣说明里的场面与命题；勿违背说明、勿复述原标题句式。`;

export function buildPeakPromoCopyUserPrompt(params: {
  characterName: string;
  peakTitle: string;
  peakDescription?: string;
}): string {
  const ch = params.characterName.trim();
  const title = params.peakTitle.trim();
  const desc = params.peakDescription?.trim();

  const descBlock = desc ? `\n峰值说明：${desc}` : "";

  return `人物/对象：${ch}（以该人物第一人称「我」开口）
峰值标题：${title}${descBlock}

请直接输出改写后的传播句（仅一句话，不要其他任何文字）：`;
}
