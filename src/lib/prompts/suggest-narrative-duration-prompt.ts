import type { VideoDurationMin } from "@/lib/types";

/** 与界面下拉一致的合法档位 */
export const ALLOWED_NARRATIVE_DURATION_MIN: readonly VideoDurationMin[] = [
  1, 3, 5, 8, 10, 12, 15,
];

export const SUGGEST_NARRATIVE_DURATION_SYSTEM = `你是 HistorAI 的短视频「叙事体量」顾问，只做一件事：根据用户给的系列语境、主角与**单一峰值切片**命题，估计合适的**成片目标时长档位**（分钟量级）。

【输出】
- 只输出合法 JSON 对象，禁止 Markdown、代码围栏或其它文字。
- 字段：
  - videoDurationMin：数字，必须是下列之一：1、3、5、8、10、12、15（与创作中心「叙事时长」下拉一致）。
  - rationale：字符串，**一句中文**（≤80字），说明为何该档位能包住切口的信息密度与展开空间（勿复述用户全文）。

【档位直觉（供你内部权衡，勿照抄输出）】
- 1：单一高光瞬间 / 强钩子短片，几乎无长跨度铺陈。
- 3：一个小型完整弧（起承转合紧凑），史料锚点中等。
- 5：多节点递进或一组张力关系需要铺开。
- 8～10：层次多、对照多或时间跨度大但仍守一条主线。
- 12：介于 10 与 15 分钟档之间，主线略厚、仍不宜硬拉到满档。
- 15：仅在切口明显「可撑长编」、多幕结构与反复回扣仍不会灌水时使用；若切口其实很窄，宁可降到 3 或 5。

【原则】
- **切口优先**：切片标题 + 切片说明里承诺讲清楚的范围，必须能被该档位下的镜数与时间约束合理覆盖（勿严重低估导致骨架段数不够，勿严重高估导致空泛）。
- 若信息稀薄却选了过长档位，应倾向更短。
- 不得编造与用户切口无关的史实细节来 justify。`;

export function buildSuggestNarrativeDurationUserPrompt(opts: {
  seriesTitle: string;
  subject: string;
  sliceTitle: string;
  sliceAngle: string;
  dynasty?: string;
}): string {
  const lines: string[] = [];
  lines.push(`人物向系列名称：${opts.seriesTitle.trim()}`);
  lines.push(`主角 / 对象：${opts.subject.trim()}`);
  if (opts.dynasty?.trim()) {
    lines.push(`朝代 / 背景（可选）：${opts.dynasty.trim()}`);
  }
  lines.push("---");
  lines.push(`切片标题：${opts.sliceTitle.trim()}`);
  lines.push(`切片说明（命题）：${opts.sliceAngle.trim()}`);
  lines.push("---");
  lines.push(
    "请估计最合适的 videoDurationMin（仅能为 1、3、5、8、10、12、15 之一），并给出 rationale 一句。",
  );
  return lines.join("\n");
}

/** 将模型输出的数字吸附到合法档位（异常时默认 3） */
export function snapVideoDurationMin(raw: unknown): VideoDurationMin {
  const n = Number(raw);
  const allowed = ALLOWED_NARRATIVE_DURATION_MIN as readonly number[];
  if (allowed.includes(n)) return n as VideoDurationMin;
  let best = 3 as VideoDurationMin;
  let bestDist = Infinity;
  for (const v of allowed) {
    const d = Math.abs(v - n);
    if (d < bestDist) {
      bestDist = d;
      best = v as VideoDurationMin;
    }
  }
  return best;
}
