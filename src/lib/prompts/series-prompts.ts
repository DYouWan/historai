/**
 * Series Prompts - 系列名相关提示词配置（预设选项等）
 *
 * 预设选题逻辑（非关键词堆砌）：
 * 历史人物短视频的流量，多半来自现代人可迁移的情绪——
 * 爽（翻盘/封神）、虐与韧（至暗/末路）、吃瓜（认知反转/史评污名）、
 * 焦虑（阶层/上位/站队/被忌）、女性（名分/工具化/自主）、意难平（落差）。
 * 每条系列对应一种「观众来意」，切口仍须单点高峰，禁止生平年表。
 */

const THEME_DEFINITIONS: readonly {
  readonly title: string;
  readonly axisHint: string;
}[] = [
  {
    title: "原来他不是这样的人",
    axisHint:
      "题眼：民间印象、演义与常见史料之间的反差瞬间；可写误读如何定型，或当事人被「揭穿/反揭穿」；勿写成科普辟谣长文。",
  },
  {
    title: "逆风局：这一步扳不扳得回来",
    axisHint:
      "题眼：明显劣势下的翻盘、反杀或失手；只钉关键一手，勿堆败绩史。",
  },
  {
    title: "至暗时刻：还能守住什么",
    axisHint:
      "题眼：囚禁、贬谪、孤立、灭门余波或身心极限中的抉择与韧性；写困境与代价，不卖血腥虐杀。",
  },
  {
    title: "封神一刻：能力被看见",
    axisHint:
      "题眼：战功、机锋、决断或才华的峰值瞬间（佩服/爽感）；须可画面化，勿空喊「厉害」。",
  },
  {
    title: "寒门入局：谁把他抬上桌",
    axisHint:
      "题眼：出身、门第与实权之间的裂缝——被看见、被提拔或被打压的关键一刻；勿励志流水账。",
  },
  {
    title: "进中枢：上位的那一刀",
    axisHint:
      "题眼：册立、拜相、夺权、入阁或站队成功/失败的关键一跃；写清 stakes 与反噬，勿写仕途年表。",
  },
  {
    title: "功高之后：位子烫不烫",
    axisHint:
      "题眼：功业顶峰与君主猜忌、裁抑、承诺破裂的当场张力；朝堂博弈义，勿猎奇。",
  },
  {
    title: "站队赌命：选错就完了",
    axisHint:
      "题眼：结盟、倒戈、告密或押注阵营的当场风险与后世标签；勿口号洗白或辱骂。",
  },
  {
    title: "她不想只活在标签里",
    axisHint:
      "题眼：女性历史人物在名分、婚姻、联盟、污名或工具化处境中破局、反杀或自主的一刻；尊重史实，勿现代口号。",
  },
  {
    title: "一句把局说死了",
    axisHint:
      "题眼：一言、一谏、一策撬动信任、立场或局势；钉死当场后果。",
  },
  {
    title: "巅峰之后：落差与意难平",
    axisHint:
      "题眼：由盛转衰、被罢黜、失势或舆论反噬的峰值；写落差与选择，勿单调卖惨。",
  },
  {
    title: "末路还能怎么选",
    axisHint:
      "题眼：亡国、围城、最后一搏或体面收场中的抉择；写结构性困局，勿洗白或甩锅口号。",
  },
  {
    title: "史书上的小人物",
    axisHint:
      "题眼：身份不高者的举动、传递或偶然如何改变走向；突出「这一下改变了什么」。",
  },
];

/**
 * 人物向系列名称下拉预设（与 axisHint 一一对应）。
 */
export const THEME_TITLE_PRESETS: readonly string[] = THEME_DEFINITIONS.map(
  (d) => d.title,
);

/**
 * 内置预设时返回供 LLM 使用的「系列轴线」短说明；自拟系列名则返回 undefined。
 */
export function themeAxisHintForSeries(seriesTitle: string): string | undefined {
  const t = seriesTitle.trim();
  const row = THEME_DEFINITIONS.find((d) => d.title === t);
  return row?.axisHint;
}
