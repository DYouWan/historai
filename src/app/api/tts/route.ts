import {
  getIflytekTtsEnv,
  getVolcengineTtsEnv,
  synthesizeIflytekTts,
  synthesizeVolcengineTts,
} from "@/lib/tts-providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/tts
 * Body: { provider: "volcengine" | "iflytek", text: string, voiceType?: string, vcn?: string }
 * Returns: { provider, mimeType, audioBase64 }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      provider?: string;
      text?: string;
      voiceType?: string;
      vcn?: string;
      cluster?: string;
    };

    const provider = body.provider?.trim().toLowerCase();
    const text = typeof body.text === "string" ? body.text : "";
    if (!provider || (provider !== "volcengine" && provider !== "iflytek")) {
      return NextResponse.json(
        { error: "provider 须为 volcengine 或 iflytek" },
        { status: 400 },
      );
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "text 不能为空" }, { status: 400 });
    }

    if (provider === "volcengine") {
      const env = getVolcengineTtsEnv();
      if (!env) {
        return NextResponse.json(
          {
            error:
              "未配置火山 TTS：请设置 VOLCENGINE_TTS_ACCESS_TOKEN（或 VOLCENGINE_TTS_TOKEN）与 VOLCENGINE_TTS_APP_ID",
          },
          { status: 503 },
        );
      }
      const voiceType =
        body.voiceType?.trim() || env.voiceType || undefined;
      const cluster = body.cluster?.trim() || env.cluster || undefined;
      const { buffer, mimeType } = await synthesizeVolcengineTts({
        accessToken: env.accessToken,
        appId: env.appId,
        text,
        voiceType,
        cluster,
      });
      return NextResponse.json({
        provider: "volcengine",
        mimeType,
        audioBase64: buffer.toString("base64"),
      });
    }

    const env = getIflytekTtsEnv();
    if (!env) {
      return NextResponse.json(
        {
          error:
            "未配置讯飞 TTS：请设置 IFLYTEK_TTS_APP_ID、IFLYTEK_TTS_API_KEY、IFLYTEK_TTS_API_SECRET",
        },
        { status: 503 },
      );
    }
    const vcn = body.vcn?.trim() || env.vcn || undefined;
    const { buffer, mimeType } = await synthesizeIflytekTts({
      appId: env.appId,
      apiKey: env.apiKey,
      apiSecret: env.apiSecret,
      text,
      vcn,
    });
    return NextResponse.json({
      provider: "iflytek",
      mimeType,
      audioBase64: buffer.toString("base64"),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "TTS 合成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
