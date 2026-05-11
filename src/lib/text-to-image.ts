import {
  driverSupportsReferenceImage,
  planImageCoherencePrompt,
} from "@/lib/image-coherence";
import type { ImageProfileDriver } from "@/lib/media-profiles";
import {
  loadMediaProfilesFile,
  pickImageProfile,
  resolveApiKeyForMediaProfile,
  type TextToImageProfileRow,
} from "@/lib/media-profiles";
import type { StylePreset } from "@/lib/types";

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647;
}

function trimApiError(t: string, max = 400) {
  return t.replace(/\s+/g, " ").slice(0, max);
}

/**
 * 写入可读日志（`.llm-read.md`）的 prompt 摘要：须覆盖末尾「本镜口播」「本镜分镜画面」等，避免仅截前 500 字时误判「未用镜 1 visual」。
 */
function summarizePromptForLog(full: string): string {
  const softMax = 3200;
  if (full.length <= softMax) return full;
  const head = 1800;
  const tail = 1300;
  const omit = full.length - head - tail;
  if (omit <= 0) return full.slice(0, softMax);
  return `${full.slice(0, head)}\n\n…（省略 ${omit} 字）…\n\n${full.slice(-tail)}`;
}

async function openaiDalle3(params: {
  apiKey: string;
  prompt: string;
  size?: string;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: params.prompt.slice(0, 3800),
      n: 1,
      size: params.size ?? "1792x1024",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI 图像失败（${res.status}）：${trimApiError(t)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ url?: string }>;
  };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error("OpenAI 未返回图像 URL");
  return url;
}

async function dashscopeQwenMultimodal(params: {
  apiKey: string;
  profile: TextToImageProfileRow;
  fullPrompt: string;
  projectSeed: string;
  sceneIndex: number;
  referenceImageUrl?: string | null;
}): Promise<string> {
  const url = params.profile.generationUrl!.trim();
  const model = params.profile.model!.trim();
  const content: Array<{ text?: string; image?: string }> = [];
  if (params.referenceImageUrl?.trim()) {
    content.push({ image: params.referenceImageUrl.trim() });
  }
  content.push({ text: params.fullPrompt.slice(0, 800) });

  const body = {
    model,
    input: {
      messages: [{ role: "user", content }],
    },
    parameters: {
      negative_prompt:
        params.profile.negativePrompt ??
        "low resolution, worst quality, malformed hands, blurry text, wrong identity, face swap",
      prompt_extend: params.profile.promptExtend !== false,
      watermark: params.profile.watermark === true,
      size: params.profile.size ?? "1080*1920",
      n: 1,
      seed: seedFromString(
        `${params.projectSeed}|scene|${params.sceneIndex}`,
      ),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(`DashScope 返回非 JSON（${res.status}）：${trimApiError(rawText)}`);
  }
  const j = json as {
    code?: string;
    message?: string;
    output?: {
      choices?: Array<{
        message?: { content?: Array<{ image?: string }> };
      }>;
    };
  };
  if (!res.ok || j.code || !j.output) {
    const msg = j.message ?? rawText;
    throw new Error(
      `DashScope 图像失败（${res.status}${j.code ? ` · ${j.code}` : ""}）：${trimApiError(String(msg))}`,
    );
  }
  const img = j.output?.choices?.[0]?.message?.content?.[0]?.image;
  if (!img) throw new Error("DashScope 响应中未找到图像 URL");
  return img;
}

async function volcengineSeedream(params: {
  apiKey: string;
  profile: TextToImageProfileRow;
  fullPrompt: string;
  referenceImageUrl?: string | null;
}): Promise<string> {
  const base = params.profile.baseUrl!.replace(/\/+$/, "");
  const endpoint = `${base}/images/generations`;
  const body: Record<string, unknown> = {
    model: params.profile.model,
    prompt: params.fullPrompt.slice(0, 2000),
    size: params.profile.size ?? "1440x2560",
    response_format: params.profile.responseFormat ?? "url",
    watermark: params.profile.watermark === true,
    n: 1,
    sequential_image_generation: "disabled",
  };
  if (params.referenceImageUrl?.trim()) {
    body.image = params.referenceImageUrl.trim();
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error(`火山方舟图像返回非 JSON（${res.status}）：${trimApiError(rawText)}`);
  }
  const j = json as {
    error?: { message?: string; code?: string };
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  if (!res.ok || j.error) {
    const msg = j.error?.message ?? rawText;
    throw new Error(
      `火山方舟图像失败（${res.status}）：${trimApiError(String(msg))}`,
    );
  }
  const row = j.data?.[0];
  if (row?.url) return row.url;
  if (row?.b64_json) {
    return `data:image/png;base64,${row.b64_json}`;
  }
  throw new Error("火山方舟未返回图像 url 或 b64_json");
}

export type GenerateSceneImageParams = {
  sceneIndex: number;
  visualDescription: string;
  /** 仅出独立外宣封面（sceneIndex 应为 0）；与正片镜 1 脱钩 */
  standaloneCover?: boolean;
  /** 封面底图：系列／切片标题／切片说明（说明优先，无内嵌字） */
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  sliceAngle?: string | null;
  /** 本镜口播，与 visual 一并写入文生图 prompt，约束声画实体一致 */
  narration?: string | null;
  stylePreset: StylePreset;
  projectSeed: string;
  imageProfileId?: string | null;
  /** 人物/对象，用于封面定锚与连贯提示 */
  subject?: string | null;
  dynasty?: string | null;
  /** 公网可访问的参考图 URL（上一镜或封面）；镜号>1 且模型支持时启用图生图 */
  referenceImageUrl?: string | null;
  /** 供提示词与回包说明：reference 来自上一镜还是封面兜底 */
  referenceRole?: "previous" | "cover" | null;
};

export type GenerateSceneImageResult = {
  url: string;
  provider: string;
  profileId: string;
  coherence: {
    sceneRole: "cover" | "follow";
    referenceApplied: boolean;
    referenceRole: "previous" | "cover" | null;
  };
  /** 供 logs 记录，不含密钥 */
  log: {
    driver: string;
    model?: string;
    promptSummary: string;
    promptCharCount: number;
    referenceImagePassedToVendor: boolean;
  };
};

export async function generateSceneImage(
  params: GenerateSceneImageParams,
): Promise<GenerateSceneImageResult> {
  const file = loadMediaProfilesFile();
  const profile = pickImageProfile(file, params.imageProfileId);
  const apiKey = resolveApiKeyForMediaProfile(profile);
  if (!apiKey) {
    throw new Error(
      `请配置环境变量 ${profile.apiKeyEnv.trim()} 以使用「${profile.label}」生成图像。`,
    );
  }

  const driver = profile.driver as ImageProfileDriver;
  const plan = planImageCoherencePrompt({
    sceneIndex: params.sceneIndex,
    stylePreset: params.stylePreset,
    visualDescription: params.visualDescription,
    standaloneCover: params.standaloneCover,
    seriesTitle: params.seriesTitle,
    sliceTitle: params.sliceTitle,
    sliceAngle: params.sliceAngle,
    narration: params.narration,
    subject: params.subject,
    dynasty: params.dynasty,
    referenceImageUrl: params.referenceImageUrl,
    referenceRole: params.referenceRole,
    driver,
  });

  const refUrl =
    plan.useReferenceImage && driverSupportsReferenceImage(driver)
      ? params.referenceImageUrl?.trim() ?? null
      : null;

  if (
    params.standaloneCover &&
    params.referenceImageUrl?.trim() &&
    !refUrl
  ) {
    throw new Error(
      "「按参考图重生封面」需要当前文生图档案支持图生图（如通义万相、火山 Seedream）。OpenAI DALL·E 等纯文生图无法使用上传的参考图，请在页顶切换档案。",
    );
  }

  let url: string;
  switch (profile.driver) {
    case "openai_dalle3":
      url = await openaiDalle3({
        apiKey,
        prompt: plan.fullPrompt,
        size: profile.size,
      });
      break;
    case "dashscope_qwen_image":
      url = await dashscopeQwenMultimodal({
        apiKey,
        profile,
        fullPrompt: plan.fullPrompt,
        projectSeed: params.projectSeed,
        sceneIndex: params.sceneIndex,
        referenceImageUrl: refUrl,
      });
      break;
    case "volcengine_seedream":
      url = await volcengineSeedream({
        apiKey,
        profile,
        fullPrompt: plan.fullPrompt,
        referenceImageUrl: refUrl,
      });
      break;
    default:
      throw new Error(`未实现的文生图 driver：${(profile as TextToImageProfileRow).driver}`);
  }

  const full = plan.fullPrompt;
  return {
    url,
    provider: profile.driver,
    profileId: profile.id,
    coherence: {
      sceneRole: plan.sceneRole,
      referenceApplied: Boolean(refUrl),
      referenceRole: plan.referenceRole,
    },
    log: {
      driver: profile.driver,
      model: profile.model?.trim() || undefined,
      promptSummary: summarizePromptForLog(full),
      promptCharCount: full.length,
      referenceImagePassedToVendor: Boolean(refUrl),
    },
  };
}
