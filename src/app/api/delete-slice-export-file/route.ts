import { deleteSliceExportFile } from "@/lib/slice-export-fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  relativePath?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const relativePath = String(body.relativePath ?? "").trim();
  if (!relativePath) {
    return NextResponse.json({ error: "缺少 relativePath" }, { status: 400 });
  }

  try {
    await deleteSliceExportFile(process.cwd(), relativePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
