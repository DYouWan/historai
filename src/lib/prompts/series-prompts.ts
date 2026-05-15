/**
 * Series Prompts - 系列名相关提示词配置（预设选项等）
 */

/**
 * 内置预设：标题 + 传给模型的「系列轴线」说明（核心卖点 / 题眼）。
 * 人物垂直 ·「人物向系列」；措辞偏强冲突、峰值切口。
 */
const THEME_DEFINITIONS: readonly {
  readonly title: string;
  readonly axisHint: string;
}[] = [
  {
    title: "史册上的绝境与反转",
    axisHint:
      "题眼：濒临崩盘或进退维谷的一刻，以及局势出人意料的拧转；勿写成生平串讲。",
  },
  {
    title: "千军万马中的一个人",
    axisHint:
      "题眼：洪流大势之下个体的抉择、担当或错觉式高光；勿只堆战役名录或番号。",
  },
  {
    title: "对决与翻盘：逆风局怎么打",
    axisHint:
      "题眼：明显劣势下的关键一手、翻盘契机或失手；突出「逆风怎么扳」。",
  },
  {
    title: "一句话搅动时局的谋士",
    axisHint:
      "题眼：一言、一谏、一策如何撬动信任、立场或局面；钉死当场后果与 stakes。",
  },
  {
    title: "名将高光与身后争议",
    axisHint:
      "题眼：战功或指挥上的高光瞬间，与后世评价、非议或裁夺的张力；勿空泛夸名将。",
  },
  {
    title: "末代君臣的最后一搏",
    axisHint:
      "题眼：末世节点的君臣抉择、最后一搏或体面收场；突出「还能不能赌一把」。",
  },
  {
    title: "权臣与天子：棋盘上的生死手",
    axisHint:
      "题眼：君臣权力分寸、试探与反制（博弈义）；勿渲染血腥细节。",
  },
  {
    title: "被演义撕裂的历史真面目",
    axisHint:
      "题眼：民间演义认知 vs 常见史料锚点的落差；可呈现「误读如何定型」。",
  },
  {
    title: "傀儡皇位上的困局与反扑",
    axisHint:
      "题眼：名实不符的皇权、傀儡处境中的缝隙与反扑或僵局；勿写成泛泛宫廷八卦。",
  },
  {
    title: "女性名字背后的政治风波",
    axisHint:
      "题眼：女性历史人物与政局、名分、联盟或污名化的纠葛一刻；尊重史实分寸。",
  },
  {
    title: "亡国之君：背锅还是气数",
    axisHint:
      "题眼：亡国责任辩论中的关键抉择或结构性困局；勿单调辱骂或洗白口号。",
  },
  {
    title: "开国功臣为何难得善终",
    axisHint:
      "题眼：肇造之功与猜忌、裁抑、两难承诺之间的张力瞬间；表述克制、勿猎奇。",
  },
  {
    title: "改革理想和酷烈现实的对撞",
    axisHint:
      "题眼：改制愿景与现实反弹的对撞一刻（人情、利益、反弹后果）；勿空洞喊改革。",
  },
  {
    title: "史书小人物改写走向的瞬间",
    axisHint:
      "题眼：身份不高者的关键举动或传递如何撬动大局；突出「这一下改变了什么」。",
  },
  {
    title: "叛徒还是功臣：裁夺身前身后名",
    axisHint:
      "题眼：降附、倒戈或立场切换引发的当场风险与后世标签之争；勿口号式站队。",
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
