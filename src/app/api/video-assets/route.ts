import {
  appendLlmDebugLog,
  buildVideoGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import { generateImageToVideo } from "@/lib/image-to-video";
import { sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type VideoAssetsBody = {
  sceneIndex?: number;
  imageUrl?: string;
  prompt?: string;
  videoProfileId?: string | null;
};

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  const jsonHeaders = llmRequestIdHeaders(requestId);

  let body: VideoAssetsBody | undefined;
  try {
    body = (await req.json()) as VideoAssetsBody;
  } catch {
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/video-assets",
      meta: { phase: "parse_json" },
      promptDebug: buildVideoGenerationPromptDebug({
        error: "请求体非合法 JSON",
      }),
    });
    return NextResponse.json(
      { error: "请求无效" },
      { status: 400, headers: jsonHeaders },
    );
  }

  try {
    if (!body.imageUrl?.trim()) {
      await appendLlmDebugLog({
        requestId,
        route: "POST /api/video-assets",
        meta: { phase: "validation" },
        promptDebug: buildVideoGenerationPromptDebug({
          promptSummary: body.prompt?.trim(),
          error: "缺少 imageUrl",
        }),
      });
      return NextResponse.json(
        { error: "缺少 imageUrl" },
        { status: 400, headers: jsonHeaders },
      );
    }

    const prompt = body.prompt?.trim() ?? "";
    const imageTrimmed = body.imageUrl.trim();
    const imageUrlHint = sanitizeRemoteAssetHint(imageTrimmed);

    const out = await generateImageToVideo({
      imageUrl: imageTrimmed,
      prompt,
      videoProfileId: body.videoProfileId,
    });

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/video-assets",
      meta: {
        sceneIndex: body.sceneIndex ?? 0,
        profileId: out.profileId,
        provider: out.provider,
        promptCharCount: prompt.length,
        imageUrlHint,
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      },
      promptDebug: buildVideoGenerationPromptDebug({
        provider: out.provider,
        promptSummary: prompt,
        promptCharCount: prompt.length,
        imageUrlHint,
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      }),
    });

    return NextResponse.json(
      {
        ...out,
        sceneIndex: body.sceneIndex ?? 0,
      },
      { headers: jsonHeaders },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成视频失败";
    const imageHint = body?.imageUrl
      ? sanitizeRemoteAssetHint(body.imageUrl)
      : "";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/video-assets",
      meta: {
        sceneIndex: body?.sceneIndex,
        videoProfileId: body?.videoProfileId ?? null,
        imageUrlHint: imageHint,
        error: message,
      },
      promptDebug: buildVideoGenerationPromptDebug({
        promptSummary: body?.prompt?.trim(),
        imageUrlHint: imageHint,
        error: message,
      }),
    });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: jsonHeaders },
    );
  }
}
