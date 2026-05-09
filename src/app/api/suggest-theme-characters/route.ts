import { appendLlmDebugLog } from "@/lib/llm-request-logger";
import {
  LlmNotConfiguredError,
  fetchThemeCharacters,
} from "@/lib/theme-assist-llm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      profileId?: string;
      seriesTitle?: string;
    };

    const seriesTitle =
      typeof body.seriesTitle === "string" ? body.seriesTitle.trim() : "";
    if (!seriesTitle) {
      return NextResponse.json(
        { error: "请填写人物向系列名称" },
        { status: 400 },
      );
    }

    const { characters, promptDebug } = await fetchThemeCharacters({
      profileId: body.profileId,
      seriesTitle,
    });

    await appendLlmDebugLog({
      route: "POST /api/suggest-theme-characters",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        seriesTitle,
        characterCount: characters.length,
      },
    });

    return NextResponse.json({ characters });
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "推荐失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
