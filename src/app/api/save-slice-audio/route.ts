import {
  buildSliceExportFolderName,
  saveAudioBufferToSliceExports,
} from "@/lib/slice-export-fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  subject?: string;
  title?: string;
  audioBase64?: string;
  mimeType?: string;
  fileStem?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const titleRaw = String(body.title ?? "").trim();
  const title = titleRaw || "未命名标题";
  const b64 = String(body.audioBase64 ?? "").trim();
  const mimeType = String(body.mimeType ?? "audio/mpeg").trim();
  const fileStem = String(body.fileStem ?? "").trim() || "voiceover";

  if (!subject) {
    return NextResponse.json(
      { error: "缺少主角（人物）名称，无法与封面使用同一导出文件夹" },
      { status: 400 },
    );
  }
  if (!b64) {
    return NextResponse.json({ error: "缺少音频数据" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return NextResponse.json({ error: "音频 Base64 无效" }, { status: 400 });
  }

  const folderName = buildSliceExportFolderName(subject, title);

  try {
    const { relativePath, fileName } = await saveAudioBufferToSliceExports({
      cwd: process.cwd(),
      folderName,
      baseName: fileStem,
      buffer,
      mimeType,
    });

    return NextResponse.json({
      ok: true,
      relativePath,
      fileName,
      folder: `slice-exports/${folderName}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
