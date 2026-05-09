import { generateImageToVideo } from "@/lib/image-to-video";
import { appendMediaDebugLog, sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type VideoAssetsBody = {
  sceneIndex?: number;
  imageUrl?: string;
  prompt?: string;
  videoProfileId?: string | null;
};

export async function POST(req: Request) {
  let body: VideoAssetsBody | undefined;
  try {
    body = (await req.json()) as VideoAssetsBody;
  } catch {
    await appendMediaDebugLog({
      kind: "video",
      route: "POST /api/video-assets",
      status: "error",
      meta: { phase: "parse_json", error: "请求体非合法 JSON" },
    });
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }

  try {
    if (!body.imageUrl?.trim()) {
      return NextResponse.json({ error: "缺少 imageUrl" }, { status: 400 });
    }

    const prompt = body.prompt?.trim() ?? "";
    const out = await generateImageToVideo({
      imageUrl: body.imageUrl.trim(),
      prompt,
      videoProfileId: body.videoProfileId,
    });

    await appendMediaDebugLog({
      kind: "video",
      route: "POST /api/video-assets",
      status: "ok",
      meta: {
        sceneIndex: body.sceneIndex ?? 0,
        profileId: out.profileId,
        provider: out.provider,
        promptSummary: prompt.slice(0, 500),
        promptCharCount: prompt.length,
        imageUrlHint: sanitizeRemoteAssetHint(body.imageUrl.trim()),
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      },
    });

    return NextResponse.json({
      ...out,
      sceneIndex: body.sceneIndex ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成视频失败";
    await appendMediaDebugLog({
      kind: "video",
      route: "POST /api/video-assets",
      status: "error",
      meta: {
        sceneIndex: body?.sceneIndex,
        videoProfileId: body?.videoProfileId ?? null,
        imageUrlHint: body?.imageUrl
          ? sanitizeRemoteAssetHint(body.imageUrl)
          : "",
        error: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
