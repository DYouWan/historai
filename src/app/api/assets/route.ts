import { appendMediaDebugLog, sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import { generateSceneImage } from "@/lib/text-to-image";
import type { StylePreset } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AssetsBody = {
  sceneIndex: number;
  visualDescription: string;
  /** 独立外宣封面：须 sceneIndex=0；不依赖正片镜 1 的 visual */
  standaloneCover?: boolean;
  /** 封面底图（镜号 1）：系列／切片标题／切片说明；画面不含内嵌文字；说明优先 */
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  sliceAngle?: string | null;
  /** 与本镜画面一并写入文生图提示，约束与口播实体对齐 */
  narration?: string | null;
  stylePreset?: StylePreset;
  projectSeed?: string;
  imageProfileId?: string | null;
  subject?: string | null;
  dynasty?: string | null;
  referenceImageUrl?: string | null;
  referenceRole?: "previous" | "cover" | null;
};

export async function POST(req: Request) {
  let body: AssetsBody | undefined;
  try {
    body = (await req.json()) as AssetsBody;
  } catch {
    await appendMediaDebugLog({
      kind: "image",
      route: "POST /api/assets",
      status: "error",
      meta: { phase: "parse_json", error: "请求体非合法 JSON" },
    });
    return NextResponse.json({ error: "请求无效" }, { status: 400 });
  }

  try {
    if (body.standaloneCover) {
      if (body.sceneIndex !== 0) {
        return NextResponse.json(
          { error: "独立封面须 sceneIndex 为 0" },
          { status: 400 },
        );
      }
    } else if (body.sceneIndex === 0) {
      return NextResponse.json(
        { error: "sceneIndex 0 仅用于独立封面（standaloneCover: true）" },
        { status: 400 },
      );
    } else if (!body.visualDescription?.trim()) {
      return NextResponse.json({ error: "缺少画面描述" }, { status: 400 });
    }

    const seed =
      body.projectSeed?.trim() ||
      `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const out = await generateSceneImage({
      sceneIndex: body.sceneIndex,
      visualDescription: body.visualDescription,
      standaloneCover: Boolean(body.standaloneCover),
      seriesTitle: body.seriesTitle?.trim() || undefined,
      sliceTitle: body.sliceTitle?.trim() || undefined,
      sliceAngle: body.sliceAngle?.trim() || undefined,
      narration: body.narration?.trim() || undefined,
      stylePreset: body.stylePreset ?? "ink",
      projectSeed: seed,
      imageProfileId: body.imageProfileId,
      subject: body.subject,
      dynasty: body.dynasty,
      referenceImageUrl: body.referenceImageUrl,
      referenceRole: body.referenceRole,
    });

    const { log, ...publicOut } = out;
    await appendMediaDebugLog({
      kind: "image",
      route: "POST /api/assets",
      status: "ok",
      meta: {
        sceneIndex: body.sceneIndex,
        standaloneCover: Boolean(body.standaloneCover),
        profileId: out.profileId,
        provider: out.provider,
        coherence: out.coherence,
        projectSeedHint: seed.length > 64 ? `${seed.slice(0, 64)}…` : seed,
        stylePreset: body.stylePreset ?? "ink",
        subjectPresent: Boolean(body.subject?.trim()),
        sliceAnglePresent: Boolean(body.sliceAngle?.trim()),
        narrationPresent: Boolean(body.narration?.trim()),
        dynastyPresent: Boolean(body.dynasty?.trim()),
        referenceRole: body.referenceRole ?? null,
        referenceInputHint: sanitizeRemoteAssetHint(
          body.referenceImageUrl?.trim() ?? "",
        ),
        ...log,
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      },
    });

    return NextResponse.json({
      ...publicOut,
      sceneIndex: body.sceneIndex,
      projectSeed: seed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成图片失败";
    await appendMediaDebugLog({
      kind: "image",
      route: "POST /api/assets",
      status: "error",
      meta: {
        sceneIndex: body?.sceneIndex,
        imageProfileId: body?.imageProfileId ?? null,
        stylePreset: body?.stylePreset,
        referenceRole: body?.referenceRole ?? null,
        referenceInputHint: body?.referenceImageUrl
          ? sanitizeRemoteAssetHint(body.referenceImageUrl)
          : "",
        error: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
