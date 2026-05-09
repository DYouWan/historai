import {
  buildSliceExportFolderName,
  saveRemoteFileToSliceExports,
} from "@/lib/slice-export-fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  imageUrl?: string;
  subject?: string;
  title?: string;
  role?: "cover" | "scene";
  sceneIndex?: number;
  fileStem?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const imageUrl = String(body.imageUrl ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const titleRaw = String(body.title ?? "").trim();
  const title = titleRaw || "未命名标题";
  const role = body.role === "cover" ? "cover" : "scene";
  const sceneIndex =
    typeof body.sceneIndex === "number" && Number.isFinite(body.sceneIndex) ?
      body.sceneIndex
    : 0;

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return NextResponse.json(
      { error: "仅支持 http(s) 图片地址" },
      { status: 400 },
    );
  }
  if (!subject) {
    return NextResponse.json(
      { error: "缺少主角（人物）名称，无法创建文件夹" },
      { status: 400 },
    );
  }

  const folderName = buildSliceExportFolderName(subject, title);
  const stemFromClient = String(body.fileStem ?? "").trim();
  const baseName =
    stemFromClient ?
      stemFromClient
    : role === "cover" ?
      "cover"
    : `scene-${String(sceneIndex).padStart(2, "0")}`;

  try {
    const { relativePath } = await saveRemoteFileToSliceExports({
      cwd: process.cwd(),
      folderName,
      baseName,
      url: imageUrl,
      kind: "image",
    });

    return NextResponse.json({
      ok: true,
      relativePath,
      folder: `slice-exports/${folderName}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
