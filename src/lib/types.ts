/** 与 MVP 清单对齐的共享类型 */

export type Tone = "serious" | "narrative";

/** 成片目标时长（分钟）：决定主生成提示中的镜数与总时长硬约束 */
export type VideoDurationMin = 1 | 3 | 5 | 8 | 10 | 15;

/** 流水线未完成阶段：仅有叙事骨架待整稿；已有整稿待分镜扩写 */
export type StoryboardPipelinePending = "voiceover" | "scenes";

export interface TimelineBeat {
  label?: string;
  text: string;
  sources: string[];
}

export interface StoryboardScene {
  index: number;
  visualDescription: string;
  narration: string;
  durationSec: number;
}

/** L1 叙事骨架单条；与整稿口播按镜对齐 */
export interface SceneSkeletonEntry {
  index: number;
  beat: string;
  durationSec: number;
}

/** 客户端带回：仅重跑分镜扩写（L3）时提交上次生成的叙事骨架快照 */
export interface StoryboardSpineSnapshot {
  hook: string;
  timeline: TimelineBeat[];
  sceneSkeleton: SceneSkeletonEntry[];
  factNotes: string[];
  complianceNote?: string | null;
}

export interface GenerationResult {
  hook: string;
  timeline: TimelineBeat[];
  scenes: StoryboardScene[];
  factNotes: string[];
  complianceNote?: string;
  /** L2 整稿口播（顺读主干）；段落之间可与 voiceoverParagraphs 用空行对应 */
  voiceoverFullText: string;
  /** 与镜号 1…N 一一对应的口播母稿段落 */
  voiceoverParagraphs: string[];
  /** L1 快照，供「按稿重出分镜」回传 */
  sceneSkeleton: SceneSkeletonEntry[];
  /**
   * voiceover：仅有 L1 叙事骨架，待生成整稿口播；
   * scenes：已有整稿，待 L3 扩写分镜（scenes 仍为空）。
   * 有分镜后应为 undefined。
   */
  pipelinePending?: StoryboardPipelinePending;
  /** 在线大模型生成结果 */
  provider: "llm";
  /** 本次生成使用的模型档案 */
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
  /** 模型返回的 assistant 正文（通常为 JSON 字符串），与 prompts 拆分前的原始一致 */
  assistantRaw?: string;
  /** 分块生成时各阶段明细（仅当阶段数 > 1 时写入，避免与根级 system/user 重复） */
  phases?: LlmDebugPhase[];
  /** 人类可读：单次 / 分块及 max_tokens 策略摘要 */
  storyboardStrategy?: string;
}

export interface AssetJob {
  sceneIndex: number;
  status: "idle" | "queued" | "running" | "success" | "failed";
  imageUrl?: string;
  error?: string;
  approved?: boolean;
  provider: "openai";
}

export type StylePreset =
  | "ink"
  | "gongbi"
  | "cinematic"
  | "docu"
  | "watercolor";

/** 创作中心「推荐切面」单条 */
export interface SliceSuggestion {
  title: string;
  angle: string;
}
