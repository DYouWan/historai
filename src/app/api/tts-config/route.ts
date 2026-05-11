import {
  getIflytekTtsEnv,
  getVolcengineTtsEnv,
} from "@/lib/tts-providers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/tts-config
 * 是否已配置服务端密钥（不返回任何密钥内容）。
 */
export async function GET() {
  return NextResponse.json({
    volcengine: getVolcengineTtsEnv() != null,
    iflytek: getIflytekTtsEnv() != null,
  });
}
