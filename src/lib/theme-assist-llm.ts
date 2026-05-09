import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
  type LlmProfileRow,
} from "@/lib/llm-profiles";
import { randomUUID } from "node:crypto";
import type { LlmMessagesDebug, SliceSuggestion } from "@/lib/types";

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

const CHAR_SYSTEM =
  "你是 HistorAI 的「峰值叙事」短视频策划助理：根据「人物向系列名称」，列出**适合单支高光切片**的具体人物或可指称群体。每人/每项须在史籍或公认为**有戏剧性**：抉择、决战、翻盘、困局、非议、一语改势等其一；排斥只适合生平串讲而无单点高峰的对象。只输出合法 JSON，中文。";

const SERIES_AI_SYSTEM = `你是 HistorAI 的短视频策划助理：每次为用户生成**恰好一条**「人物向系列名称」（栏目标题式短句），用于 HistorAI 人物向峰值叙事创作；**不是**人物名单、不是单支视频标题。
多次调用时若用户文案相同，仍须换用**不同的语感、比喻轴或句式**，勿复读上一轮常见第一条。

【定位】
- 像**系列/栏目名**：观众能感到「这一栏里的视频主攻哪类历史高峰瞬间」。
- 偏**强冲突、单列高光、抉择或对决感**，避免「某某的一生」「人物百科」式。
- **6～26 字**为宜；口语可读。

【禁止的格式】
- suggestion 必须与观众在列表里看到的**同一行栏目名**：只写**正题**（主旨定位那一句）；若你心里先有「前缀套话」+「正题」，**落笔只输出正题**，不要写成「前缀：正题」整条（也不要带全角「：」或半角冒号作主副分界）。
- 比喻、抉择感等请**揉进正题**（顿号、逗号或直接叙事皆可），仍为**单层**短语，**勿**再在正题前单列四字标语。
- **严禁**把本接口当成「推荐人物」：不要用顿号「、」串联**多位真实历史人物姓名**当系列名（如「王莽、王安石、张居正」是错误的）；系列名应是**栏目/赛道定位**，不是人名清单。
- 若正题里**自然出现**某个人名以点题可以，但**勿**用「人名、人名、人名」堆成整条 suggestion。

【输出】
必须且只输出合法 JSON：{"suggestion":"……"} ，仅一个键 suggestion，值为**单行字符串**，中文；不得 Markdown、代码围栏或其它非 JSON。`;

const NAME_LIST_CHUNK = /^[\u4e00-\u9fff]{2,4}$/;

/**
 * 「王莽、王安石、张居正」类人名串列举（≠ 破局、翻盘、一刻 等短语并列）
 * —— 三段及以上、纯汉字、总长足够，避免单靠「三个二字词」误判
 */
function isHistoricalNameBulletList(s: string): boolean {
  const t = s.trim();
  if (!t.includes("、")) return false;
  const parts = t.split("、").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3 || !parts.every((p) => NAME_LIST_CHUNK.test(p))) return false;
  const sum = parts.reduce((acc, p) => acc + p.length, 0);
  return sum >= 7;
}

/** 去掉模型偶发的「标语：正题」；若正题实为「人名列举」则改取前缀或退回整串，避免误判 */
function normalizeSeriesSuggestionText(raw: string): string {
  const t = raw.trim();
  if (!t) return t;

  const pickColonSplit = (
    full: string,
    head: string,
    tail: string,
  ): string => {
    if (tail.length < 4) return full;
    if (isHistoricalNameBulletList(tail)) {
      const h = head.trim();
      if (h.length >= 4 && !isHistoricalNameBulletList(h)) return h;
      return full;
    }
    return tail;
  };

  if (t.includes("：")) {
    const parts = t.split("：").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const tail = parts[parts.length - 1] ?? "";
      const head = parts[0] ?? "";
      return pickColonSplit(t, head, tail);
    }
    return t;
  }
  const idx = t.indexOf(":");
  if (idx > 0 && idx < t.length - 1) {
    const before = t.slice(0, idx).trim();
    const after = t.slice(idx + 1).trim();
    const cjk = /[\u4e00-\u9fff]/;
    if (cjk.test(before) && cjk.test(after) && after.length >= 4) {
      if (!isHistoricalNameBulletList(after)) return after;
      if (before.length >= 4 && !isHistoricalNameBulletList(before)) return before;
      return t;
    }
  }
  return t;
}


const SLICE_SYSTEM = `你是 HistorAI 的「峰值叙事」短视频策划助理：根据「人物向系列名称」与「核心人物/对象」，生成若干**单点高峰**切片方案（每条含 title 与 angle）。一支片子只讲**一个**可被记住的瞬间/抉择/对决切面，**不写生平、不做年表汇总**。

【输出格式】
必须且只输出一个合法 JSON 对象；不得包含任何解释性文字、前言后记、Markdown 标记（如 #、**、代码围栏）或其它非 JSON 内容。

【内容视角】
对象为具体个人时，title / angle 以第一人称「我」对镜头口述，群体视角用第三人称「他们」作口语。须口语化、有镜头代入感，禁止干瘪百科词条。

【title — 传播与点击】
- 像**平台标题/封面 copy**：用户点进来前能回答「这支视频**具体要讲哪一下**」；**优先**带**悬念、对撞、反常识**之一（可用问句）。
- **鼓励**在真实可考或史籍常见说法范围内使用**数字钩子**（兵力、距离、昼夜、人数对比等）；若数字存疑，title 可写「史载约…」「一说…」等分寸，**禁止**为标题效果编造确数。
- **禁止**泛泛的「一生」「生平」「人物志」「盘点」式标题。

【angle（切片说明）— 只写「讲什么」，且含赌注感】
- 用 **1～3 句连贯中文**，**正面叙述**唯一焦点：当时的**核心冲突**或**巅峰瞬间**，以及**输了/选错会怎样（stakes）**的一笔带过（不必长，但要有）。
- **不要**拆成「讲什么 / 不讲什么」两截；**严禁**「我不讲…」「本片不讲…」「不拍……」等否定句来点题；编年禁区靠选材收束即可。
- **个人**：「我」作主语，钉死**一个**具体事件或场面：关键行动/决策/当场反应与**直接后果**的一角；可带一个可「微观放大」的细节种子（一句话、一个动作、一处地形），仍须同一焦点。
- **群体**：「他们」作主语，钉死**一个**被记住、被误读或被争论的**记忆锚点**与外界反应。
- 每条 suggestions **仅一个单一焦点**，条目之间须**角度拉开**（勿 6～8 条全像同义改写）。

【示例·体会写法即可，禁止照抄措辞或套同一历史】
- 个人：「帐外刚报完捷，我让人把那一箱没拆完的信抬到空地上，自己接过火把——这支就拍火舌卷上第一角麻绳时，帐里谁的呼吸先乱了。」
- 群体：「后来人说起他们，总先想到盟约上那行字，却少有人记得散伙前夜是谁先跨出了营门——这一条就拍这两种说法怎么拧成民间只记一半的故事。」

输出键名固定为 suggestions 数组，元素为 { "title": string, "angle": string }；须为中文。`;

async function chatCompletionText(params: {
  profile: LlmProfileRow;
  key: string;
  system: string;
  user: string;
  temperature: number;
}): Promise<{ text: string; promptDebug: LlmMessagesDebug }> {
  const usesJson = params.profile.supportsJsonObject !== false;
  const body: Record<string, unknown> = {
    model: params.profile.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    temperature: params.temperature,
  };
  if (usesJson) {
    body.response_format = { type: "json_object" };
  }

  const promptDebug: LlmMessagesDebug = {
    system: params.system,
    user: params.user,
    model: params.profile.model,
    chatCompletionsUrl: params.profile.chatCompletionsUrl.trim(),
    temperature: params.temperature,
    usesJsonResponseFormat: usesJson,
  };

  const res = await fetch(params.profile.chatCompletionsUrl.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`模型请求失败（${res.status}）：${t.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new Error("模型返回内容为空");

  const trimmed = text.trim();
  return {
    text: trimmed,
    promptDebug: { ...promptDebug, assistantRaw: trimmed },
  };
}

export async function fetchThemeCharacters(params: {
  profileId?: string | null;
  seriesTitle: string;
}): Promise<{ characters: string[]; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「推荐人物」。`,
    );
  }

  const theme = params.seriesTitle.trim();
  const user = `人物向系列名称：「${theme}」
---
请列出 **8～12** 个**互不重复**的条目，每条须为**具体人名**、史书常见称谓人物、或可指称的具体**并称群体**/战役关联方（须与该系列**强冲突、强峰值意象**对齐）。

【峰值叙事选人（路线图 ③）】
- **优先**：一生或履历中确有**可查高光瞬间**适于单支讲完者（沙场对决、君臣摊牌、临危一言、翻盘、争议标签、绝境抉择等）。
- **至少半数**条目应具有**明显戏剧张力**素材（别让列表变成「泛泛名人清单」）。
- **避免**：只适合百科式从出生讲到死的对象扎堆；杜绝单独输出「朝代」「思潮」等非具体名。
- 不要输出空泛类别词（如单独「三国」「古人」「帝王」）。
- 若为群体，用语须让读者知指哪一支（例：「关陇集团」可加时代限定，但不要抽象到无法选角）。

只输出 JSON，结构如下：
{"characters":["曹操","荀彧","…"]}`;

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: CHAR_SYSTEM,
    user,
    temperature: 0.75,
  });

  let parsed: { characters?: unknown };
  try {
    parsed = JSON.parse(text) as { characters?: unknown };
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }

  const raw = parsed.characters;
  const list = Array.isArray(raw) ? raw : [];
  const characters = list
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);

  if (!characters.length) {
    throw new Error("模型未返回有效人物列表，请重试。");
  }

  return { characters, promptDebug };
}

type RawSeriesAi = {
  suggestion?: unknown;
  /** 兼容个别模型误用数组时的首项 */
  suggestions?: unknown[];
};

export async function fetchAiSeriesNameSuggestions(params: {
  profileId?: string | null;
  hint?: string;
}): Promise<{ suggestion: string; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「AI 生成系列名」。`,
    );
  }

  const hint = params.hint?.trim();
  const nonce = randomUUID();
  const user = `${hint ? `用户给出的方向或偏好（须尽量贴合，但不违背峰值叙事定位）：「${hint}」\n` : `用户未给出额外方向：请自由发挥一条即可。\n`}---
【请求令牌】${nonce}
同一接口可能被连续多次调用：你必须结合令牌产出一条**新的**人物向系列名称；**禁止**每次给出措辞几乎相同的同一句；请轮换切入点（如抉择/对峙/翻盘/绝境/争议标签等不同侧重），避免固定套用同一种比喻模板。
---
请生成 **恰好 1 条**「人物向系列名称」，只输出 JSON：
{"suggestion":"…"}

**只写正题一句**（列表里看到的那一行栏目名/定位）：若脑内先有套话+正题，**只把正题写进 suggestion**，不要粘「套话：正题」整串；字段内**不要出现**「：」。
**勿**输出人名清单（不要用「、」串多位史实人物姓名）；`;

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: SERIES_AI_SYSTEM,
    user,
    temperature: 0.9,
  });

  let parsed: RawSeriesAi;
  try {
    parsed = JSON.parse(text) as RawSeriesAi;
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }

  let one =
    typeof parsed.suggestion === "string" ? parsed.suggestion.trim() : "";
  if (
    !one &&
    Array.isArray(parsed.suggestions) &&
    parsed.suggestions.length > 0
  ) {
    one = String(parsed.suggestions[0] ?? "").trim();
  }

  if (!one) {
    throw new Error("模型未返回有效系列名称（需 suggestion 字段），请重试。");
  }

  one = normalizeSeriesSuggestionText(one).trim();
  if (!one) {
    throw new Error("系列名在规范化后为空，请重试。");
  }

  if (isHistoricalNameBulletList(one)) {
    throw new Error(
      "模型把人名列成了系列名（请重试「AI 生成系列名」；若仍出现请换模型或稍后再试）。",
    );
  }

  return { suggestion: one.slice(0, 120), promptDebug };
}

type RawSlice = { suggestions?: Array<{ title?: string; angle?: string }> };

export async function fetchCharacterSlices(params: {
  profileId?: string | null;
  seriesTitle: string;
  characterName: string;
}): Promise<{ suggestions: SliceSuggestion[]; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「推荐切片标题」。`,
    );
  }

  const theme = params.seriesTitle.trim();
  const ch = params.characterName.trim();
  const user = `人物向系列名称：「${theme}」
核心人物/对象：「${ch}」
---
请生成 **6～8** 条互不相同的**峰值切片**方案（单点高峰、零生平汇总），只输出 JSON，结构严格为：
{"suggestions":[{"title":"…","angle":"…"}]}

对每条的要求：
- title：**短而利**，适合当传播标题或封面主打；须点题本系列与该对象，且让人一眼看出「这支只讲哪一下」。**个人**须含「我」；**群体**须以「他们」作主语，**禁用「我们」**。问句或数字钩子见本条列表末尾的统一要求。
- angle：**连贯 1～3 句**，个人「我」/ 群体「他们」；写明**这一关的冲突或巅峰场面**，并隐含或点出 **stakes（为何重要、输得起吗）**；**禁止**否定式清单与「不讲什么」申明白；每条**只一个焦点**。
- **彼此拉开**：条目勿同质；可覆盖对战、单挑抉择、一语改局、争议标签、绝境反击等不同峰值类型（仍须与系列、人物史实可能相关）。
- 数字：**勿杜撰**具体到个位的「史实」；可用「史称」「一说」「约」等。
- 整条列表中：**不少于 4 条** title 应使用「…？」或与史料分寸相符的**数字/数量对比**（兵力、昼夜、两方规模等其一），以满足传播试错；做不到的条目用强悬念对撞补足。`;

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: SLICE_SYSTEM,
    user,
    temperature: 0.85,
  });

  let parsed: RawSlice;
  try {
    parsed = JSON.parse(text) as RawSlice;
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }

  const cleaned: SliceSuggestion[] = [];
  for (const row of parsed.suggestions ?? []) {
    const title = String(row.title ?? "").trim();
    const angle = String(row.angle ?? "").trim();
    if (title && angle) cleaned.push({ title, angle });
  }

  if (!cleaned.length) {
    throw new Error("模型未返回有效切片标题，请重试。");
  }

  return { suggestions: cleaned.slice(0, 8), promptDebug };
}
