/**
 * User Templates - User Prompt 模板（动态参数部分）
 */

import { randomUUID } from "node:crypto";

/**
 * AI 生成系列名 - User Prompt 模板
 */
export function buildSeriesNameUserPrompt(hint?: string): string {
  const nonce = randomUUID();
  const lines: string[] = [];
  const h = hint?.trim();
  if (h) {
    lines.push(`用户方向（须尽量贴合，但不违背峰值叙事定位）：「${h}」`);
  }
  lines.push(
    `请求令牌：${nonce}`,
    "同一接口可能连续调用：请根据令牌产出一条新的系列名称，轮换切入点。",
    "",
    '只输出 JSON：{"suggestion":"…"}',
    "注意：只写正题一句，字段内不要出现冒号，不要用顿号串联多个人名。",
  );
  return lines.join("\n");
}

/**
 * 推荐人物 - User Prompt 模板
 */
export function buildCharacterRecommendUserPrompt(seriesTitle: string): string {
  const theme = seriesTitle.trim();
  const lines = [
    `人物向系列名称：「${theme}」`,
    "---",
    "请列出 **8～12** 个**互不重复**的条目，服务于**人物高光**单支切片选题。",
    "",
    "【人选主体】",
    "- **全部为具体历史人物个人**（人名或史书通行称谓）：每人须有可查的**个人向高光瞬间**，适于单支讲完（沙场对决、君臣摊牌、临危一言、翻盘、争议标签、绝境抉择等）。",
    "- **禁止任何群体/组织/军队类条目**：勿输出并称群体、集团、派系、军队名号、兵种统称（例如「大顺文官集团」「关宁铁骑」等均不允许）；若题材涉及某势力，请改为该势力中**最具戏剧性的具体人物**。",
    "- 禁止单独「朝代」「思潮」「古人」「帝王」等品类词充当一条候选。",
    "",
    "【峰值叙事选人（路线图 ③）】",
    "- 每条须有明确戏剧张力，勿堆砌泛泛名人；勿混入集体称谓。",
    "- **避免**：只适合百科式从出生讲到死的对象扎堆。",
    "",
    "【称谓格式（界面 chips 用）】",
    "- 每项 **2～5 字为宜**：优先**姓名**（如「朱由检」「吴三桂」「史可法」）。",
    "- **不要**头衔缀全名：禁止「崇祯帝朱由检」「南明弘光帝朱由崧」这类写法；皇帝用**姓名**即可，或与大众认知一致的**单一**年号/庙号简称（择一，勿拼接）。",
    "",
    "只输出 JSON，结构如下：",
    '{"characters":["曹操","荀彧","…"]}',
  ];
  return lines.join("\n");
}

/**
 * 推荐切片标题 - User Prompt 模板
 */
export function buildSliceRecommendUserPrompt(
  seriesTitle: string,
  characterName: string,
): string {
  const theme = seriesTitle.trim();
  const ch = characterName.trim();
  return `人物向系列名称：「${theme}」
核心人物/对象：「${ch}」
---
请生成 **6～8** 条互不相同的**峰值切片**方案（单点高峰、零生平汇总），只输出 JSON，结构严格为：
{"suggestions":[{"title":"…","angle":"…"}]}

对每条的要求：
- title：**短而利**，适合当传播标题或封面主打；须点题本系列与该对象，且让人一眼看出「这支只讲哪一下」。**个人**须含「我」；**群体**须以「他们」作主语，**禁用「我们」**。问句或数字钩子见本条列表末尾的统一要求。
- angle：**连贯 1～3 句**，个人「我」/ 群体「他们」；写明**这一关的冲突或巅峰场面**，并隐含或点出 **stakes（为何重要、输得起吗）**的一笔带过；**禁止**否定式清单与「不讲什么」申明白；每条**只一个焦点**。
- **彼此拉开**：条目勿同质；可覆盖对战、单挑抉择、一语改局、争议标签、绝境反击等不同峰值类型（仍须与系列、人物史实可能相关）。
- 数字：**勿杜撰**具体到个位的「史实」；可用「史称」「一说」「约」等。
- 整条列表中：**不少于 4 条** title 应使用「…？」或与史料分寸相符的**数字/数量对比**（兵力、昼夜、两方规模等其一），以满足传播试错；做不到的条目用强悬念对撞补足。`;
}
