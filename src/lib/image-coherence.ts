import type { ImageProfileDriver } from "@/lib/media-profiles";
import {
  anchorSubjectLabelForImage,
  buildCoverBaseOnlyPromptSnippet,
  buildCoverReferenceFigureIntro,
  buildDynastyLineBackground,
  buildDynastyLineNarrative,
  buildDynastyLineShort,
  buildFollowSceneImg2ImgLead,
  buildFollowSceneTextOnlyLead,
  buildProtagonistLineCoverPrimary,
  buildProtagonistLineSimple,
  buildScene1OpeningPrompt,
  buildStandaloneCoverLead,
  IMAGE_REF_FACE_HOLD_PREFIX,
  IMAGE_REF_IDENTITY_ONLY_HINT,
  IMAGE_REF_SCENE_ADJUST_SUFFIX,
  IMAGE_SCENE_BOARD_LABEL,
  IMAGE_SCENE_CAST_HINT,
  IMAGE_TEXT_ONLY_FACE_HINT,
  narrationCoherenceSnippet,
  standaloneCoverVisualGuide,
} from "@/lib/prompts/image-coherence-prompts";
import { STYLE_ANCHOR_ZH, STYLE_SNIPPET } from "@/lib/prompts/image-prompts";
import type { StylePreset } from "@/lib/types";

export { clipNarrationForImagePrompt } from "@/lib/prompts/image-coherence-prompts";
export { STYLE_ANCHOR_ZH, STYLE_SNIPPET } from "@/lib/prompts/image-prompts";

export function driverSupportsReferenceImage(
  driver: ImageProfileDriver,
): boolean {
  return driver === "dashscope_qwen_image" || driver === "volcengine_seedream";
}

export type ImageCoherencePlan = {
  sceneRole: "cover" | "follow";
  referenceRole: "previous" | "cover" | null;
  useReferenceImage: boolean;
  /** 已拼好的完整提示词（含画风英文片 + 中文约束 + 分镜） */
  fullPrompt: string;
};

/**
 * - **standaloneCover**：仅外宣封面底图（切片意象），与正片镜 1 脱钩。
 * - **sceneIndex === 1 且非独立封面**：正片首镜，用分镜 visual + 口播，不含切片封面大块。
 * - **sceneIndex > 1**：图生图或文生跟镜。
 */
export function planImageCoherencePrompt(args: {
  sceneIndex: number;
  stylePreset: StylePreset;
  visualDescription: string;
  standaloneCover?: boolean;
  seriesTitle?: string | null;
  sliceTitle?: string | null;
  sliceAngle?: string | null;
  narration?: string | null;
  subject?: string | null;
  dynasty?: string | null;
  referenceImageUrl?: string | null;
  referenceRole?: "previous" | "cover" | null;
  driver: ImageProfileDriver;
}): ImageCoherencePlan {
  const name = anchorSubjectLabelForImage(args.subject);
  const dynasty = args.dynasty?.trim();
  const style = args.stylePreset;
  const snippet = STYLE_SNIPPET[style];
  const anchorZh = STYLE_ANCHOR_ZH[style];
  const visual = args.visualDescription.trim();
  const narrLine = narrationCoherenceSnippet(args.narration);

  const useReferenceImage = Boolean(
    args.referenceImageUrl?.trim() &&
      args.sceneIndex > 1 &&
      driverSupportsReferenceImage(args.driver),
  );

  if (args.standaloneCover) {
    const coverBaseSnippet = buildCoverBaseOnlyPromptSnippet({
      subject: args.subject,
      seriesTitle: args.seriesTitle,
      sliceTitle: args.sliceTitle,
      sliceAngle: args.sliceAngle,
    });
    const guide = standaloneCoverVisualGuide(args.stylePreset);
    const hasRef =
      Boolean(args.referenceImageUrl?.trim()) &&
      driverSupportsReferenceImage(args.driver);
    const refIntro = hasRef ? buildCoverReferenceFigureIntro() : "";

    const fullPrompt = [
      buildStandaloneCoverLead(hasRef),
      refIntro,
      buildProtagonistLineCoverPrimary(name),
      dynasty ? buildDynastyLineNarrative(dynasty) : "",
      coverBaseSnippet,
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      guide,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      sceneRole: "cover",
      referenceRole: hasRef ? "cover" : null,
      useReferenceImage: hasRef,
      fullPrompt,
    };
  }

  if (args.sceneIndex === 1) {
    const fullPrompt = [
      buildScene1OpeningPrompt(),
      buildProtagonistLineSimple(name),
      dynasty ? buildDynastyLineNarrative(dynasty) : "",
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      narrLine,
      IMAGE_SCENE_BOARD_LABEL,
      IMAGE_SCENE_CAST_HINT,
      visual,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      sceneRole: "follow",
      referenceRole: null,
      useReferenceImage: false,
      fullPrompt,
    };
  }

  if (args.sceneIndex < 2) {
    throw new Error(
      `非法 sceneIndex「${args.sceneIndex}」：正片镜须 ≥1；独立外宣封面请传 standaloneCover 且 sceneIndex 为 0`,
    );
  }

  const refLabel =
    args.referenceRole === "cover"
      ? "封面定稿首帧"
      : args.referenceRole === "previous"
        ? "上一镜成片"
        : "前序已定帧";

  if (useReferenceImage) {
    const fullPrompt = [
      buildFollowSceneImg2ImgLead(args.sceneIndex),
      `参考图为${refLabel}。${IMAGE_REF_FACE_HOLD_PREFIX}`,
      IMAGE_REF_SCENE_ADJUST_SUFFIX,
      IMAGE_REF_IDENTITY_ONLY_HINT,
      `主角姓名/称谓：「${name}」。`,
      dynasty ? buildDynastyLineBackground(dynasty) : "",
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      narrLine,
      IMAGE_SCENE_BOARD_LABEL,
      IMAGE_SCENE_CAST_HINT,
      visual,
    ].join(" ");

    return {
      sceneRole: "follow",
      referenceRole: args.referenceRole ?? null,
      useReferenceImage: true,
      fullPrompt,
    };
  }

  const fullPrompt = [
    buildFollowSceneTextOnlyLead(args.sceneIndex),
    `${buildProtagonistLineSimple(name)}${IMAGE_TEXT_ONLY_FACE_HINT}`,
    dynasty ? buildDynastyLineShort(dynasty) : "",
    `【造型锚点】${anchorZh}`,
    `【画风】${snippet}`,
    narrLine,
    IMAGE_SCENE_BOARD_LABEL,
    IMAGE_SCENE_CAST_HINT,
    visual,
  ].join(" ");

  return {
    sceneRole: "follow",
    referenceRole: args.referenceRole ?? null,
    useReferenceImage: false,
    fullPrompt,
  };
}
