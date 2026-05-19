import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  LlmAssistError,
  LlmNotConfiguredError,
  fetchPeakTopics,
} from "@/lib/theme-assist-llm";
import { parseVideoDurationMin } from "@/lib/video-duration";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  let profileId: string | undefined;
  let seriesTitle = "";
  let characterName = "";
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      characterName?: string;
      excludePeakTitles?: unknown;
      /** 成片目标时长（分钟），与创作中心「叙事时长」一致 */
      videoDurationMin?: unknown;
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

    const excludePeakTitles = Array.isArray(body.excludePeakTitles)
      ? body.excludePeakTitles
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .slice(0, 40)
      : [];

    const videoDurationMin = parseVideoDurationMin(body.videoDurationMin);

    const { suggestions, promptDebug } = await fetchPeakTopics({
      profileId: body.profileId,
      seriesTitle,
      characterName,
      videoDurationMin,
      ...(excludePeakTitles.length ? { excludePeakTitles } : {}),
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-peak-topics",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterName,
        suggestionCount: suggestions.length,
        excludePeakTitleCount: excludePeakTitles.length,
        videoDurationMin,
      },
    });

    return NextResponse.json(
      { suggestions },
      { headers: llmRequestIdHeaders(requestId) },
    );
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) {
      return NextResponse.json(
        { error: e.message },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    const message = e instanceof Error ? e.message : "推荐失败";
    if (e instanceof LlmAssistError && e.promptDebug) {
      await appendLlmDebugLog({
        requestId,
        route: "POST /api/suggest-peak-topics",
        promptDebug: e.promptDebug,
        meta: {
          profileId: profileId ?? null,
          seriesTitle,
          characterName,
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
