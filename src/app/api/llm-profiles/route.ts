import {
  listPublicProfiles,
  loadLlmProfilesFile,
} from "@/lib/llm-profiles";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const file = loadLlmProfilesFile();
    return NextResponse.json({
      defaultProfileId: file.defaultProfileId ?? null,
      profiles: listPublicProfiles(file),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "读取模型配置失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
