import { appendLlmDebugLog } from "@/lib/llm-request-logger";
import {
  LlmNotConfiguredError,
  fetchAiSeriesNameSuggestions,
} from "@/lib/theme-assist-llm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      profileId?: string;
      /** 可选：给模型的方向，如「魏晋」「偏名将」 */
      hint?: string;
    };

    const hint =
      typeof body.hint === "string" ? body.hint.trim().slice(0, 120) : "";

    const { suggestion, promptDebug } = await fetchAiSeriesNameSuggestions({
      profileId: body.profileId,
      hint: hint || undefined,
    });

    await appendLlmDebugLog({
      route: "POST /api/suggest-series-names",
      promptDebug,
      meta: {
        profileId: body.profileId ?? null,
        hint: hint || null,
        suggestionLength: suggestion.length,
      },
    });

    return NextResponse.json({ suggestion });
  } catch (e) {
    if (e instanceof LlmNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
