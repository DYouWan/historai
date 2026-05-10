import { sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import {
  appendLlmDebugLog,
  buildImageGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
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
  const requestId = createLlmRequestId();
  const jsonHeaders = llmRequestIdHeaders(requestId);

  let body: AssetsBody | undefined;
  try {
    body = (await req.json()) as AssetsBody;
  } catch {
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/assets",
      meta: { phase: "parse_json" },
      promptDebug: buildImageGenerationPromptDebug({
        error: "请求体非合法 JSON",
      }),
    });
    return NextResponse.json(
      { error: "请求无效" },
      { status: 400, headers: jsonHeaders },
    );
  }

  try {
    if (body.standaloneCover) {
      if (body.sceneIndex !== 0) {
        await appendLlmDebugLog({
          requestId,
          route: "POST /api/assets",
          meta: {
            phase: "validation",
            standaloneCover: true,
            sceneIndex: body.sceneIndex,
          },
          promptDebug: buildImageGenerationPromptDebug({
            promptSummary: body.visualDescription,
            error: "独立封面须 sceneIndex 为 0",
          }),
        });
        return NextResponse.json(
          { error: "独立封面须 sceneIndex 为 0" },
          { status: 400, headers: jsonHeaders },
        );
      }
    } else if (body.sceneIndex === 0) {
      await appendLlmDebugLog({
        requestId,
        route: "POST /api/assets",
        meta: { phase: "validation", sceneIndex: 0 },
        promptDebug: buildImageGenerationPromptDebug({
          promptSummary: body.visualDescription,
          error: "sceneIndex 0 仅用于独立封面（standaloneCover: true）",
        }),
      });
      return NextResponse.json(
        { error: "sceneIndex 0 仅用于独立封面（standaloneCover: true）" },
        { status: 400, headers: jsonHeaders },
      );
    } else if (!body.visualDescription?.trim()) {
      await appendLlmDebugLog({
        requestId,
        route: "POST /api/assets",
        meta: { phase: "validation", sceneIndex: body.sceneIndex },
        promptDebug: buildImageGenerationPromptDebug({
          error: "缺少画面描述",
        }),
      });
      return NextResponse.json(
        { error: "缺少画面描述" },
        { status: 400, headers: jsonHeaders },
      );
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

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/assets",
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
        driver: log.driver,
        model: log.model,
        promptCharCount: log.promptCharCount,
        referenceImagePassedToVendor: log.referenceImagePassedToVendor,
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      },
      promptDebug: buildImageGenerationPromptDebug({
        driver: log.driver,
        model: log.model,
        promptSummary: log.promptSummary,
        promptCharCount: log.promptCharCount,
        referenceImagePassedToVendor: log.referenceImagePassedToVendor,
        resultUrlHint: sanitizeRemoteAssetHint(out.url),
      }),
    });

    return NextResponse.json(
      {
        ...publicOut,
        sceneIndex: body.sceneIndex,
        projectSeed: seed,
      },
      { headers: jsonHeaders },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成图片失败";
    await appendLlmDebugLog({
      requestId,
      route: "POST /api/assets",
      meta: {
        sceneIndex: body?.sceneIndex,
        standaloneCover: Boolean(body?.standaloneCover),
        imageProfileId: body?.imageProfileId ?? null,
        stylePreset: body?.stylePreset,
        referenceRole: body?.referenceRole ?? null,
        referenceInputHint: body?.referenceImageUrl
          ? sanitizeRemoteAssetHint(body.referenceImageUrl)
          : "",
        error: message,
      },
      promptDebug: buildImageGenerationPromptDebug({
        promptSummary: body?.visualDescription,
        error: message,
      }),
    });
    return NextResponse.json(
      { error: message },
      { status: 500, headers: jsonHeaders },
    );
  }
}
