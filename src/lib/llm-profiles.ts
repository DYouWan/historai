import fs from "fs";
import path from "path";

import type { VideoDurationMin } from "@/lib/types";

/** 与 `VideoDurationMin` 一致；用于校验 JSON 中的 duration 键，避免漏改正则 */
const SINGLE_SHOT_DURATION_JSON_KEYS = [
  "1",
  "3",
  "5",
  "8",
  "10",
  "15",
] as const satisfies readonly `${VideoDurationMin}`[];
const singleShotDurationKeySet = new Set<string>(
  SINGLE_SHOT_DURATION_JSON_KEYS,
);

/** 文案/分镜生成：max_tokens 与分块策略（DeepSeek、通义等 OpenAI 兼容接口） */
export type StoryboardProfileConfig = {
  /** 成片 ≥ 该分钟数且 chunkMode=auto 时走分块（默认 10） */
  chunkThresholdMinutes?: number;
  /** 每块扩写最多几条 scene（默认 18） */
  scenesPerChunk?: number;
  /** 脊柱阶段 max_tokens（默认 12000） */
  spineMaxTokens?: number;
  /** 每块扩写 max_tokens（默认 18000） */
  chunkMaxTokens?: number;
  /** 按成片分钟覆盖单次生成的 max_tokens；键为 "1"|"3"|"5"|"8"|"10"|"15" */
  singleShotMaxTokensByDuration?: Partial<
    Record<`${VideoDurationMin}`, number>
  >;
  /** 为 true 时始终分块（短档也会走 脊柱+1 块） */
  forceChunked?: boolean;
  /** 为 true 时禁用分块，仅单次生成（长档可能截断） */
  disableChunked?: boolean;
  /** 所有 max_tokens 不得超过此值（默认 65536） */
  maxTokensHardCap?: number;
};

export type LlmProfileRow = {
  id: string;
  vendor: string;
  label: string;
  chatCompletionsUrl: string;
  /** 进程环境变量名，密钥只放在 .env 中 */
  apiKeyEnv: string;
  model: string;
  /** 为 false 时不传 response_format（少数兼容接口不支持） */
  supportsJsonObject?: boolean;
  /** 主生成（文案+分镜）的 token 与分块策略 */
  storyboard?: StoryboardProfileConfig;
};

export type LlmProfilesFile = {
  defaultProfileId?: string;
  profiles: LlmProfileRow[];
};

export type LlmProfilePublic = Pick<
  LlmProfileRow,
  "id" | "vendor" | "label" | "model"
> & {
  configured: boolean;
};

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

let cache: { mtimeMs: number; filePath: string; data: LlmProfilesFile } | null =
  null;

function profilesPath(): string {
  const override = process.env.LLM_PROFILES_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "llm-profiles.json");
}

export function loadLlmProfilesFile(): LlmProfilesFile {
  const filePath = profilesPath();
  try {
    const st = fs.statSync(filePath);
    if (
      cache &&
      cache.filePath === filePath &&
      cache.mtimeMs === st.mtimeMs
    ) {
      return cache.data;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as LlmProfilesFile;
    if (!Array.isArray(data.profiles)) {
      throw new Error("llm-profiles.json：profiles 必须是数组");
    }
    for (const p of data.profiles) {
      if (!p.id?.trim()) throw new Error("档案缺少 id");
      if (!p.vendor?.trim()) throw new Error(`档案 ${p.id} 缺少 vendor`);
      if (!p.label?.trim()) throw new Error(`档案 ${p.id} 缺少 label`);
      if (!p.chatCompletionsUrl?.trim()) {
        throw new Error(`档案 ${p.id} 缺少 chatCompletionsUrl`);
      }
      if (!p.apiKeyEnv?.trim() || !ENV_NAME.test(p.apiKeyEnv.trim())) {
        throw new Error(`档案 ${p.id}：apiKeyEnv 必须是合法环境变量名`);
      }
      if (!p.model?.trim()) throw new Error(`档案 ${p.id} 缺少 model`);
      if (p.storyboard !== undefined && p.storyboard !== null) {
        if (typeof p.storyboard !== "object" || Array.isArray(p.storyboard)) {
          throw new Error(`档案 ${p.id}：storyboard 必须是对象`);
        }
        const s = p.storyboard as StoryboardProfileConfig;
        const num = (x: unknown, name: string) => {
          if (x === undefined) return;
          if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) {
            throw new Error(`档案 ${p.id}：storyboard.${name} 须为正数`);
          }
        };
        num(s.chunkThresholdMinutes, "chunkThresholdMinutes");
        num(s.scenesPerChunk, "scenesPerChunk");
        num(s.spineMaxTokens, "spineMaxTokens");
        num(s.chunkMaxTokens, "chunkMaxTokens");
        num(s.maxTokensHardCap, "maxTokensHardCap");
        if (s.singleShotMaxTokensByDuration !== undefined) {
          if (
            typeof s.singleShotMaxTokensByDuration !== "object" ||
            Array.isArray(s.singleShotMaxTokensByDuration)
          ) {
            throw new Error(
              `档案 ${p.id}：storyboard.singleShotMaxTokensByDuration 须为对象`,
            );
          }
          for (const [k, v] of Object.entries(s.singleShotMaxTokensByDuration)) {
            if (!singleShotDurationKeySet.has(k)) {
              throw new Error(
                `档案 ${p.id}：singleShotMaxTokensByDuration 非法键「${k}」（允许：${SINGLE_SHOT_DURATION_JSON_KEYS.join("、")}）`,
              );
            }
            if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
              throw new Error(
                `档案 ${p.id}：singleShotMaxTokensByDuration.${k} 须为正数`,
              );
            }
          }
        }
      }
    }
    const seen = new Set<string>();
    for (const p of data.profiles) {
      if (seen.has(p.id)) throw new Error(`重复的档案 id：${p.id}`);
      seen.add(p.id);
    }
    cache = { mtimeMs: st.mtimeMs, filePath, data };
    return data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `未找到 ${filePath}。请在项目根目录放置 llm-profiles.json，或设置 LLM_PROFILES_PATH。`,
      );
    }
    throw e;
  }
}

export function resolveApiKeyForProfile(profile: LlmProfileRow): string | undefined {
  const name = profile.apiKeyEnv.trim();
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function pickProfile(
  file: LlmProfilesFile,
  profileId?: string | null,
): LlmProfileRow {
  const { profiles } = file;
  if (!profiles.length) {
    throw new Error("llm-profiles.json 中 profiles 为空");
  }
  if (profileId?.trim()) {
    const p = profiles.find((x) => x.id === profileId.trim());
    if (!p) throw new Error(`未知的模型档案 id：${profileId}`);
    return p;
  }
  if (file.defaultProfileId?.trim()) {
    const p = profiles.find((x) => x.id === file.defaultProfileId!.trim());
    if (p) return p;
  }
  return profiles[0];
}

export function listPublicProfiles(file: LlmProfilesFile): LlmProfilePublic[] {
  return file.profiles.map((p) => ({
    id: p.id,
    vendor: p.vendor,
    label: p.label,
    model: p.model,
    configured: Boolean(resolveApiKeyForProfile(p)),
  }));
}
