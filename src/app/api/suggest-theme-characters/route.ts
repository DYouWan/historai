import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  LlmAssistError,
  LlmNotConfiguredError,
  fetchThemeCharacters,
} from "@/lib/theme-assist-llm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  let profileId: string | undefined;
  let seriesTitle = "";
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
      excludeCharacters?: unknown;
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

    const excludeNames = Array.isArray(body.excludeCharacters)
      ? body.excludeCharacters
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .slice(0, 40)
      : [];

    const { characters, promptDebug } = await fetchThemeCharacters({
      profileId: body.profileId,
      seriesTitle,
      ...(excludeNames.length ? { excludeNames } : {}),
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-theme-characters",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterCount: characters.length,
        excludeCount: excludeNames.length,
        pipeline: "character_roster_then_appearance",
        phaseCount: promptDebug.phases?.length ?? 1,
      },
    });

    return NextResponse.json(
      { characters },
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
        route: "POST /api/suggest-theme-characters",
        promptDebug: e.promptDebug,
        meta: {
          profileId: profileId ?? null,
          seriesTitle,
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
