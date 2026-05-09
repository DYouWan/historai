import {
  listPublicImageProfiles,
  listPublicVideoProfiles,
  loadMediaProfilesFile,
} from "@/lib/media-profiles";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const file = loadMediaProfilesFile();
    return NextResponse.json({
      defaultImageProfileId: file.defaultImageProfileId ?? null,
      defaultVideoProfileId: file.defaultVideoProfileId ?? null,
      imageProfiles: listPublicImageProfiles(file),
      videoProfiles: listPublicVideoProfiles(file),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "读取媒体模型配置失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
