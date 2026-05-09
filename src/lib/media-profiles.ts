import fs from "fs";
import path from "path";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ImageProfileDriver =
  | "openai_dalle3"
  | "dashscope_qwen_image"
  | "volcengine_seedream";

export type TextToImageProfileRow = {
  id: string;
  vendor: string;
  label: string;
  apiKeyEnv: string;
  driver: ImageProfileDriver;
  /** DashScope：完整 POST URL（北京/新加坡等） */
  generationUrl?: string;
  model?: string;
  size?: string;
  negativePrompt?: string;
  promptExtend?: boolean;
  watermark?: boolean;
  /** 火山方舟：如 https://ark.cn-beijing.volces.com/api/v3 */
  baseUrl?: string;
  responseFormat?: "url" | "b64_json";
};

export type VideoProfileDriver = "volcengine_seedance" | "happyhorse";

export type ImageToVideoProfileRow = {
  id: string;
  vendor: string;
  label: string;
  apiKeyEnv: string;
  driver: VideoProfileDriver;
  baseUrl: string;
  model: string;
  resolution?: string;
  ratio?: string;
  durationSec?: number;
  watermark?: boolean;
  mode?: "pro" | "std";
  aspectRatio?: string;
  sound?: boolean;
};

export type MediaProfilesFile = {
  defaultImageProfileId?: string;
  defaultVideoProfileId?: string;
  imageProfiles: TextToImageProfileRow[];
  videoProfiles: ImageToVideoProfileRow[];
};

export type MediaImageProfilePublic = Pick<
  TextToImageProfileRow,
  "id" | "vendor" | "label" | "driver"
> & {
  configured: boolean;
  /** 下拉展示用（如方舟接入点模型名） */
  modelLine?: string;
};

export type MediaVideoProfilePublic = Pick<
  ImageToVideoProfileRow,
  "id" | "vendor" | "label" | "driver" | "model"
> & {
  configured: boolean;
};

let cache: { mtimeMs: number; filePath: string; data: MediaProfilesFile } | null =
  null;

function profilesPath(): string {
  const override = process.env.MEDIA_PROFILES_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "media-profiles.json");
}

function assertEnvName(id: string, name: string) {
  if (!name?.trim() || !ENV_NAME.test(name.trim())) {
    throw new Error(`${id}：apiKeyEnv 必须是合法环境变量名`);
  }
}

export function loadMediaProfilesFile(): MediaProfilesFile {
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
    const data = JSON.parse(raw) as MediaProfilesFile;
    if (!Array.isArray(data.imageProfiles)) {
      throw new Error("media-profiles.json：imageProfiles 必须是数组");
    }
    if (!Array.isArray(data.videoProfiles)) {
      throw new Error("media-profiles.json：videoProfiles 必须是数组");
    }

    const imageDrivers: ImageProfileDriver[] = [
      "openai_dalle3",
      "dashscope_qwen_image",
      "volcengine_seedream",
    ];
    const videoDrivers: VideoProfileDriver[] = ["volcengine_seedance", "happyhorse"];

    for (const p of data.imageProfiles) {
      if (!p.id?.trim()) throw new Error("文生图档案缺少 id");
      if (!p.vendor?.trim()) throw new Error(`文生图 ${p.id} 缺少 vendor`);
      if (!p.label?.trim()) throw new Error(`文生图 ${p.id} 缺少 label`);
      assertEnvName(`文生图 ${p.id}`, p.apiKeyEnv);
      if (!imageDrivers.includes(p.driver)) {
        throw new Error(`文生图 ${p.id}：未知 driver「${p.driver}」`);
      }
      if (p.driver === "dashscope_qwen_image") {
        if (!p.generationUrl?.trim()) {
          throw new Error(`文生图 ${p.id}：dashscope_qwen_image 须填 generationUrl`);
        }
        if (!p.model?.trim()) throw new Error(`文生图 ${p.id}：须填 model`);
      }
      if (p.driver === "volcengine_seedream") {
        if (!p.baseUrl?.trim()) {
          throw new Error(`文生图 ${p.id}：volcengine_seedream 须填 baseUrl`);
        }
        if (!p.model?.trim()) throw new Error(`文生图 ${p.id}：须填 model`);
      }
    }

    for (const p of data.videoProfiles) {
      if (!p.id?.trim()) throw new Error("图生视频档案缺少 id");
      if (!p.vendor?.trim()) throw new Error(`图生视频 ${p.id} 缺少 vendor`);
      if (!p.label?.trim()) throw new Error(`图生视频 ${p.id} 缺少 label`);
      assertEnvName(`图生视频 ${p.id}`, p.apiKeyEnv);
      if (!videoDrivers.includes(p.driver)) {
        throw new Error(`图生视频 ${p.id}：未知 driver「${p.driver}」`);
      }
      if (!p.baseUrl?.trim()) throw new Error(`图生视频 ${p.id}：须填 baseUrl`);
      if (!p.model?.trim()) throw new Error(`图生视频 ${p.id}：须填 model`);
    }

    const seenI = new Set<string>();
    for (const p of data.imageProfiles) {
      if (seenI.has(p.id)) throw new Error(`重复的文生图 id：${p.id}`);
      seenI.add(p.id);
    }
    const seenV = new Set<string>();
    for (const p of data.videoProfiles) {
      if (seenV.has(p.id)) throw new Error(`重复的图生视频 id：${p.id}`);
      seenV.add(p.id);
    }

    cache = { mtimeMs: st.mtimeMs, filePath, data };
    return data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `未找到 ${filePath}。请在项目根目录放置 media-profiles.json，或设置 MEDIA_PROFILES_PATH。`,
      );
    }
    throw e;
  }
}

export function resolveApiKeyForMediaProfile(p: {
  apiKeyEnv: string;
}): string | undefined {
  const name = p.apiKeyEnv.trim();
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function pickImageProfile(
  file: MediaProfilesFile,
  profileId?: string | null,
): TextToImageProfileRow {
  const { imageProfiles: profiles } = file;
  if (!profiles.length) {
    throw new Error("media-profiles.json 中文生图 imageProfiles 为空");
  }
  if (profileId?.trim()) {
    const p = profiles.find((x) => x.id === profileId.trim());
    if (!p) throw new Error(`未知的文生图档案 id：${profileId}`);
    return p;
  }
  if (file.defaultImageProfileId?.trim()) {
    const p = profiles.find((x) => x.id === file.defaultImageProfileId!.trim());
    if (p) return p;
  }
  return profiles[0];
}

export function pickVideoProfile(
  file: MediaProfilesFile,
  profileId?: string | null,
): ImageToVideoProfileRow {
  const { videoProfiles: profiles } = file;
  if (!profiles.length) {
    throw new Error("media-profiles.json 中图生视频 videoProfiles 为空");
  }
  if (profileId?.trim()) {
    const p = profiles.find((x) => x.id === profileId.trim());
    if (!p) throw new Error(`未知的图生视频档案 id：${profileId}`);
    return p;
  }
  if (file.defaultVideoProfileId?.trim()) {
    const p = profiles.find((x) => x.id === file.defaultVideoProfileId!.trim());
    if (p) return p;
  }
  return profiles[0];
}

export function listPublicImageProfiles(
  file: MediaProfilesFile,
): MediaImageProfilePublic[] {
  return file.imageProfiles.map((p) => ({
    id: p.id,
    vendor: p.vendor,
    label: p.label,
    driver: p.driver,
    configured: Boolean(resolveApiKeyForMediaProfile(p)),
    modelLine:
      p.model?.trim() ??
      (p.driver === "openai_dalle3" ? "dall-e-3" : undefined),
  }));
}

export function listPublicVideoProfiles(
  file: MediaProfilesFile,
): MediaVideoProfilePublic[] {
  return file.videoProfiles.map((p) => ({
    id: p.id,
    vendor: p.vendor,
    label: p.label,
    driver: p.driver,
    model: p.model,
    configured: Boolean(resolveApiKeyForMediaProfile(p)),
  }));
}
