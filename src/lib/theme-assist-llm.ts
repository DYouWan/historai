import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
  type LlmProfileRow,
} from "@/lib/llm-profiles";
import { CHAR_SYSTEM, SLICE_SYSTEM } from "@/lib/prompts/system-prompts";
import {
  buildCharacterRecommendUserPrompt,
  buildSliceRecommendUserPrompt,
} from "@/lib/prompts/user-templates";
import {
  buildSuggestNarrativeDurationUserPrompt,
  SUGGEST_NARRATIVE_DURATION_SYSTEM,
  snapVideoDurationMin,
} from "@/lib/prompts/suggest-narrative-duration-prompt";
import type { LlmMessagesDebug, SliceSuggestion, VideoDurationMin } from "@/lib/types";

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

async function chatCompletionText(params: {
  profile: LlmProfileRow;
  key: string;
  system: string;
  user: string;
  temperature: number;
  /** 不传则由上游默认；短 JSON 任务宜收紧以防啰嗦 */
  maxTokens?: number;
}): Promise<{ text: string; promptDebug: LlmMessagesDebug }> {
  const usesJson = params.profile.supportsJsonObject !== false;
  const body: Record<string, unknown> = {
    model: params.profile.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    temperature: params.temperature,
    ...(params.maxTokens != null ? { max_tokens: params.maxTokens } : {}),
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
  excludeNames?: string[];
}): Promise<{ characters: string[]; promptDebug: LlmMessagesDebug }> {
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

  const user = buildCharacterRecommendUserPrompt(
    params.seriesTitle,
    excludeSet.size ? Array.from(excludeSet) : undefined,
  );

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
  const trimmed = list.map((x) => String(x ?? "").trim()).filter(Boolean);

  const characters: string[] = [];
  const seen = new Set<string>();
  for (const name of trimmed) {
    if (excludeSet.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    characters.push(name);
    if (characters.length >= 12) break;
  }

  if (!characters.length) {
    throw new Error(
      excludeSet.size > 0 ?
        "模型返回的人选与排除名单冲突或为空，请重试。"
      : "模型未返回有效人物列表，请重试。",
    );
  }

  return { characters, promptDebug };
}

type RawSlice = { suggestions?: Array<{ title?: string; angle?: string }> };

export async function fetchCharacterSlices(params: {
  profileId?: string | null;
  seriesTitle: string;
  characterName: string;
  excludeTitles?: string[];
}): Promise<{ suggestions: SliceSuggestion[]; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「推荐切片标题」。`,
    );
  }

  const excludeSet = new Set(
    (params.excludeTitles ?? [])
      .map((t) => String(t ?? "").trim())
      .filter(Boolean),
  );

  const user = buildSliceRecommendUserPrompt(
    params.seriesTitle,
    params.characterName,
    excludeSet.size ? Array.from(excludeSet) : undefined,
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
  const seen = new Set<string>();
  for (const row of parsed.suggestions ?? []) {
    const title = String(row.title ?? "").trim();
    const angle = String(row.angle ?? "").trim();
    if (!title || !angle) continue;
    if (excludeSet.has(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    cleaned.push({ title, angle });
    if (cleaned.length >= 8) break;
  }

  if (!cleaned.length) {
    throw new Error(
      excludeSet.size > 0 ?
        "模型返回的切片标题与排除名单冲突或为空，请重试。"
      : "模型未返回有效切片标题，请重试。",
    );
  }

  return { suggestions: cleaned, promptDebug };
}

export async function fetchSuggestedNarrativeDuration(params: {
  profileId?: string | null;
  seriesTitle: string;
  subject: string;
  sliceTitle: string;
  sliceAngle: string;
  dynasty?: string;
}): Promise<{
  videoDurationMin: VideoDurationMin;
  rationale: string;
  promptDebug: LlmMessagesDebug;
}> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const key = resolveApiKeyForProfile(profile);
  if (!key) {
    throw new LlmNotConfiguredError(
      `当前档案「${profile.label}」需在环境变量 ${profile.apiKeyEnv.trim()} 中配置 API 密钥后，才可使用「估算叙事档位」。`,
    );
  }

  const user = buildSuggestNarrativeDurationUserPrompt({
    seriesTitle: params.seriesTitle.trim(),
    subject: params.subject.trim(),
    sliceTitle: params.sliceTitle.trim(),
    sliceAngle: params.sliceAngle.trim(),
    dynasty: params.dynasty?.trim(),
  });

  const { text, promptDebug } = await chatCompletionText({
    profile,
    key,
    system: SUGGEST_NARRATIVE_DURATION_SYSTEM,
    user,
    temperature: 0.35,
    maxTokens: 256,
  });

  let parsed: { videoDurationMin?: unknown; rationale?: unknown };
  try {
    parsed = JSON.parse(text) as { videoDurationMin?: unknown; rationale?: unknown };
  } catch {
    throw new Error("模型输出不是合法 JSON");
  }

  const videoDurationMin = snapVideoDurationMin(parsed.videoDurationMin);
  const rationale = String(parsed.rationale ?? "").trim().slice(0, 200);

  return {
    videoDurationMin,
    rationale:
      rationale ||
      `已选 ${videoDurationMin} 分钟档位（模型未返回理由，可直接重试估算）。`,
    promptDebug,
  };
}
