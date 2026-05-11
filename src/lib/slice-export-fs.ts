import { mkdir, readdir, unlink, writeFile } from "fs/promises";
import path from "path";

export const SLICE_EXPORT_ROOT = "slice-exports";

const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const AUD_EXT = new Set([".mp3", ".wav", ".m4a", ".aac"]);

export function sanitizeExportSegment(s: string, max: number): string {
  const t = s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return t || "untitled";
}

export function buildSliceExportFolderName(
  subject: string,
  title: string,
): string {
  const folderTitle = title.trim() || "未命名标题";
  return `${sanitizeExportSegment(subject.trim(), 48)}_${sanitizeExportSegment(folderTitle, 80)}`;
}

function extFromImageResponse(
  contentType: string | null,
  imageUrl: string,
): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  const u = imageUrl.split("?")[0].toLowerCase();
  if (u.endsWith(".png")) return ".png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return ".jpg";
  if (u.endsWith(".webp")) return ".webp";
  if (u.endsWith(".gif")) return ".gif";
  return ".png";
}

export function extFromAudioMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("wav")) return ".wav";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("mp4") || m.includes("audio/mp4")) return ".m4a";
  if (m.includes("aac")) return ".aac";
  return ".mp3";
}

/** 文件名无扩展名部分相对 stem：stem → v1，stem-2 → v2 */
function parseVersionedStem(
  fileNameWithoutExt: string,
  stem: string,
): number | null {
  if (fileNameWithoutExt === stem) return 1;
  if (fileNameWithoutExt.startsWith(`${stem}-`)) {
    const rest = fileNameWithoutExt.slice(stem.length + 1);
    if (/^\d+$/.test(rest)) return parseInt(rest, 10);
  }
  return null;
}

/**
 * 列出目录下与 stem 规则匹配的所有版本（按版本号升序），便于 manifest 多版本与人工挑选。
 */
export async function listVersionedExportFiles(
  cwd: string,
  folderName: string,
  stem: string,
): Promise<Array<{ relativePath: string; version: number }>> {
  const safeStem = sanitizeExportSegment(stem, 96);
  const dir = path.join(cwd, SLICE_EXPORT_ROOT, folderName);
  const allowed = IMG_EXT;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: Array<{ relativePath: string; version: number }> = [];
  for (const f of entries) {
    const { name, ext } = path.parse(f);
    if (!allowed.has(ext.toLowerCase())) continue;
    const v = parseVersionedStem(name, safeStem);
    if (v == null) continue;
    const rel = path
      .relative(cwd, path.join(dir, f))
      .split(path.sep)
      .join("/");
    out.push({ relativePath: rel, version: v });
  }
  out.sort((a, b) => a.version - b.version);
  return out;
}

export async function findLatestVersionedExportFile(
  cwd: string,
  folderName: string,
  stem: string,
): Promise<{ relativePath: string; version: number } | null> {
  const list = await listVersionedExportFiles(cwd, folderName, stem);
  return list.length ? list[list.length - 1]! : null;
}

/**
 * 与同 stem 规则的音频版本（mp3/wav/m4a/aac），与静帧 stem 一致、扩展名区分类型。
 */
export async function listVersionedAudioExportFiles(
  cwd: string,
  folderName: string,
  stem: string,
): Promise<Array<{ relativePath: string; version: number }>> {
  const safeStem = sanitizeExportSegment(stem, 96);
  const dir = path.join(cwd, SLICE_EXPORT_ROOT, folderName);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: Array<{ relativePath: string; version: number }> = [];
  for (const f of entries) {
    const { name, ext } = path.parse(f);
    if (!AUD_EXT.has(ext.toLowerCase())) continue;
    const v = parseVersionedStem(name, safeStem);
    if (v == null) continue;
    const rel = path
      .relative(cwd, path.join(dir, f))
      .split(path.sep)
      .join("/");
    out.push({ relativePath: rel, version: v });
  }
  out.sort((a, b) => a.version - b.version);
  return out;
}

/**
 * 下一版落盘路径：首版 `stem.ext`，已占用则 `stem-2.ext`、`stem-3.ext`…
 */
async function resolveNextVersionedOutPath(
  dir: string,
  safeStem: string,
  ext: string,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    entries = [];
  }
  const occupied = new Set<number>();
  for (const f of entries) {
    const { name, ext: e } = path.parse(f);
    if (e.toLowerCase() !== ext.toLowerCase()) continue;
    const v = parseVersionedStem(name, safeStem);
    if (v != null) occupied.add(v);
  }
  let n = 1;
  while (occupied.has(n)) n += 1;
  if (n === 1) return path.join(dir, `${safeStem}${ext}`);
  return path.join(dir, `${safeStem}-${n}${ext}`);
}

/**
 * 将远程 http(s) 资源写入 `slice-exports/{folderName}/`，与已有同 stem 文件冲突时序号 +1，不覆盖。
 */
export async function saveRemoteFileToSliceExports(params: {
  cwd: string;
  folderName: string;
  baseName: string;
  url: string;
}): Promise<{ relativePath: string; fileName: string }> {
  const { cwd, folderName, baseName, url } = params;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("仅支持 http(s) 地址");
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) {
    throw new Error(`拉取失败：HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) {
    throw new Error("文件数据异常");
  }

  const ext = extFromImageResponse(res.headers.get("content-type"), url);

  const safeStem = sanitizeExportSegment(baseName, 96);
  const dir = path.join(cwd, SLICE_EXPORT_ROOT, folderName);
  const outPath = await resolveNextVersionedOutPath(dir, safeStem, ext);

  await writeFile(outPath, buf);
  const relativePath = path
    .relative(cwd, outPath)
    .split(path.sep)
    .join("/");
  const fileName = path.basename(outPath);
  return { relativePath, fileName };
}

/**
 * 将口播等音频二进制写入 `slice-exports/{folderName}/`，与封面保存目录一致；同 stem 已占用则序号 +1。
 */
export async function saveAudioBufferToSliceExports(params: {
  cwd: string;
  folderName: string;
  baseName: string;
  buffer: Buffer;
  mimeType?: string;
}): Promise<{ relativePath: string; fileName: string }> {
  const { cwd, folderName, baseName, buffer } = params;
  if (buffer.length < 16) {
    throw new Error("音频数据异常");
  }
  const ext = extFromAudioMime(params.mimeType ?? "audio/mpeg");
  if (!AUD_EXT.has(ext.toLowerCase())) {
    throw new Error(`不支持的音频扩展名：${ext}`);
  }
  const safeStem = sanitizeExportSegment(baseName, 96);
  const dir = path.join(cwd, SLICE_EXPORT_ROOT, folderName);
  const outPath = await resolveNextVersionedOutPath(dir, safeStem, ext);
  await writeFile(outPath, buffer);
  const relativePath = path
    .relative(cwd, outPath)
    .split(path.sep)
    .join("/");
  const fileName = path.basename(outPath);
  return { relativePath, fileName };
}

/**
 * 删除 `slice-exports/` 下已落盘的单个文件（仅文件，禁止目录与路径穿越）。
 * 目标不存在时视为已成功（幂等）。
 */
export async function deleteSliceExportFile(
  cwd: string,
  relativePath: string,
): Promise<void> {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error("非法路径");
  }

  const abs = path.normalize(path.join(cwd, ...normalized.split("/")));
  const root = path.normalize(path.join(cwd, SLICE_EXPORT_ROOT));
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("仅允许删除 slice-exports 目录内的文件");
  }

  try {
    await unlink(abs);
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ?
        (e as NodeJS.ErrnoException).code
      : undefined;
    if (code === "ENOENT") return;
    throw e;
  }
}
