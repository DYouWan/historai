import {
  appendLlmDebugLog,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  LlmAssistError,
  LlmNotConfiguredError,
  fetchCharacterAppearance,
} from "@/lib/theme-assist-llm";
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
      dynasty?: string;
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
    characterName =
      typeof body.characterName === "string" ? body.characterName.trim() : "";
    if (!characterName) {
      return NextResponse.json(
        { error: "请填写或选择人物/对象" },
        { status: 400, headers: llmRequestIdHeaders(requestId) },
      );
    }

    const dynasty =
      typeof body.dynasty === "string" ? body.dynasty.trim() : undefined;

    const { appearance, promptDebug } = await fetchCharacterAppearance({
      profileId: body.profileId,
      seriesTitle,
      characterName,
      dynasty,
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/suggest-character-appearance",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterName,
        dynasty: dynasty ?? null,
        pipeline: "character_appearance_single",
      },
    });

    return NextResponse.json(
      { appearance },
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
        route: "POST /api/suggest-character-appearance",
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
