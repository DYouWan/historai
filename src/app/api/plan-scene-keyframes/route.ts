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
import { planSceneKeyframesWithProfile } from "@/lib/scene-keyframe-plan";
import type { StoryboardScene } from "@/lib/types";
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
      peakTitle?: string;
      peakDescription?: string;
      scene?: Partial<StoryboardScene>;
      preserveFirstKeyframe?: boolean;
    };

    if (!body.subject?.trim()) {
      return NextResponse.json(
        { error: "请填写主角（人物）" },
        { status: 400, headers: jsonHeaders },
      );
    }
    const s = body.scene;
    if (
      !s ||
      typeof s.index !== "number" ||
      !Number.isFinite(s.index) ||
      typeof s.visualDescription !== "string" ||
      !s.visualDescription.trim()
    ) {
      return NextResponse.json(
        { error: "scene 须含 index 与非空 visualDescription" },
        { status: 400, headers: jsonHeaders },
      );
    }

    const scene: StoryboardScene = {
      index: s.index,
      visualDescription: s.visualDescription.trim(),
      narration: String(s.narration ?? "").trim(),
      durationSec:
        Number.isFinite(s.durationSec) ?
          Math.min(60, Math.max(2, Number(s.durationSec)))
        : 6,
    };

    const file = loadLlmProfilesFile();
    const profile = pickProfile(file, body.profileId);
    const key = resolveApiKeyForProfile(profile);
    if (!key?.trim()) {
      throw new Error(
        `当前模型档案「${profile.label}」未配置密钥：请在环境变量 ${profile.apiKeyEnv} 中设置 API Key。`,
      );
    }

    const plan = await planSceneKeyframesWithProfile({
      profile,
      apiKey: key,
      scene,
      subject: body.subject.trim(),
      dynasty: body.dynasty?.trim() || undefined,
      seriesTitle: body.seriesTitle?.trim() || undefined,
      peakTitle: body.peakTitle?.trim() || undefined,
      peakDescription: body.peakDescription?.trim() || undefined,
      preserveFirstKeyframe: Boolean(body.preserveFirstKeyframe),
      llmRequestId: requestId,
    });

    return NextResponse.json({ plan }, { headers: jsonHeaders });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "关键帧规划失败";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/plan-scene-keyframes",
      meta: { phase: "handler_error", error: message },
      promptDebug: buildImageGenerationPromptDebug({ error: message }),
    });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: jsonHeaders },
    );
  }
}
