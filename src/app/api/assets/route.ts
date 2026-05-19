import { sanitizeRemoteAssetHint } from "@/lib/media-request-logger";
import {
  appendLlmDebugLog,
  buildImageGenerationPromptDebug,
  createLlmRequestId,
  llmRequestIdHeaders,
} from "@/lib/llm-request-logger";
import { generateSceneImage } from "@/lib/text-to-image";
import { normalizeStylePreset } from "@/lib/prompts/image-prompts";
import type { StylePreset } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AssetsBody = {
  sceneIndex: number;
  visualDescription: string;
  /** 独立外宣封面：须 sceneIndex=0；不依赖正片镜 1 的 visual */
  standaloneCover?: boolean;
  /** 独立人脸定稿：须 sceneIndex=0；正脸头肩锚点 */
  standaloneFace?: boolean;
  seriesTitle?: string | null;
  peakTitle?: string | null;
  peakDescription?: string | null;
  narration?: string | null;
  stylePreset?: StylePreset;
  projectSeed?: string;
  imageProfileId?: string | null;
  subject?: string | null;
  dynasty?: string | null;
  /** 独立封面：人物形象描述（与画风一并约束） */
  subjectAppearance?: string | null;
  referenceImageUrl?: string | null;
  referenceRole?: "previous" | "cover" | "face" | null;
  /** 同镜多关键帧：1 为主静图（默认），≥2 时须 sceneIndex≥1 且非独立封面 */
  keyframeIndex?: number;
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
    const standalonePortrait =
      Boolean(body.standaloneCover) || Boolean(body.standaloneFace);
    if (body.standaloneCover && body.standaloneFace) {
      return NextResponse.json(
        { error: "standaloneCover 与 standaloneFace 不可同时为 true" },
        { status: 400, headers: jsonHeaders },
      );
    }
    if (standalonePortrait) {
      if (body.sceneIndex !== 0) {
        await appendLlmDebugLog({
          requestId,
          route: "POST /api/assets",
          meta: {
            phase: "validation",
            standaloneCover: body.standaloneCover,
            standaloneFace: body.standaloneFace,
            sceneIndex: body.sceneIndex,
          },
          promptDebug: buildImageGenerationPromptDebug({
            promptSummary: body.visualDescription,
            error: "独立封面/人脸定稿须 sceneIndex 为 0",
          }),
        });
        return NextResponse.json(
          { error: "独立封面/人脸定稿须 sceneIndex 为 0" },
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
          error: "sceneIndex 0 仅用于独立封面或人脸定稿",
        }),
      });
      return NextResponse.json(
        { error: "sceneIndex 0 仅用于独立封面（standaloneCover）或人脸定稿（standaloneFace）" },
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

    let keyframeIndex = 1;
    if (!standalonePortrait) {
      const ki =
        body.keyframeIndex === undefined || body.keyframeIndex === null ?
          1
        : Math.floor(Number(body.keyframeIndex));
      if (!Number.isFinite(ki) || ki < 1 || ki > 4) {
        await appendLlmDebugLog({
          requestId,
          route: "POST /api/assets",
          meta: { phase: "validation", keyframeIndex: body.keyframeIndex },
          promptDebug: buildImageGenerationPromptDebug({
            error: "keyframeIndex 须在 1～4",
          }),
        });
        return NextResponse.json(
          { error: "keyframeIndex 须在 1～4" },
          { status: 400, headers: jsonHeaders },
        );
      }
      keyframeIndex = ki;
      if (keyframeIndex > 1 && !body.referenceImageUrl?.trim()) {
        await appendLlmDebugLog({
          requestId,
          route: "POST /api/assets",
          meta: { phase: "validation", keyframeIndex },
          promptDebug: buildImageGenerationPromptDebug({
            error: "关键帧≥2 出图须传 referenceImageUrl（同镜前一关键帧）",
          }),
        });
        return NextResponse.json(
          { error: "关键帧≥2 出图须传 referenceImageUrl（同镜前一关键帧）" },
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    const seed =
      body.projectSeed?.trim() ||
      `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const stylePreset = normalizeStylePreset(body.stylePreset);

    const out = await generateSceneImage({
      sceneIndex: body.sceneIndex,
      visualDescription: body.visualDescription,
      standaloneCover: Boolean(body.standaloneCover),
      standaloneFace: Boolean(body.standaloneFace),
      seriesTitle: body.seriesTitle?.trim() || undefined,
      peakTitle: body.peakTitle?.trim() || undefined,
      peakDescription: body.peakDescription?.trim() || undefined,
      narration: body.narration?.trim() || undefined,
      stylePreset,
      projectSeed: seed,
      imageProfileId: body.imageProfileId,
      subject: body.subject,
      dynasty: body.dynasty,
      subjectAppearance: body.subjectAppearance?.trim() || undefined,
      referenceImageUrl: body.referenceImageUrl,
      referenceRole: body.referenceRole,
      keyframeIndex,
    });

    const { log, ...publicOut } = out;

    await appendLlmDebugLog({
      requestId,
      route: "POST /api/assets",
      meta: {
        sceneIndex: body.sceneIndex,
        keyframeIndex,
        standaloneCover: Boolean(body.standaloneCover),
        standaloneFace: Boolean(body.standaloneFace),
        profileId: out.profileId,
        provider: out.provider,
        coherence: out.coherence,
        projectSeedHint: seed.length > 64 ? `${seed.slice(0, 64)}…` : seed,
        stylePreset,
        subjectPresent: Boolean(body.subject?.trim()),
        subjectAppearancePresent: Boolean(body.subjectAppearance?.trim()),
        peakDescriptionPresent: Boolean(body.peakDescription?.trim()),
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
        stylePreset: normalizeStylePreset(body?.stylePreset),
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
      { error: "生成失败" },
      { status: 500, headers: jsonHeaders },
    );
  }
}
