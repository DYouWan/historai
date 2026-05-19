import { parseChatCompletionResponse } from "@/lib/chat-openai-compatible";
import { validateAppearanceBatch } from "@/lib/character-suggest-validate";
import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
  type LlmProfileRow,
} from "@/lib/llm-profiles";

function profileUsesDeepSeekThinking(profile: LlmProfileRow): boolean {
  const v = profile.vendor.toLowerCase();
  const url = profile.chatCompletionsUrl.toLowerCase();
  return v.includes("deepseek") || url.includes("deepseek");
}
import {
  CHAR_APPEARANCE_SYSTEM,
  CHAR_ROSTER_SYSTEM,
  PEAK_TOPIC_SYSTEM,
} from "@/lib/prompts/system-prompts";
import {
  buildPeakPromoCopyUserPrompt,
  PEAK_PROMO_COPY_SYSTEM,
} from "@/lib/prompts/peak-promo-copy-prompts";
import {
  buildCharacterAppearanceUserPrompt,
  buildCharacterRosterUserPrompt,
  buildPeakTopicRecommendUserPrompt,
  type CharacterRosterRow,
} from "@/lib/prompts/user-templates";
import type {
  CharacterSuggestion,
  LlmDebugPhase,
  LlmMessagesDebug,
  PeakTopicSuggestion,
  VideoDurationMin,
} from "@/lib/types";

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

/** LLM 调用失败时携带已完成的 promptDebug，供 API 写入日志 */
export class LlmAssistError extends Error {
  readonly promptDebug?: LlmMessagesDebug;

  constructor(message: string, promptDebug?: LlmMessagesDebug) {
    super(message);
    this.name = "LlmAssistError";
    this.promptDebug = promptDebug;
  }
}

function promptDebugFromPhases(phases: LlmDebugPhase[]): LlmMessagesDebug | undefined {
  if (!phases.length) return undefined;
  const first = phases[0]!;
  return {
    system: first.system,
    user: first.user,
    model: first.model,
    chatCompletionsUrl: first.chatCompletionsUrl,
    temperature: first.temperature,
    usesJsonResponseFormat: first.usesJsonResponseFormat,
    assistantRaw: phases.length === 1 ? first.assistantRaw : undefined,
    phases: phases.length > 1 ? phases : undefined,
  };
}

async function chatCompletionText(params: {
  profile: LlmProfileRow;
  key: string;
  system: string;
  user: string;
  temperature: number;
  maxTokens?: number;
  /** false：不传 response_format，用于只需纯文本一句的场景 */
  responseFormatJson?: boolean;
  /** DeepSeek V4：关闭默认 thinking，避免 CoT 占满 content */
  disableThinking?: boolean;
}): Promise<{ text: string; promptDebug: LlmMessagesDebug }> {
  const preferJson =
    params.responseFormatJson === false ? false
    : params.responseFormatJson === true ? true
    : params.profile.supportsJsonObject !== false;

  const callOnce = async (useJson: boolean): Promise<{
    text: string;
    promptDebug: LlmMessagesDebug;
    finishReason?: string;
  }> => {
    const body: Record<string, unknown> = {
      model: params.profile.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      temperature: params.temperature,
      ...(params.maxTokens != null ? { max_tokens: params.maxTokens } : {}),
    };
    if (useJson) {
      body.response_format = { type: "json_object" };
    }
    const thinkingOff =
      params.disableThinking === true &&
      profileUsesDeepSeekThinking(params.profile);
    if (thinkingOff) {
      body.thinking = { type: "disabled" };
    }

    const promptDebug: LlmMessagesDebug = {
      system: params.system,
      user: params.user,
      model: params.profile.model,
      chatCompletionsUrl: params.profile.chatCompletionsUrl.trim(),
      temperature: params.temperature,
      usesJsonResponseFormat: useJson,
      thinkingDisabled: thinkingOff || undefined,
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
      throw new LlmAssistError(
        `模型请求失败（${res.status}）：${t.slice(0, 300)}`,
        promptDebug,
      );
    }

    const data = await res.json();
    const parsed = parseChatCompletionResponse(data, {
      allowReasoningFallback: !thinkingOff,
    });
    const trimmed = parsed.text.trim();
    return {
      text: trimmed,
      finishReason: parsed.finishReason,
      promptDebug: {
        ...promptDebug,
        assistantRaw:
          trimmed ||
          (parsed.usedReasoningFallback ?
            "_(empty content; used reasoning_content fallback)_"
          : "_(empty)_"),
      },
    };
  };

  let attempt = await callOnce(preferJson);
  if (!attempt.text && preferJson) {
    attempt = await callOnce(false);
  }

  if (!attempt.text) {
    const fr = attempt.finishReason ? `（finish_reason=${attempt.finishReason}）` : "";
    throw new LlmAssistError(
      `模型返回内容为空${fr}；可换模型档案或稍后重试`,
      attempt.promptDebug,
    );
  }

  return {
    text: attempt.text,
    promptDebug: { ...attempt.promptDebug, assistantRaw: attempt.text },
  };
}

function parseRosterJson(
  text: string,
  excludeSet: Set<string>,
): CharacterRosterRow[] {
  let parsed: { characters?: unknown };
  try {
    parsed = JSON.parse(text) as { characters?: unknown };
  } catch {
    throw new Error("人选阶段：模型输出不是合法 JSON");
  }
  const raw = parsed.characters;
  const list = Array.isArray(raw) ? raw : [];
  const roster: CharacterRosterRow[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    let name = "";
    let dynasty = "";
    if (typeof row === "string") {
      name = row.trim();
    } else if (row && typeof row === "object") {
      const o = row as { name?: unknown; dynasty?: unknown };
      name = String(o.name ?? "").trim();
      dynasty = String(o.dynasty ?? "").trim();
    }
    if (!name) continue;
    if (excludeSet.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    roster.push({ name, dynasty });
    if (roster.length >= 12) break;
  }
  if (roster.length < 8) {
    throw new Error(
      `人选阶段：有效人物 ${roster.length} 条，须 8～12 条，请重试。`,
    );
  }
  return roster;
}

function parseAppearancesJson(
  text: string,
  roster: CharacterRosterRow[],
): Map<string, string> {
  let parsed: { appearances?: unknown };
  try {
    parsed = JSON.parse(text) as { appearances?: unknown };
  } catch {
    throw new Error("形象阶段：模型输出不是合法 JSON");
  }
  const raw = parsed.appearances;
  const list = Array.isArray(raw) ? raw : [];
  const byName = new Map<string, string>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const o = row as { name?: unknown; appearance?: unknown };
    const name = String(o.name ?? "").trim();
    const appearance = String(o.appearance ?? "").trim();
    if (!name || !appearance) continue;
    byName.set(name, appearance);
  }
  const expected = new Set(roster.map((r) => r.name));
  const missing: string[] = [];
  for (let i = 0; i < roster.length; i++) {
    const n = roster[i]!.name;
    if (!byName.has(n)) missing.push(n);
  }
  if (missing.length) {
    throw new Error(
      `形象阶段：缺少 ${missing.slice(0, 4).join("、")}${missing.length > 4 ? " 等" : ""} 的 appearance，请重试。`,
    );
  }
  byName.forEach((_appearance, key) => {
    if (!expected.has(key)) {
      throw new Error(`形象阶段：出现未在名单中的 name「${key}」`);
    }
  });
  return byName;
}

async function fetchThemeCharacterRoster(args: {
  profile: LlmProfileRow;
  key: string;
  seriesTitle: string;
  excludeSet: Set<string>;
}): Promise<{ roster: CharacterRosterRow[]; phase: LlmDebugPhase }> {
  const user = buildCharacterRosterUserPrompt(
    args.seriesTitle,
    args.excludeSet.size ? Array.from(args.excludeSet) : undefined,
  );
  const { text, promptDebug } = await chatCompletionText({
    profile: args.profile,
    key: args.key,
    system: CHAR_ROSTER_SYSTEM,
    user,
    temperature: 0.75,
    maxTokens: 1200,
  });
  const roster = parseRosterJson(text, args.excludeSet);
  return {
    roster,
    phase: {
      phase: "character_roster",
      system: CHAR_ROSTER_SYSTEM,
      user,
      model: promptDebug.model,
      chatCompletionsUrl: promptDebug.chatCompletionsUrl,
      temperature: promptDebug.temperature,
      usesJsonResponseFormat: promptDebug.usesJsonResponseFormat,
      maxTokens: 1200,
      assistantRaw: text,
    },
  };
}

async function fetchThemeCharacterAppearances(args: {
  profile: LlmProfileRow;
  key: string;
  seriesTitle: string;
  roster: CharacterRosterRow[];
  retryHint?: string;
}): Promise<{ byName: Map<string, string>; phase: LlmDebugPhase }> {
  let user = buildCharacterAppearanceUserPrompt(args.seriesTitle, args.roster);
  if (args.retryHint?.trim()) {
    user += `\n\n【自动重试】${args.retryHint.trim()}\n请严格按锁定名单逐条输出 appearances。`;
  }
  const { text, promptDebug } = await chatCompletionText({
    profile: args.profile,
    key: args.key,
    system: CHAR_APPEARANCE_SYSTEM,
    user,
    temperature: 0.55,
    maxTokens: 2800,
  });
  const byName = parseAppearancesJson(text, args.roster);
  const batch = args.roster.map((r) => ({
    name: r.name,
    appearance: byName.get(r.name) ?? "",
  }));
  const validationError = validateAppearanceBatch(batch);
  if (validationError) {
    throw new Error(`形象阶段校验：${validationError}`);
  }
  return {
    byName,
    phase: {
      phase: "character_appearance",
      system: CHAR_APPEARANCE_SYSTEM,
      user,
      model: promptDebug.model,
      chatCompletionsUrl: promptDebug.chatCompletionsUrl,
      temperature: promptDebug.temperature,
      usesJsonResponseFormat: promptDebug.usesJsonResponseFormat,
      maxTokens: 2800,
      assistantRaw: text,
    },
  };
}

/**
 * 仅推荐人选（name + dynasty）；形象描述由 {@link fetchCharacterAppearance} 单独生成。
 * 「换一批」时 excludeNames 仅作用于本阶段。
 */
export async function fetchThemeCharacters(params: {
  profileId?: string | null;
  seriesTitle: string;
  excludeNames?: string[];
}): Promise<{ characters: CharacterSuggestion[]; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「推荐人物」。`,
    );
  }

  const excludeSet = new Set(
    (params.excludeNames ?? [])
      .map((n) => String(n ?? "").trim())
      .filter(Boolean),
  );

  const phases: LlmDebugPhase[] = [];

  try {
    const { roster, phase: rosterPhase } = await fetchThemeCharacterRoster({
      profile,
      key,
      seriesTitle: params.seriesTitle,
      excludeSet,
    });
    phases.push(rosterPhase);

    const characters: CharacterSuggestion[] = roster.map((r) => ({
      name: r.name,
      dynasty: r.dynasty,
      appearance: "",
    }));

    const merged = promptDebugFromPhases(phases);
    if (!merged) {
      throw new Error("推荐人物：内部调试信息缺失");
    }
    return {
      characters,
      promptDebug: {
        ...merged,
        storyboardStrategy: "character_recommend · roster only",
      },
    };
  } catch (e) {
    const partial = promptDebugFromPhases(phases);
    if (e instanceof LlmAssistError) {
      throw new LlmAssistError(e.message, e.promptDebug ?? partial);
    }
    if (partial) {
      throw new LlmAssistError(
        e instanceof Error ? e.message : "推荐人物失败",
        partial,
      );
    }
    throw e;
  }
}

/** 为当前锁定人物生成文生图用形象描述（步骤 2 · 生成封面图前） */
export async function fetchCharacterAppearance(params: {
  profileId?: string | null;
  seriesTitle: string;
  characterName: string;
  dynasty?: string | null;
}): Promise<{ appearance: string; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可生成形象描述。`,
    );
  }

  const name = params.characterName.trim();
  if (!name) {
    throw new Error("请填写人物/对象");
  }

  const roster: CharacterRosterRow[] = [
    {
      name,
      dynasty: params.dynasty?.trim() || "不详",
    },
  ];

  const phases: LlmDebugPhase[] = [];

  try {
    let appearanceByName: Map<string, string>;
    try {
      const first = await fetchThemeCharacterAppearances({
        profile,
        key,
        seriesTitle: params.seriesTitle,
        roster,
      });
      appearanceByName = first.byName;
      phases.push(first.phase);
    } catch (e1) {
      const msg = e1 instanceof Error ? e1.message : String(e1);
      const second = await fetchThemeCharacterAppearances({
        profile,
        key,
        seriesTitle: params.seriesTitle,
        roster,
        retryHint: msg,
      });
      appearanceByName = second.byName;
      phases.push(second.phase);
    }

    const appearance = appearanceByName.get(name)?.trim() ?? "";
    if (!appearance) {
      throw new Error("未生成有效形象描述，请重试");
    }

    const merged = promptDebugFromPhases(phases);
    if (!merged) {
      throw new Error("生成形象描述：内部调试信息缺失");
    }
    return {
      appearance,
      promptDebug: {
        ...merged,
        storyboardStrategy: "character_appearance · single subject",
      },
    };
  } catch (e) {
    const partial = promptDebugFromPhases(phases);
    if (e instanceof LlmAssistError) {
      throw new LlmAssistError(e.message, e.promptDebug ?? partial);
    }
    if (partial) {
      throw new LlmAssistError(
        e instanceof Error ? e.message : "生成形象描述失败",
        partial,
      );
    }
    throw e;
  }
}

type RawPeakTopic = {
  suggestions?: Array<{ peakTitle?: string; peakDescription?: string }>;
};

export async function fetchPeakTopics(params: {
  profileId?: string | null;
  seriesTitle: string;
  characterName: string;
  excludePeakTitles?: string[];
  videoDurationMin?: VideoDurationMin;
}): Promise<{ suggestions: PeakTopicSuggestion[]; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「AI 推荐峰值选题」。`,
    );
  }

  const excludeSet = new Set(
    (params.excludePeakTitles ?? [])
      .map((t) => String(t ?? "").trim())
      .filter(Boolean),
  );

  const user = buildPeakTopicRecommendUserPrompt(
    params.seriesTitle,
    params.characterName,
    excludeSet.size ? Array.from(excludeSet) : undefined,
    params.videoDurationMin,
  );

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: PEAK_TOPIC_SYSTEM,
    user,
    temperature: 0.85,
  });

  let parsed: RawPeakTopic;
  try {
    parsed = JSON.parse(text) as RawPeakTopic;
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }

  const cleaned: PeakTopicSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of parsed.suggestions ?? []) {
    const peakTitle = String(row.peakTitle ?? "").trim();
    const peakDescription = String(row.peakDescription ?? "").trim();
    if (!peakTitle || !peakDescription) continue;
    if (excludeSet.has(peakTitle)) continue;
    if (seen.has(peakTitle)) continue;
    seen.add(peakTitle);
    cleaned.push({ peakTitle, peakDescription });
    if (cleaned.length >= 8) break;
  }

  if (!cleaned.length) {
    throw new Error(
      excludeSet.size > 0 ?
        "模型返回的峰值标题与排除名单冲突或为空，请重试。"
      : "模型未返回有效峰值选题，请重试。",
    );
  }

  return { suggestions: cleaned, promptDebug };
}

/** @deprecated 使用 fetchPeakTopics */
export const fetchCharacterSlices = fetchPeakTopics;

const PROMO_COPY_REASONING_RE =
  /我们要求|根据峰值|说明中强调|需要扣住|可能的方向|例如[:：]|最终选择|共\d+字|关键词[:：]|可以使用|需要考虑/u;

function stripMarkdownFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

function cleanPromoCopyLine(s: string): string {
  return s
    .replace(/^["「『]|["」』"]$/g, "")
    .replace(/^(?:改写后的传播句|传播句)[:：]\s*/u, "")
    .replace(/^(?:最终选择|推荐)[:：]\s*/u, "")
    .trim();
}

function extractPromoCopyFromText(text: string): string {
  const raw = stripMarkdownFence(text);
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { promoCopy?: string };
      const fromJson = String(parsed.promoCopy ?? "").trim();
      if (fromJson) return cleanPromoCopyLine(fromJson);
    } catch {
      /* 非 JSON，按纯文本处理 */
    }
  }

  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines) {
    const finalPick = line.match(
      /(?:最终选择|推荐)[:：]\s*[「『"]?([^」』"\n]{4,26})/u,
    );
    if (finalPick) candidates.push(finalPick[1]!.trim());
    const quoted = line.match(/[「『"]([^」』"]{4,22})[」』"]/);
    if (quoted && line.length > 20) candidates.push(quoted[1]!.trim());
    candidates.push(cleanPromoCopyLine(line));
  }
  if (!candidates.length) candidates.push(cleanPromoCopyLine(raw));

  const pick =
    candidates.find(
      (c) =>
        c.length >= 4 &&
        c.length <= 22 &&
        !PROMO_COPY_REASONING_RE.test(c),
    ) ??
    candidates.find((c) => c.length >= 4 && c.length <= 22) ??
    cleanPromoCopyLine(raw);

  let promo = pick;
  if (promo.length > 22) promo = promo.slice(0, 22).trim();
  return promo;
}

export async function fetchPeakPromoCopy(params: {
  profileId?: string | null;
  seriesTitle: string;
  characterName: string;
  peakTitle: string;
  peakDescription?: string;
}): Promise<{ promoCopy: string; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「生成传播文案」。`,
    );
  }

  const user = buildPeakPromoCopyUserPrompt({
    characterName: params.characterName,
    peakTitle: params.peakTitle,
    peakDescription: params.peakDescription,
  });

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: PEAK_PROMO_COPY_SYSTEM,
    user,
    temperature: 0.85,
    maxTokens: 128,
    responseFormatJson: false,
    disableThinking: true,
  });

  if (text.length > 50 && PROMO_COPY_REASONING_RE.test(text)) {
    throw new LlmAssistError(
      "模型返回了分析过程而非成品句，请重试。",
      promptDebug,
    );
  }

  const promoCopy = extractPromoCopyFromText(text);
  if (!promoCopy || promoCopy.length < 4) {
    throw new LlmAssistError("模型未返回有效传播文案，请重试。", promptDebug);
  }
  if (PROMO_COPY_REASONING_RE.test(promoCopy)) {
    throw new LlmAssistError(
      "模型返回了分析过程而非成品句，请重试。",
      promptDebug,
    );
  }

  return { promoCopy, promptDebug };
}
