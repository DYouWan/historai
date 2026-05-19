import {
  appendLlmDebugLog,
  buildImageGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import { sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import {
  buildSliceExportFolderName,
  saveRemoteFileToSliceExports,
} from "@/lib/slice-export-fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** 拉取远程静帧可能较慢或多轮重试；部署到 Vercel 等时可避免 10s 默认上限 */
export const maxDuration = 120;

type Body = {
  imageUrl?: string;
  subject?: string;
  title?: string;
  role?: "cover" | "scene" | "face";
  sceneIndex?: number;
  fileStem?: string;
  /** 人脸定稿等单槽资源：覆盖同 stem 文件而非序号递增 */
  replaceExisting?: boolean;
};

export async function POST(req: Request) {
  const requestId = createLlmRequestId();
  const jsonHeaders = llmRequestIdHeaders(requestId);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "请求体须为 JSON" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const imageUrl = String(body.imageUrl ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const titleRaw = String(body.title ?? "").trim();
  const title = titleRaw || "未命名标题";
  const role =
    body.role === "face" ? "face"
    : body.role === "cover" ? "cover"
    : "scene";
  const sceneIndex =
    typeof body.sceneIndex === "number" && Number.isFinite(body.sceneIndex) ?
      body.sceneIndex
    : 0;

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "仅支持 http(s) 图片地址" },
      { status: 400, headers: jsonHeaders },
    );
  }
  if (!subject) {
    return NextResponse.json(
      { error: "缺少主角（人物）名称，无法创建文件夹" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const folderName = buildSliceExportFolderName(subject, title);
  const stemFromClient = String(body.fileStem ?? "").trim();
  const baseName =
    stemFromClient ?
      stemFromClient
    : role === "cover" ?
      "cover"
    : role === "face" ?
      "face"
    : `scene-img-${String(sceneIndex).padStart(2, "0")}`;

  const replaceExisting =
    body.replaceExisting === true || role === "face";

  try {
    const { relativePath } = await saveRemoteFileToSliceExports({
      cwd: process.cwd(),
      folderName,
      baseName,
      url: imageUrl,
      replaceExisting,
    });

    return NextResponse.json(
      {
        ok: true,
        relativePath,
        folder: `slice-exports/${folderName}`,
      },
      { headers: jsonHeaders },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/save-slice-image",
      meta: {
        phase: "save_remote",
        folderName,
        baseName,
        role,
        sceneIndex,
        imageUrlHint: sanitizeRemoteAssetHint(imageUrl),
        error: message,
      },
      promptDebug: buildImageGenerationPromptDebug({
        error: message,
        promptSummary: `${folderName} / ${baseName}`,
      }),
    });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: jsonHeaders },
    );
  }
}
