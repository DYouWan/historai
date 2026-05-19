import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  LlmAssistError,
  LlmNotConfiguredError,
  fetchPeakPromoCopy,
} from "@/lib/theme-assist-llm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  let profileId: string | undefined;
  let seriesTitle = "";
  let characterName = "";
  let peakTitle = "";
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      characterName?: string;
      peakTitle?: string;
      peakDescription?: string;
    };

    profileId = body.profileId;
    seriesTitle =
      typeof body.seriesTitle === "string" ? body.seriesTitle.trim() : "";
    if (!seriesTitle) {
      return NextResponse.json(
        { error: "请填写人物向系列名称" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    characterName = body.characterName?.trim() ?? "";
    if (!characterName) {
      return NextResponse.json(
        { error: "请填写或选择人物/对象" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    peakTitle = body.peakTitle?.trim() ?? "";
    if (!peakTitle) {
      return NextResponse.json(
        { error: "请先填写峰值标题" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }

    const peakDescription = body.peakDescription?.trim() || undefined;

    const { promoCopy, promptDebug } = await fetchPeakPromoCopy({
      profileId: body.profileId,
      seriesTitle,
      characterName,
      peakTitle,
      peakDescription,
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/generate-peak-promo-copy",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterName,
        peakTitle,
        hasPeakDescription: Boolean(peakDescription),
      },
    });

    return NextResponse.json(
      { promoCopy },
      { headers: llmRequestIdHeaders(requestId) },
    );
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) {
      return NextResponse.json(
        { error: e.message },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    const message = e instanceof Error ? e.message : "生成失败";
    if (e instanceof LlmAssistError && e.promptDebug) {
      await appendLlmDebugLog({
        requestId,
        route: "POST /api/generate-peak-promo-copy",
        promptDebug: e.promptDebug,
        meta: {
          profileId: profileId ?? null,
          seriesTitle,
          characterName,
          peakTitle,
          failed: true,
          error: message,
        },
      });
    }
    return NextResponse.json(
      { error: message },
      { status: 502, headers: llmRequestIdHeaders(requestId) },
    );
  }
}
