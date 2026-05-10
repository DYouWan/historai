import { createHmac, randomUUID } from "crypto";
import WebSocket from "ws";

/** 火山引擎豆包语音 HTTP 非流式合成：https://www.volcengine.com/docs/6561/79820 */
const VOLCENGINE_TTS_URL =
  process.env.VOLCENGINE_TTS_URL?.trim() ||
  "https://openspeech.bytedance.com/api/v1/tts";

export type TtsMimeType = "audio/mpeg" | "application/octet-stream";

export interface VolcengineTtsParams {
  accessToken: string;
  appId: string;
  text: string;
  /** 控制台集群名，默认 volcano_tts */
  cluster?: string;
  /** 音色，如 BV700_streaming，以控制台为准 */
  voiceType?: string;
  encoding?: "mp3" | "pcm" | "wav";
}

export interface IflytekTtsParams {
  appId: string;
  apiKey: string;
  apiSecret: string;
  text: string;
  /** 发音人，控制台开通的音库 id */
  vcn?: string;
  speed?: number;
  volume?: number;
  pitch?: number;
}

function trimErr(t: string, max = 500) {
  return t.replace(/\s+/g, " ").slice(0, max);
}

export async function synthesizeVolcengineTts(
  params: VolcengineTtsParams,
): Promise<{ buffer: Buffer; mimeType: TtsMimeType }> {
  const token = params.accessToken.trim();
  const appId = params.appId.trim();
  if (!token || !appId) {
    throw new Error("火山 TTS：缺少 accessToken 或 appId");
  }
  const text = params.text.trim();
  if (!text) throw new Error("火山 TTS：文本为空");

  const cluster = params.cluster?.trim() || "volcano_tts";
  const voiceType = params.voiceType?.trim() || "BV700_streaming";
  const encoding = params.encoding ?? "mp3";

  const body = {
    app: {
      appid: appId,
      token: token,
      cluster,
    },
    user: { uid: "historai" },
    audio: {
      voice_type: voiceType,
      encoding,
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid: randomUUID(),
      text,
      text_type: "plain",
      operation: "query",
    },
  };

  const res = await fetch(VOLCENGINE_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer;${token}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      `火山 TTS 返回非 JSON（${res.status}）：${trimErr(raw)}`,
    );
  }

  const obj = json as Record<string, unknown>;
  const code = obj.code;
  if (code !== undefined && code !== 0 && code !== 3000) {
    const msg = typeof obj.message === "string" ? obj.message : String(code);
    throw new Error(`火山 TTS 失败：${msg}`);
  }

  let b64: string | undefined;
  if (typeof obj.data === "string") b64 = obj.data;
  else if (obj.data && typeof obj.data === "object") {
    const d = obj.data as Record<string, unknown>;
    if (typeof d.audio === "string") b64 = d.audio;
  }

  if (!b64) {
    throw new Error(
      `火山 TTS 响应无音频字段（${res.status}）：${trimErr(raw)}`,
    );
  }

  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) throw new Error("火山 TTS：解码后音频为空");

  const mimeType: TtsMimeType =
    encoding === "mp3" ? "audio/mpeg" : "application/octet-stream";
  return { buffer, mimeType };
}

function buildIflytekWsUrl(apiKey: string, apiSecret: string): string {
  const hostUrl = "wss://tts-api.xfyun.cn/v2/tts";
  const ul = new URL(hostUrl);
  const date = new Date().toUTCString();
  const host = ul.host;
  const path = ul.pathname || "/";
  const requestLine = `GET ${path} HTTP/1.1`;

  const signatureOrigin = [`host: ${host}`, `date: ${date}`, requestLine].join(
    "\n",
  );

  const signature = createHmac("sha256", apiSecret)
    .update(signatureOrigin)
    .digest("base64");

  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString(
    "base64",
  );

  const q = new URLSearchParams({
    authorization,
    date,
    host,
  });
  return `${hostUrl}?${q.toString()}`;
}

/** 讯飞在线语音合成流式 WebSocket：https://www.xfyun.cn/doc/tts/online_tts/API.html */
export async function synthesizeIflytekTts(
  params: IflytekTtsParams,
): Promise<{ buffer: Buffer; mimeType: TtsMimeType }> {
  const appId = params.appId.trim();
  const apiKey = params.apiKey.trim();
  const apiSecret = params.apiSecret.trim();
  if (!appId || !apiKey || !apiSecret) {
    throw new Error("讯飞 TTS：缺少 appId、apiKey 或 apiSecret");
  }

  const text = params.text.trim();
  if (!text) throw new Error("讯飞 TTS：文本为空");

  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes >= 8000) {
    throw new Error(
      "讯飞 TTS：单次文本须小于 8000 字节（约 2000 汉字），请分段调用",
    );
  }

  const vcn = params.vcn?.trim() || "xiaoyan";
  const url = buildIflytekWsUrl(apiKey, apiSecret);
  const textB64 = Buffer.from(text, "utf8").toString("base64");

  const payload = {
    common: { app_id: appId },
    business: {
      aue: "lame",
      sfl: 1,
      auf: "audio/L16;rate=16000",
      vcn,
      speed: params.speed ?? 50,
      volume: params.volume ?? 50,
      pitch: params.pitch ?? 50,
      tte: "UTF8",
    },
    data: {
      status: 2,
      text: textB64,
    },
  };

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ws = new WebSocket(url);
    const timeoutMs = 120_000;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("讯飞 TTS：连接超时"));
    }, timeoutMs);

    const done = (err?: Error, buf?: Buffer) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else if (buf) resolve({ buffer: buf, mimeType: "audio/mpeg" });
    };

    ws.on("error", (e) => {
      done(e instanceof Error ? e : new Error(String(e)));
    });

    ws.on("message", (data) => {
      const s = typeof data === "string" ? data : data.toString("utf8");
      let j: {
        code?: number;
        message?: string;
        data?: { audio?: string; status?: number } | null;
      };
      try {
        j = JSON.parse(s) as typeof j;
      } catch {
        return;
      }

      if (j.code !== undefined && j.code !== 0) {
        done(new Error(j.message || `讯飞错误码 ${j.code}`));
        return;
      }

      const aud = j.data?.audio;
      if (aud) chunks.push(Buffer.from(aud, "base64"));

      if (j.data?.status === 2) {
        const out = Buffer.concat(chunks);
        if (!out.length) {
          done(new Error("讯飞 TTS：未收到音频数据"));
          return;
        }
        done(undefined, out);
      }
    });

    ws.on("open", () => {
      ws.send(JSON.stringify(payload));
    });
  });
}

export function getVolcengineTtsEnv(): {
  accessToken: string;
  appId: string;
  cluster?: string;
  voiceType?: string;
} | null {
  const accessToken =
    process.env.VOLCENGINE_TTS_ACCESS_TOKEN?.trim() ||
    process.env.VOLCENGINE_TTS_TOKEN?.trim() ||
    "";
  const appId = process.env.VOLCENGINE_TTS_APP_ID?.trim() || "";
  if (!accessToken || !appId) return null;
  return {
    accessToken,
    appId,
    cluster: process.env.VOLCENGINE_TTS_CLUSTER?.trim() || undefined,
    voiceType: process.env.VOLCENGINE_TTS_VOICE_TYPE?.trim() || undefined,
  };
}

export function getIflytekTtsEnv(): {
  appId: string;
  apiKey: string;
  apiSecret: string;
  vcn?: string;
} | null {
  const appId = process.env.IFLYTEK_TTS_APP_ID?.trim() || "";
  const apiKey = process.env.IFLYTEK_TTS_API_KEY?.trim() || "";
  const apiSecret = process.env.IFLYTEK_TTS_API_SECRET?.trim() || "";
  if (!appId || !apiKey || !apiSecret) return null;
  return {
    appId,
    apiKey,
    apiSecret,
    vcn: process.env.IFLYTEK_TTS_VCN?.trim() || undefined,
  };
}
