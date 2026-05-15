/**
 * 参考图 / 封面上传：火山引擎对象存储 TOS（@volcengine/tos-sdk）
 * POST /api/upload-reference-image
 * Body: { fileName: string, mimeType: string, fileSize: number, fileData: string(base64) }
 *
 * 创作中心「上传封面图」与本接口相同：上传后返回公网 URL，供 save-slice-image 拉取落盘及文生图参考链。
 *
 * 环境变量见 `src/lib/tos-reference-upload.ts`
 */

import {
  appendLlmDebugLog,
  buildImageGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import {
  resolveTosReferenceUploadEnv,
  uploadReferenceBufferViaTos,
} from "@/lib/tos-reference-upload";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const requestId = createLlmRequestId();
  const jsonHeaders = llmRequestIdHeaders(requestId);

  async function fail(
    status: number,
    publicError: string,
    meta: Record<string, unknown>,
    uploadHint: string,
  ) {
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/upload-reference-image",
      meta: { ...meta, publicError },
      promptDebug: buildImageGenerationPromptDebug({
        error: publicError,
        promptSummary: uploadHint.slice(0, 500),
      }),
    });
    return NextResponse.json(
      { error: publicError },
      { status, headers: jsonHeaders },
    );
  }

  try {
    const body = await req.json();
    const { fileName, mimeType, fileSize, fileData } = body;
    const uploadHint = `${String(fileName ?? "")} · ${String(mimeType ?? "")} · ${String(fileSize ?? "")}b`;

    if (!fileName || !mimeType || !fileSize || !fileData) {
      return await fail(
        400,
        "缺少必要参数: fileName, mimeType, fileSize, fileData",
        { phase: "validation" },
        uploadHint,
      );
    }

    if (typeof fileSize !== "number" || fileSize > MAX_BYTES) {
      return await fail(
        400,
        `参考图单文件不超过 ${MAX_BYTES / (1024 * 1024)}MB`,
        { phase: "validation", fileSize },
        uploadHint,
      );
    }

    const buffer = Buffer.from(fileData, "base64");
    if (buffer.length > MAX_BYTES) {
      return await fail(
        400,
        `参考图单文件不超过 ${MAX_BYTES / (1024 * 1024)}MB`,
        { phase: "validation", decodedBytes: buffer.length },
        uploadHint,
      );
    }

    if (!resolveTosReferenceUploadEnv()) {
      return await fail(
        503,
        "未配置火山引擎对象存储 TOS：请在环境变量中配置 VOLCENGINE_TOS_ACCESS_KEY_ID、VOLCENGINE_TOS_SECRET_ACCESS_KEY、VOLCENGINE_TOS_REGION、VOLCENGINE_TOS_BUCKET（可选 VOLCENGINE_TOS_ENDPOINT、VOLCENGINE_TOS_PUBLIC_BASE_URL、VOLCENGINE_TOS_KEY_PREFIX）。说明见 src/lib/tos-reference-upload.ts。",
        { phase: "tos_not_configured" },
        uploadHint,
      );
    }

    try {
      const { url } = await uploadReferenceBufferViaTos({
        buffer,
        mimeType: String(mimeType),
        fileName: String(fileName),
      });
      return NextResponse.json(
        { success: true, url },
        { headers: jsonHeaders },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return await fail(
        502,
        `TOS 上传失败：${msg}`,
        { phase: "tos_upload" },
        uploadHint,
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "上传失败";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/upload-reference-image",
      meta: { phase: "handler_exception", publicError: msg },
      promptDebug: buildImageGenerationPromptDebug({
        error: msg,
        promptSummary: "—",
      }),
    });
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: jsonHeaders },
    );
  }
}
