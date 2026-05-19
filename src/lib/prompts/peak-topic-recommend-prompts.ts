/**
 * 峰值选题推荐 — peakTitle / peakDescription（内容向，非传播钩）
 */

import { themeAxisHintForSeries } from "@/lib/prompts/series-prompts";

/** 内置系列的 peakTitle 附加约束（写入 user prompt） */
export function peakTopicSeriesUserAddon(seriesTitle: string): string {
  const t = seriesTitle.trim();
  if (t === "原来他不是这样的人") {
    return `
【本系列 · 选题附加】紧扣「民间印象 vs 史料/当事人」的认知反差瞬间，勿写成科普辟谣长文或生平综述。`;
  }
  if (t === "逆风局：这一步扳不扳得回来") {
    return `
【本系列 · 选题附加】须点出劣势下的关键一手（翻盘或失手），勿堆败绩年表。`;
  }
  if (t === "至暗时刻：还能守住什么") {
    return `
【本系列 · 选题附加】须点出困境中的守住/放弃，勿卖血腥虐杀、勿流水账。`;
  }
  if (t === "封神一刻：能力被看见") {
    return `
【本系列 · 选题附加】须点出能力被看见的峰值瞬间，勿空喊「厉害」。`;
  }
  const axis = themeAxisHintForSeries(t);
  if (axis?.trim()) {
    return `
【本系列 · 选题附加】≥3 条须直白扣住系列轴线（见上【本系列轴线】），勿万能泛化切口。`;
  }
  return "";
}
