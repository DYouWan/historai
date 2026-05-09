import {
  loadMediaProfilesFile,
  pickVideoProfile,
  resolveApiKeyForMediaProfile,
  type ImageToVideoProfileRow,
} from "@/lib/media-profiles";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function trimApiError(t: string, max = 400) {
  return t.replace(/\s+/g, " ").slice(0, max);
}

function unwrapVolcTaskPayload(json: unknown): Record<string, unknown> {
  if (json && typeof json === "object" && "data" in json) {
    const d = (json as { data: unknown }).data;
    if (d && typeof d === "object") return d as Record<string, unknown>;
  }
  return json as Record<string, unknown>;
}

async function volcengineSeedanceI2V(params: {
  apiKey: string;
  profile: ImageToVideoProfileRow;
  imageUrl: string;
  prompt: string;
}): Promise<string> {
  const base = params.profile.baseUrl.replace(/\/+$/, "");
  const createUrl = `${base}/contents/generations/tasks`;
  const duration = Math.min(
    15,
    Math.max(4, Math.round(params.profile.durationSec ?? 5)),
  );
  const body = {
    model: params.profile.model,
    content: [
      {
        type: "image_url",
        image_url: { url: params.imageUrl },
      },
      {
        type: "text",
        text: params.prompt.slice(0, 2000) || "Subtle natural motion, cinematic",
      },
    ],
    resolution: params.profile.resolution ?? "1080p",
    ratio: params.profile.ratio ?? "16:9",
    duration,
    watermark: params.profile.watermark === true,
  };

  const post = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const postText = await post.text();
  let postJson: unknown;
  try {
    postJson = JSON.parse(postText);
  } catch {
    throw new Error(
      `Seedance 创建任务返回非 JSON（${post.status}）：${trimApiError(postText)}`,
    );
  }
  const created = unwrapVolcTaskPayload(postJson) as {
    id?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!post.ok || created.error) {
    const msg = created.error?.message ?? created.message ?? postText;
    throw new Error(`Seedance 创建任务失败（${post.status}）：${trimApiError(String(msg))}`);
  }
  const taskId = created.id;
  if (!taskId) throw new Error("Seedance 未返回任务 id");

  const pollUrl = `${base}/contents/generations/tasks/${encodeURIComponent(taskId)}`;
  let delayMs = 10_000;
  const deadline = Date.now() + 15 * 60_000;

  while (Date.now() < deadline) {
    await sleep(delayMs);
    const get = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${params.apiKey}` },
    });
    const getText = await get.text();
    let getJson: unknown;
    try {
      getJson = JSON.parse(getText);
    } catch {
      delayMs = Math.min(delayMs + 2000, 60_000);
      continue;
    }
    const task = unwrapVolcTaskPayload(getJson) as {
      status?: string;
      content?: { video_url?: string };
      error?: { message?: string };
    };
    const st = task.status;
    if (st === "succeeded") {
      const v = task.content?.video_url;
      if (!v) throw new Error("Seedance 成功但未返回 video_url");
      return v;
    }
    if (st === "failed" || st === "expired" || st === "cancelled") {
      const msg = task.error?.message ?? st;
      throw new Error(`Seedance 任务结束：${msg}`);
    }
    delayMs = Math.min(delayMs + 2000, 60_000);
  }
  throw new Error("Seedance 轮询超时（15 分钟），可稍后凭任务 id 再查");
}

async function happyhorseI2V(params: {
  apiKey: string;
  profile: ImageToVideoProfileRow;
  imageUrl: string;
  prompt: string;
}): Promise<string> {
  const base = params.profile.baseUrl.replace(/\/+$/, "");
  const duration = Math.min(
    15,
    Math.max(3, Math.round(params.profile.durationSec ?? 5)),
  );
  const genRes = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.profile.model,
      prompt: params.prompt.slice(0, 2500) || undefined,
      mode: params.profile.mode ?? "std",
      duration,
      aspect_ratio: params.profile.aspectRatio ?? "16:9",
      image_urls: [params.imageUrl],
      sound: params.profile.sound !== false,
    }),
  });
  const genText = await genRes.text();
  let genJson: unknown;
  try {
    genJson = JSON.parse(genText);
  } catch {
    throw new Error(
      `HappyHorse 创建任务返回非 JSON（${genRes.status}）：${trimApiError(genText)}`,
    );
  }
  const gj = genJson as {
    code?: number;
    message?: string;
    data?: { task_id?: string };
  };
  if (!genRes.ok || gj.code !== 200) {
    throw new Error(
      `HappyHorse 创建任务失败（${genRes.status}）：${trimApiError(gj.message ?? genText)}`,
    );
  }
  const taskId = gj.data?.task_id;
  if (!taskId) throw new Error("HappyHorse 未返回 task_id");

  let delayMs = 9000;
  const deadline = Date.now() + 15 * 60_000;

  while (Date.now() < deadline) {
    await sleep(delayMs);
    const stRes = await fetch(
      `${base}/api/status?task_id=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${params.apiKey}` } },
    );
    if (stRes.status === 429) {
      delayMs = Math.min(delayMs + 4000, 30_000);
      continue;
    }
    const stText = await stRes.text();
    let stJson: unknown;
    try {
      stJson = JSON.parse(stText);
    } catch {
      delayMs = Math.min(delayMs + 2000, 20_000);
      continue;
    }
    const sj = stJson as {
      code?: number;
      message?: string;
      data?: {
        status?: string;
        response?: { resultUrls?: string[] };
        error_message?: string | null;
      };
    };
    if (!stRes.ok || sj.code !== 200) {
      throw new Error(
        `HappyHorse 查询状态失败（${stRes.status}）：${trimApiError(sj.message ?? stText)}`,
      );
    }
    const task = sj.data;
    const status = task?.status;
    if (status === "SUCCESS") {
      const u = task?.response?.resultUrls?.[0];
      if (!u) throw new Error("HappyHorse 成功但未返回视频 URL");
      return u;
    }
    if (status === "FAILED") {
      throw new Error(task?.error_message ?? "HappyHorse 生成失败");
    }
    delayMs = Math.min(delayMs + 2000, 20_000);
  }
  throw new Error("HappyHorse 轮询超时（15 分钟）");
}

export async function generateImageToVideo(params: {
  imageUrl: string;
  prompt: string;
  videoProfileId?: string | null;
}): Promise<{ url: string; provider: string; profileId: string }> {
  const file = loadMediaProfilesFile();
  const profile = pickVideoProfile(file, params.videoProfileId);
  const apiKey = resolveApiKeyForMediaProfile(profile);
  if (!apiKey) {
    throw new Error(
      `请配置环境变量 ${profile.apiKeyEnv.trim()} 以使用「${profile.label}」生成视频。`,
    );
  }
  if (!params.imageUrl?.trim()) {
    throw new Error("图生视频需要可访问的图片 URL");
  }

  let url: string;
  switch (profile.driver) {
    case "volcengine_seedance":
      url = await volcengineSeedanceI2V({
        apiKey,
        profile,
        imageUrl: params.imageUrl.trim(),
        prompt: params.prompt.trim(),
      });
      break;
    case "happyhorse":
      url = await happyhorseI2V({
        apiKey,
        profile,
        imageUrl: params.imageUrl.trim(),
        prompt: params.prompt.trim(),
      });
      break;
    default:
      throw new Error(`未实现的图生视频 driver：${(profile as ImageToVideoProfileRow).driver}`);
  }

  return {
    url,
    provider: profile.driver,
    profileId: profile.id,
  };
}
