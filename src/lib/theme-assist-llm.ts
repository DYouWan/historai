import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
  type LlmProfileRow,
} from "@/lib/llm-profiles";
import {
  CHAR_SYSTEM,
  SERIES_AI_SYSTEM,
  SLICE_SYSTEM,
} from "@/lib/prompts/system-prompts";
import {
  buildCharacterRecommendUserPrompt,
  buildSeriesNameUserPrompt,
  buildSliceRecommendUserPrompt,
} from "@/lib/prompts/user-templates";
import type { LlmMessagesDebug, SliceSuggestion } from "@/lib/types";

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

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

  const user = buildCharacterRecommendUserPrompt(params.seriesTitle);

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
  const user = buildSeriesNameUserPrompt(hint);

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

  const user = buildSliceRecommendUserPrompt(
    params.seriesTitle,
    params.characterName,
  );

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
