/**
 * 代理上传参考图到 Remit.ee（https://img.remit.ee/#upload）
 * POST /api/upload-reference-image
 * Body: { fileName: string, mimeType: string, fileSize: number, fileData: string(base64) }
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const REMIT_UPLOAD_URL = "https://img.remit.ee/api/upload";
const REMIT_ORIGIN = "https://img.remit.ee";
const MAX_BYTES = 20 * 1024 * 1024;

function normalizePublicUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return pathOrUrl.startsWith("/")
    ? `${REMIT_ORIGIN}${pathOrUrl}`
    : `${REMIT_ORIGIN}/${pathOrUrl}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, mimeType, fileSize, fileData } = body;

    if (!fileName || !mimeType || !fileSize || !fileData) {
      return NextResponse.json(
        { error: "缺少必要参数: fileName, mimeType, fileSize, fileData" },
        { status: 400 },
      );
    }

    if (typeof fileSize !== "number" || fileSize > MAX_BYTES) {
      return NextResponse.json(
        { error: `参考图单文件不超过 ${MAX_BYTES / (1024 * 1024)}MB` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(fileData, "base64");
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `参考图单文件不超过 ${MAX_BYTES / (1024 * 1024)}MB` },
        { status: 400 },
      );
    }

    const attempts = 4;
    let lastMessage = "上传到图床失败";

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([buffer], { type: mimeType }),
        fileName,
      );

      const upstream = await fetch(REMIT_UPLOAD_URL, {
        method: "POST",
        body: formData,
        headers: {
          Origin: REMIT_ORIGIN,
          Referer: `${REMIT_ORIGIN}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      });

      const raw = await upstream.text();
      let data: { success?: boolean; url?: string; message?: string; error?: string };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        lastMessage = upstream.ok ? raw.slice(0, 200) : `HTTP ${upstream.status}`;
        if (upstream.status === 503 && attempt < attempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }
        return NextResponse.json({ error: lastMessage }, { status: 502 });
      }

      if (upstream.ok && data.success && data.url) {
        const url = normalizePublicUrl(data.url);
        return NextResponse.json({ success: true, url });
      }

      lastMessage =
        data.message ||
        data.error ||
        (upstream.status === 403
          ? "图床拒绝请求（可能禁止非网页端调用），请稍后在网页上传：https://img.remit.ee/#upload"
          : `HTTP ${upstream.status}`);

      if (upstream.status === 503 && attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }

      return NextResponse.json(
        { error: lastMessage },
        { status: upstream.status >= 400 ? upstream.status : 502 },
      );
    }

    return NextResponse.json({ error: lastMessage }, { status: 502 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 },
    );
  }
}
