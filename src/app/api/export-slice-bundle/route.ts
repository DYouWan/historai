import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  findLatestVersionedExportFile,
  listVersionedExportFiles,
  saveRemoteFileToSliceExports,
  SLICE_EXPORT_ROOT,
} from "@/lib/slice-export-fs";
import {
  buildSliceExportBundlePayload,
  type SliceExportManifestV1,
} from "@/lib/slice-export-manifest";
import type {
  GenerationResult,
  StylePreset,
  Tone,
  VideoDurationMin,
} from "@/lib/types";
import type { StoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ExportBody = {
  projectSeed: string;
  subject: string;
  dynasty?: string;
  seriesTitle?: string;
  sliceTitle?: string;
  sliceAngle?: string;
  stylePreset: StylePreset;
  videoDurationMin: VideoDurationMin;
  storyboardChunkMode?: StoryboardChunkMode | string;
  tone: Tone;
  imageProfileId?: string;
  videoProfileId?: string;
  result: GenerationResult | null;
  coverStillUrl?: string | null;
  assets: Record<
    number,
    {
      status?: string;
      url?: string;
      videoStatus?: string;
      videoUrl?: string;
      approved?: boolean;
    }
  >;
  includeVideos?: boolean;
  /** 为 true 时忽略本地已有静帧，从当前 URL 再拉取并写入下一序号文件 */
  forceImageRefresh?: boolean;
  /** 为 true 时忽略本地已有成片视频，从当前 URL 再拉取并写入下一序号 */
  forceVideoRefresh?: boolean;
};

const posix = (p: string) => p.split(path.sep).join("/");

async function syncCoverImageCandidates(
  cwd: string,
  folderName: string,
  stem: string,
  manifest: SliceExportManifestV1,
) {
  if (!manifest.cover) return;
  const list = await listVersionedExportFiles(cwd, folderName, stem, "image");
  manifest.cover.imageFileCandidates = list.map((x) => x.relativePath);
  const latest = list.length ? list[list.length - 1]!.relativePath : null;
  if (latest) manifest.cover.imageFile = latest;
}

async function syncSceneImageCandidates(
  cwd: string,
  folderName: string,
  stem: string,
  sceneIndex: number,
  manifest: SliceExportManifestV1,
) {
  const row = manifest.scenes.find((s) => s.index === sceneIndex);
  if (!row) return;
  const list = await listVersionedExportFiles(cwd, folderName, stem, "image");
  row.imageFileCandidates = list.map((x) => x.relativePath);
  const latest = list.length ? list[list.length - 1]!.relativePath : null;
  if (latest) row.imageFile = latest;
}

async function syncSceneVideoCandidates(
  cwd: string,
  folderName: string,
  stem: string,
  sceneIndex: number,
  manifest: SliceExportManifestV1,
) {
  const row = manifest.scenes.find((s) => s.index === sceneIndex);
  if (!row) return;
  const list = await listVersionedExportFiles(cwd, folderName, stem, "video");
  row.videoFileCandidates = list.map((x) => x.relativePath);
  const latest = list.length ? list[list.length - 1]!.relativePath : null;
  if (latest) row.videoFile = latest;
}

export async function POST(req: Request) {
  let body: ExportBody;
  try {
    body = (await req.json()) as ExportBody;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  if (!subject) {
    return NextResponse.json(
      { error: "缺少主角（人物），无法创建导出目录" },
      { status: 400 },
    );
  }

  const projectSeed = String(body.projectSeed ?? "").trim();
  if (!projectSeed) {
    return NextResponse.json({ error: "缺少 projectSeed" }, { status: 400 });
  }

  const includeVideos = Boolean(body.includeVideos);
  const forceImageRefresh = Boolean(body.forceImageRefresh);
  const forceVideoRefresh = Boolean(body.forceVideoRefresh);
  const cwd = process.cwd();

  const { manifest, exportFolder, downloads, videoDownloads } =
    buildSliceExportBundlePayload({
      projectSeed,
      subject,
      dynasty: String(body.dynasty ?? ""),
      seriesTitle: String(body.seriesTitle ?? ""),
      sliceTitle: String(body.sliceTitle ?? ""),
      sliceAngle: String(body.sliceAngle ?? ""),
      stylePreset: body.stylePreset ?? "ink",
      videoDurationMin: body.videoDurationMin ?? 1,
      storyboardChunkMode: body.storyboardChunkMode ?? "auto",
      tone: body.tone ?? "narrative",
      imageProfileId: String(body.imageProfileId ?? ""),
      videoProfileId: String(body.videoProfileId ?? ""),
      result: body.result,
      coverStillUrl:
        typeof body.coverStillUrl === "string" && body.coverStillUrl.trim() ?
          body.coverStillUrl.trim()
        : null,
      assets: body.assets ?? {},
    });

  const hasVideosToPull = includeVideos && videoDownloads.length > 0;
  if (!downloads.length && !hasVideosToPull) {
    return NextResponse.json(
      {
        error:
          "当前没有可导出的资源：请先成功生成封面或分镜静帧；若仅导出视频请勾选「包含图生视频」并已出片。",
      },
      { status: 400 },
    );
  }

  const folderName = exportFolder;
  const dir = path.join(cwd, SLICE_EXPORT_ROOT, folderName);
  await mkdir(dir, { recursive: true });

  const saved: string[] = [];
  const errors: string[] = [];

  try {
    for (const d of downloads) {
      try {
        if (!forceImageRefresh) {
          const hit = await findLatestVersionedExportFile(
            cwd,
            folderName,
            d.fileStem,
            "image",
          );
          if (hit) {
            if (d.kind === "cover" && manifest.cover) {
              await syncCoverImageCandidates(
                cwd,
                folderName,
                d.fileStem,
                manifest,
              );
            }
            if (d.kind === "scene" && d.sceneIndex != null) {
              await syncSceneImageCandidates(
                cwd,
                folderName,
                d.fileStem,
                d.sceneIndex,
                manifest,
              );
            }
            continue;
          }
        }

        const { relativePath } = await saveRemoteFileToSliceExports({
          cwd,
          folderName,
          baseName: d.fileStem,
          url: d.url,
          kind: "image",
        });
        saved.push(relativePath);
        const rel = posix(relativePath);
        if (d.kind === "cover" && manifest.cover) {
          manifest.cover.imageFile = rel;
          await syncCoverImageCandidates(
            cwd,
            folderName,
            d.fileStem,
            manifest,
          );
        }
        if (d.kind === "scene" && d.sceneIndex != null) {
          const row = manifest.scenes.find((s) => s.index === d.sceneIndex);
          if (row) row.imageFile = rel;
          await syncSceneImageCandidates(
            cwd,
            folderName,
            d.fileStem,
            d.sceneIndex,
            manifest,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "未知错误";
        errors.push(
          d.kind === "cover" ? `封面：${msg}` : `镜 ${d.sceneIndex}：${msg}`,
        );
      }
    }

    if (includeVideos) {
      for (const v of videoDownloads) {
        try {
          if (!forceVideoRefresh) {
            const hit = await findLatestVersionedExportFile(
              cwd,
              folderName,
              v.fileStem,
              "video",
            );
            if (hit) {
              await syncSceneVideoCandidates(
                cwd,
                folderName,
                v.fileStem,
                v.sceneIndex,
                manifest,
              );
              continue;
            }
          }

          const { relativePath } = await saveRemoteFileToSliceExports({
            cwd,
            folderName,
            baseName: v.fileStem,
            url: v.url,
            kind: "video",
          });
          saved.push(relativePath);
          const rel = posix(relativePath);
          const row = manifest.scenes.find((s) => s.index === v.sceneIndex);
          if (row) row.videoFile = rel;
          await syncSceneVideoCandidates(
            cwd,
            folderName,
            v.fileStem,
            v.sceneIndex,
            manifest,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "未知错误";
          errors.push(`镜 ${v.sceneIndex} 视频：${msg}`);
        }
      }
    }

    const manifestPath = path.join(dir, "manifest.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );
    const manifestRel = posix(path.relative(cwd, manifestPath));
    saved.push(manifestRel);

    return NextResponse.json({
      ok: true,
      exportFolder,
      relativeRoot: manifest.relativeRoot,
      manifestPath: manifestRel,
      saved,
      incremental: true,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "导出失败";
    return NextResponse.json(
      { error: message, saved, errors },
      { status: 500 },
    );
  }
}
