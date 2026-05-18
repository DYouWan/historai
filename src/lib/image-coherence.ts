import type { ImageProfileDriver } from "@/lib/media-profiles";
import {
  COVER_ANIME_HISTORICAL_APPEARANCE_FALLBACK,
  buildStandaloneCoverLeadAnimeHistorical,
} from "@/lib/prompts/cover-prompts-anime-historical";
import {
  COVER_ANIME_MODERN_APPEARANCE_FALLBACK,
  buildStandaloneCoverLeadAnimeModern,
  IMAGE_SCENE_CAST_HINT_ANIME_MODERN,
  IMAGE_TEXT_ONLY_FACE_HINT_ANIME_MODERN,
} from "@/lib/prompts/cover-prompts-anime-modern";
import {
  anchorSubjectLabelForImage,
  buildPortraitCoverPromptSnippet,
  buildDynastyLineBackground,
  buildDynastyLineNarrative,
  buildDynastyLineShort,
  buildFollowSceneImg2ImgLead,
  buildFollowSceneTextOnlyLead,
  buildProtagonistLineSimple,
  buildScene1OpeningPrompt,
  buildStandaloneCoverLead,
  COVER_NO_TEXT_BLOCK,
  coverStyleSnippetNoText,
  IMAGE_REF_FACE_HOLD_PREFIX,
  IMAGE_REF_IDENTITY_ONLY_HINT,
  IMAGE_REF_SCENE_ADJUST_SUFFIX,
  IMAGE_SCENE_BOARD_LABEL,
  IMAGE_SCENE_CAST_HINT,
  IMAGE_TEXT_ONLY_FACE_HINT,
  narrationCoherenceSnippet,
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
 * - **standaloneCover**：仅外宣封面图（切片意象），与正片镜 1 脱钩；人物居左、虚化环境背景、右侧/上方叠字负空间。
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
  /** 独立封面：人物形象描述（与画风预设一并约束出图） */
  subjectAppearance?: string | null;
  /** 同镜下一关键帧：允许在 sceneIndex===1 时仍使用参考图（前一关键帧） */
  forceIntraShotReference?: boolean;
  driver: ImageProfileDriver;
}): ImageCoherencePlan {
  const name = anchorSubjectLabelForImage(args.subject);
  const dynasty = args.dynasty?.trim() ?? "";
  const style = args.stylePreset;
  const sceneCastHint =
    style === "anime_modern" ? IMAGE_SCENE_CAST_HINT_ANIME_MODERN : IMAGE_SCENE_CAST_HINT;
  const textOnlyFaceHint =
    style === "anime_modern" ? IMAGE_TEXT_ONLY_FACE_HINT_ANIME_MODERN : IMAGE_TEXT_ONLY_FACE_HINT;
  const snippet = STYLE_SNIPPET[style];
  const anchorZh = STYLE_ANCHOR_ZH[style];
  const visual = args.visualDescription.trim();
  const narrLine = narrationCoherenceSnippet(args.narration);

  const useReferenceImage = Boolean(
    args.referenceImageUrl?.trim() &&
      driverSupportsReferenceImage(args.driver) &&
      (args.forceIntraShotReference === true || args.sceneIndex > 1),
  );

  if (args.standaloneCover) {
    const appearanceRaw = args.subjectAppearance?.trim() ?? "";
    const appearanceFallback =
      style === "anime_modern"
        ? COVER_ANIME_MODERN_APPEARANCE_FALLBACK
        : COVER_ANIME_HISTORICAL_APPEARANCE_FALLBACK;
    const appearance = appearanceRaw || appearanceFallback;
    const coverLead =
      style === "anime_modern"
        ? buildStandaloneCoverLeadAnimeModern(false)
        : style === "anime"
          ? buildStandaloneCoverLeadAnimeHistorical(false)
          : buildStandaloneCoverLead(false);
    const coverBaseSnippet = buildPortraitCoverPromptSnippet({
      subject: args.subject,
      subjectAppearance: appearance,
      dynasty: args.dynasty,
      stylePreset: style,
    });
    const fullPrompt = [
      coverLead,
      COVER_NO_TEXT_BLOCK,
      coverBaseSnippet,
      COVER_NO_TEXT_BLOCK,
      `【造型锚点】${anchorZh}`,
      `【画风】${coverStyleSnippetNoText(snippet)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      sceneRole: "cover",
      referenceRole: null,
      useReferenceImage: false,
      fullPrompt,
    };
  }

  if (args.sceneIndex === 1) {
    if (useReferenceImage && args.forceIntraShotReference) {
      const refLabel = "本镜上一关键帧";
      const fullPrompt = [
        `【第 1 镜｜同镜关键帧递进·图生图】参考图为${refLabel}。${IMAGE_REF_FACE_HOLD_PREFIX}`,
        IMAGE_REF_SCENE_ADJUST_SUFFIX,
        IMAGE_REF_IDENTITY_ONLY_HINT,
        `主角姓名/称谓：「${name}」。`,
        dynasty ? buildDynastyLineBackground(dynasty) : "",
        `【造型锚点】${anchorZh}`,
        `【画风】${snippet}`,
        narrLine,
        IMAGE_SCENE_BOARD_LABEL,
        sceneCastHint,
        visual,
      ].join(" ");

      return {
        sceneRole: "follow",
        referenceRole: args.referenceRole ?? "previous",
        useReferenceImage: true,
        fullPrompt,
      };
    }

    const fullPrompt = [
      buildScene1OpeningPrompt(),
      buildProtagonistLineSimple(name),
      dynasty ? buildDynastyLineNarrative(dynasty) : "",
      `【造型锚点】${anchorZh}`,
      `【画风】${snippet}`,
      narrLine,
      IMAGE_SCENE_BOARD_LABEL,
      sceneCastHint,
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
      sceneCastHint,
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
    `${buildProtagonistLineSimple(name)}${textOnlyFaceHint}`,
    dynasty ? buildDynastyLineShort(dynasty) : "",
    `【造型锚点】${anchorZh}`,
    `【画风】${snippet}`,
    narrLine,
    IMAGE_SCENE_BOARD_LABEL,
    sceneCastHint,
    visual,
  ].join(" ");

  return {
    sceneRole: "follow",
    referenceRole: args.referenceRole ?? null,
    useReferenceImage: false,
    fullPrompt,
  };
}
