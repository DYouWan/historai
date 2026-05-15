import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  LlmNotConfiguredError,
  fetchCharacterSlices,
} from "@/lib/theme-assist-llm";
import { parseVideoDurationMin } from "@/lib/video-duration";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      characterName?: string;
      excludeSliceTitles?: unknown;
      /** 成片目标时长（分钟），与创作中心「叙事时长」一致 */
      videoDurationMin?: unknown;
    };

    const seriesTitle =
      typeof body.seriesTitle === "string" ? body.seriesTitle.trim() : "";
    if (!seriesTitle) {
      return NextResponse.json(
        { error: "请填写人物向系列名称" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }
    if (!body.characterName?.trim()) {
      return NextResponse.json(
        { error: "请填写或选择人物/对象" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }

    const excludeTitles = Array.isArray(body.excludeSliceTitles)
      ? body.excludeSliceTitles
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .slice(0, 40)
      : [];

    const videoDurationMin = parseVideoDurationMin(body.videoDurationMin);

    const { suggestions, promptDebug } = await fetchCharacterSlices({
      profileId: body.profileId,
      seriesTitle,
      characterName: body.characterName.trim(),
      videoDurationMin,
      ...(excludeTitles.length ? { excludeTitles } : {}),
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-character-slices",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterName: body.characterName.trim(),
        suggestionCount: suggestions.length,
        excludeTitleCount: excludeTitles.length,
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
    return NextResponse.json(
      { error: message },
      { status: 502, headers: llmRequestIdHeaders(requestId) },
    );
  }
}
