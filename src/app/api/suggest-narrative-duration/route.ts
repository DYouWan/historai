import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  fetchSuggestedNarrativeDuration,
  LlmNotConfiguredError,
} from "@/lib/theme-assist-llm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      subject?: string;
      sliceTitle?: string;
      sliceAngle?: string;
      dynasty?: string;
    };

    const seriesTitle =
      typeof body.seriesTitle === "string" ? body.seriesTitle.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const sliceTitle =
      typeof body.sliceTitle === "string" ? body.sliceTitle.trim() : "";
    const sliceAngle =
      typeof body.sliceAngle === "string" ? body.sliceAngle.trim() : "";

    if (!seriesTitle) {
      return NextResponse.json(
        { error: "请先填写人物向系列名称" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    if (!subject) {
      return NextResponse.json(
        { error: "请先填写主角 / 人物" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    if (!sliceTitle || !sliceAngle) {
      return NextResponse.json(
        { error: "请先填写切片标题与切片说明（峰值切口命题）" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }

    const { videoDurationMin, rationale, promptDebug } =
      await fetchSuggestedNarrativeDuration({
        profileId: body.profileId,
        seriesTitle,
        subject,
        sliceTitle,
        sliceAngle,
        dynasty:
          typeof body.dynasty === "string" ? body.dynasty.trim() : undefined,
      });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-narrative-duration",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        subject,
        sliceTitle,
        videoDurationMin,
      },
    });

    return NextResponse.json(
      { videoDurationMin, rationale },
      { headers: llmRequestIdHeaders(requestId) },
    );
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) {
      return NextResponse.json(
        { error: e.message },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    const message = e instanceof Error ? e.message : "估算失败";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: llmRequestIdHeaders(requestId) },
    );
  }
}
