/** 与 MVP 清单对齐的共享类型 */

export type Tone = "serious" | "narrative";

/** 成片目标时长（分钟）：决定主生成提示中的镜数与总时长硬约束 */
export type VideoDurationMin = 1 | 3 | 5 | 8 | 10 | 15;

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

export interface GenerationResult {
  hook: string;
  timeline: TimelineBeat[];
  scenes: StoryboardScene[];
  factNotes: string[];
  complianceNote?: string;
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

/** 分块 / 脊柱等多阶段请求中的一步（用于调试面板） */
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
