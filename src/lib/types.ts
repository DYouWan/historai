/** 与 MVP 清单对齐的共享类型 */

export type Tone = "serious" | "narrative";

/** 叙事目标时长（分钟）：决定主生成提示中的镜数与总时长硬约束 */
export type VideoDurationMin = 1 | 3 | 5 | 8 | 10 | 12 | 15;

/** 流水线未完成阶段：仅有 L1 待整稿；已有整稿待 L3 */
export type StoryboardPipelinePending = "voiceover" | "scenes";

/** L1 故事弧：里程碑 + 唯一高峰 + 收束 */
export interface StoryArcMilestone {
  label?: string;
  intent: string;
  sceneRange?: string;
  sources?: string[];
}

export interface StoryArc {
  milestones: StoryArcMilestone[];
  peak: {
    label: string;
    intent: string;
    sceneRange?: string;
    sources?: string[];
  };
  closing: string;
}

/** L1 附件：发布前核对 */
export interface ReviewChecklist {
  factsToVerify: string[];
  publishCautions?: string | null;
}

export interface StoryboardScene {
  index: number;
  visualDescription: string;
  narration: string;
  durationSec: number;
}

/** L1 镜序表单条；与整稿口播按镜对齐 */
export interface SceneSkeletonEntry {
  index: number;
  beat: string;
  durationSec: number;
}

/** 客户端带回：L2 仅生成口播或 L3 按稿扩写时提交 L1 快照 */
export interface StoryboardSpineSnapshot {
  storyArc: StoryArc;
  sceneSkeleton: SceneSkeletonEntry[];
  reviewChecklist: ReviewChecklist;
}

export interface GenerationResult {
  storyArc: StoryArc;
  scenes: StoryboardScene[];
  reviewChecklist: ReviewChecklist;
  voiceoverFullText: string;
  voiceoverParagraphs: string[];
  sceneSkeleton: SceneSkeletonEntry[];
  /**
   * voiceover：仅有 L1，待 L2；
   * scenes：已有整稿，待 L3（scenes 仍为空）。
   * 有分镜后应为 undefined。
   */
  pipelinePending?: StoryboardPipelinePending;
  provider: "llm";
  llmProfile?: {
    id: string;
    vendor: string;
    label: string;
    model: string;
  };
}

/** 分块 / 叙事骨架等多阶段请求中的一步（用于调试面板） */
export interface LlmDebugPhase {
  phase: string;
  system: string;
  user: string;
  model: string;
  chatCompletionsUrl: string;
  temperature: number;
  usesJsonResponseFormat: boolean;
  maxTokens?: number;
  assistantRaw?: string;
}

/** 与 OpenAI 兼容接口对应的 messages 预览（不含密钥） */
export interface LlmMessagesDebug {
  system: string;
  user: string;
  model: string;
  chatCompletionsUrl: string;
  temperature: number;
  usesJsonResponseFormat: boolean;
  /** DeepSeek V4：请求体 thinking.type=disabled */
  thinkingDisabled?: boolean;
  assistantRaw?: string;
  phases?: LlmDebugPhase[];
  storyboardStrategy?: string;
}

export interface AssetJob {
  sceneIndex: number;
  status: "idle" | "queued" | "running" | "success" | "failed";
  imageUrl?: string;
  error?: string;
  provider: "openai";
}

export type StylePreset = "anime" | "anime_modern" | "cinematic";

export interface PeakTopicSuggestion {
  peakTitle: string;
  peakDescription: string;
}

export interface CharacterSuggestion {
  name: string;
  appearance: string;
  dynasty: string;
}
