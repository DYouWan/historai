import {
  loadLlmProfilesFile,
  pickProfile,
  resolveApiKeyForProfile,
} from "@/lib/llm-profiles";
import { parseStoryboardChunkMode } from "@/lib/storyboard-llm-budget";
import { generateStoryboardWithProfile } from "@/lib/storyboard-orchestrator";
import type {
  GenerationResult,
  LlmMessagesDebug,
  StoryboardSpineSnapshot,
  Tone,
  VideoDurationMin,
} from "@/lib/types";

export async function generateWithTextLlm(params: {
  profileId?: string | null;
  /** 人物向系列名称（可空） */
  seriesTitle?: string;
  sliceTitle?: string;
  sliceAngle?: string;
  subject: string;
  dynasty?: string;
  tone: Tone;
  stylePreset: string;
  videoDurationMin?: VideoDurationMin;
  /** 分块策略：auto=短片单次扩写全长、长片按档案切段；on=强制切段；off=单次扩写全长 */
  storyboardChunkMode?: string;
  /** 与 voiceoverFullTextOverride（或段落数组）同时传入时仅跑分镜扩写（L3） */
  spineSnapshot?: StoryboardSpineSnapshot | null;
  voiceoverFullTextOverride?: string | null;
  voiceoverParagraphsOverride?: string[] | null;
  /** 首次生成仅 L1+L2，确认口播后再请求扩写 */
  stopAfterVoiceover?: boolean;
  /** 首次仅 L1 叙事骨架 */
  stopAfterSpine?: boolean;
  /** 在已有叙事骨架快照上仅跑 L2 */
  generateVoiceoverOnly?: boolean;
}): Promise<{ result: GenerationResult; promptDebug: LlmMessagesDebug }> {
  const file = loadLlmProfilesFile();
  const profile = pickProfile(file, params.profileId);
  const videoDurationMin = params.videoDurationMin ?? 1;
  const chunkMode = parseStoryboardChunkMode(params.storyboardChunkMode);

  const raw =
    typeof params.seriesTitle === "string" ? params.seriesTitle.trim() : "";
  const seriesNormalized = raw || undefined;

  const promptParams = {
    seriesTitle: seriesNormalized,
    sliceTitle: params.sliceTitle,
    sliceAngle: params.sliceAngle,
    subject: params.subject,
    dynasty: params.dynasty,
    tone: params.tone,
    stylePreset: params.stylePreset,
    videoDurationMin,
    profileId: params.profileId,
  };

  const key = resolveApiKeyForProfile(profile);
  if (!key?.trim()) {
    throw new Error(
      `当前模型档案「${profile.label}」未配置密钥：请在环境变量 ${profile.apiKeyEnv} 中设置 API Key，或改用已配置的档案。`,
    );
  }

  return generateStoryboardWithProfile({
    profile,
    apiKey: key,
    params: promptParams,
    videoDurationMin,
    chunkMode,
    spineSnapshot: params.spineSnapshot ?? undefined,
    voiceoverFullTextOverride: params.voiceoverFullTextOverride ?? undefined,
    voiceoverParagraphsOverride: params.voiceoverParagraphsOverride ?? undefined,
    stopAfterVoiceover: params.stopAfterVoiceover === true,
    stopAfterSpine: params.stopAfterSpine === true,
    generateVoiceoverOnly: params.generateVoiceoverOnly === true,
  });
}
