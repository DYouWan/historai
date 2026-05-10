import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
} from "@/lib/llm-profiles";
import { polishVoiceoverWithProfile } from "@/lib/polish-voiceover";
import type { Tone } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      profileId?: string;
      paragraphCount?: number;
      voiceoverFullText?: string;
      hook?: string;
      subject?: string;
      seriesTitle?: string;
      sliceTitle?: string;
      sliceAngle?: string;
      dynasty?: string;
      tone?: Tone;
    };

    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "请填写人物/主题（subject）" }, { status: 400 });
    }
    if (!body.voiceoverFullText?.trim()) {
      return NextResponse.json({ error: "请提供待润色的口播全文" }, { status: 400 });
    }
    const paragraphCount = Number(body.paragraphCount);
    if (!Number.isFinite(paragraphCount) || paragraphCount < 1) {
      return NextResponse.json(
        { error: "paragraphCount 须为正整数（与镜数一致）" },
        { status: 400 },
      );
    }
    if (!body.hook?.trim()) {
      return NextResponse.json({ error: "请提供 hook（用于口径与人称约束）" }, { status: 400 });
    }

    const file = loadLlmProfilesFile();
    const profile = pickProfile(file, body.profileId);
    const key = resolveApiKeyForProfile(profile);
    if (!key?.trim()) {
      throw new Error(
        `当前模型档案「${profile.label}」未配置密钥：请在环境变量 ${profile.apiKeyEnv} 中设置 API Key。`,
      );
    }

    const out = await polishVoiceoverWithProfile({
      profile,
      apiKey: key,
      paragraphCount,
      voiceoverFullText: body.voiceoverFullText.trim(),
      hook: body.hook.trim(),
      subject: body.subject.trim(),
      seriesTitle: body.seriesTitle?.trim() || undefined,
      sliceTitle: body.sliceTitle?.trim() || undefined,
      sliceAngle: body.sliceAngle?.trim() || undefined,
      dynasty: body.dynasty?.trim() || undefined,
      tone: body.tone ?? "narrative",
    });

    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "润色失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
