import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import { generateWithTextLlm } from "@/lib/text-llm";
import type { StylePreset, Tone } from "@/lib/types";
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
      /** 成片目标时长（分钟）：1 / 3 / 5 / 8 / 10 / 15 */
      videoDurationMin?: number;
      /** 分块：auto | on | off */
      storyboardChunkMode?: string;
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
