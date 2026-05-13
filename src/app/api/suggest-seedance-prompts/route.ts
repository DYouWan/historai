import {
  appendLlmDebugLog,
  buildImageGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
} from "@/lib/llm-profiles";
import {
  generateSeedancePromptsWithProfile,
  type SeedancePromptSceneInput,
} from "@/lib/seedance-scene-prompts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  const jsonHeaders = llmRequestIdHeaders(requestId);
  try {
    const body = (await req.json()) as {
      profileId?: string;
      subject?: string;
      dynasty?: string;
      seriesTitle?: string;
      sliceTitle?: string;
      sliceAngle?: string;
      hook?: string;
      scenes?: SeedancePromptSceneInput[];
    };

    if (!body.subject?.trim()) {
      return NextResponse.json(
        { error: "请填写主角（人物）" },
        { status: 400, headers: jsonHeaders },
      );
    }
    const scenes = Array.isArray(body.scenes) ? body.scenes : [];
    if (!scenes.length) {
      return NextResponse.json(
        { error: "scenes 不能为空" },
        { status: 400, headers: jsonHeaders },
      );
    }
    for (const s of scenes) {
      if (
        !Number.isFinite(s.index) ||
        typeof s.visualDescription !== "string" ||
        !s.visualDescription.trim()
      ) {
        return NextResponse.json(
          { error: "每条 scene 须含 index 与非空 visualDescription" },
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    const file = loadLlmProfilesFile();
    const profile = pickProfile(file, body.profileId);
    const key = resolveApiKeyForProfile(profile);
    if (!key?.trim()) {
      throw new Error(
        `当前模型档案「${profile.label}」未配置密钥：请在环境变量 ${profile.apiKeyEnv} 中设置 API Key。`,
      );
    }

    const prompts = await generateSeedancePromptsWithProfile({
      profile,
      apiKey: key,
      scenes: scenes.map((s) => ({
        index: s.index,
        visualDescription: s.visualDescription.trim(),
        narration:
          typeof s.narration === "string" ? s.narration.trim() : "",
        durationSec:
          Number.isFinite(s.durationSec) ? Number(s.durationSec) : 0,
      })),
      subject: body.subject.trim(),
      dynasty: body.dynasty?.trim() || undefined,
      seriesTitle: body.seriesTitle?.trim() || undefined,
      sliceTitle: body.sliceTitle?.trim() || undefined,
      sliceAngle: body.sliceAngle?.trim() || undefined,
      hook: body.hook?.trim() || undefined,
      llmRequestId: requestId,
    });

    return NextResponse.json({ prompts }, { headers: jsonHeaders });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Seedance 文案生成失败";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-seedance-prompts",
      meta: { phase: "handler_error", error: message },
      promptDebug: buildImageGenerationPromptDebug({ error: message }),
    });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: jsonHeaders },
    );
  }
}
