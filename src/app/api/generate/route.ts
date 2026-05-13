import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import { generateWithTextLlm } from "@/lib/text-llm";
import type {
  StylePreset,
  StoryboardSpineSnapshot,
  Tone,
} from "@/lib/types";
import { parseStoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { parseVideoDurationMin } from "@/lib/video-duration";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      sliceTitle?: string;
      sliceAngle?: string;
      subject: string;
      dynasty?: string;
      tone?: Tone;
      stylePreset?: StylePreset;
      /** 叙事目标时长（分钟）：1 / 3 / 5 / 8 / 10 / 12 / 15 */
      videoDurationMin?: number;
      /** 分块：auto | on | off（仅影响 L3 切段；全流程均含叙事骨架+整稿口播） */
      storyboardChunkMode?: string;
      spineSnapshot?: StoryboardSpineSnapshot;
      voiceoverFullTextOverride?: string;
      voiceoverParagraphsOverride?: string[];
      /** 为 true 且非「仅扩写」请求时，只生成到整稿口播（L1+L2） */
      stopAfterVoiceover?: boolean;
      /** 仅 L1 叙事骨架 */
      stopAfterSpine?: boolean;
      /** 仅 L2：须带 spineSnapshot */
      generateVoiceoverOnly?: boolean;
    };

    if (!body.subject?.trim()) {
      return NextResponse.json(
        { error: "请填写人物/主题（subject）" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }

    const videoDurationMin = parseVideoDurationMin(body.videoDurationMin);
    const storyboardChunkMode = parseStoryboardChunkMode(
      body.storyboardChunkMode,
    );

    const rawSeries =
      typeof body.seriesTitle === "string" ? body.seriesTitle.trim() : "";
    const seriesTitle = rawSeries || undefined;

    const regenerateFromVoiceover =
      body.spineSnapshot != null &&
      (Boolean(body.voiceoverFullTextOverride?.trim()) ||
        (body.voiceoverParagraphsOverride?.length ?? 0) > 0);

    const { result, promptDebug } = await generateWithTextLlm({
      profileId: body.profileId,
      seriesTitle,
      sliceTitle: body.sliceTitle,
      sliceAngle: body.sliceAngle,
      subject: body.subject.trim(),
      dynasty: body.dynasty?.trim(),
      tone: body.tone ?? "narrative",
      stylePreset: body.stylePreset ?? "ink",
      videoDurationMin,
      storyboardChunkMode,
      spineSnapshot: body.spineSnapshot,
      voiceoverFullTextOverride: body.voiceoverFullTextOverride,
      voiceoverParagraphsOverride: body.voiceoverParagraphsOverride,
      stopAfterVoiceover: body.stopAfterVoiceover === true,
      stopAfterSpine: body.stopAfterSpine === true,
      generateVoiceoverOnly: body.generateVoiceoverOnly === true,
      llmRequestId: requestId,
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/generate",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        subject: body.subject.trim(),
        seriesTitle: seriesTitle ?? null,
        videoDurationMin,
        storyboardChunkMode,
        provider: result.provider,
        regenerateFromVoiceover,
        stopAfterVoiceover: body.stopAfterVoiceover === true,
        stopAfterSpine: body.stopAfterSpine === true,
        generateVoiceoverOnly: body.generateVoiceoverOnly === true,
        pipelinePending: result.pipelinePending ?? null,
      },
    });

    return NextResponse.json(result, {
      headers: llmRequestIdHeaders(requestId),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成失败";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: llmRequestIdHeaders(requestId) },
    );
  }
}
