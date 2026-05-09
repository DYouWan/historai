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
  /** 分块策略：auto=按档案阈值；on=强制分块；off=强制单次 */
  storyboardChunkMode?: string;
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
  });
}
