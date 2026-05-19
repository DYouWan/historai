import { callOpenAICompatibleChat } from "@/lib/chat-openai-compatible";
import type { LlmProfileRow } from "@/lib/llm-profiles";
import { appendLlmDebugLog } from "@/lib/llm-request-logger";
import { resolveChunkMaxTokens } from "@/lib/storyboard-llm-budget";
import type { StoryboardScene } from "@/lib/types";

export const MAX_KEYFRAMES_PER_SCENE = 4;
export const MIN_KEYFRAMES_PER_SCENE = 1;

/** 规划出的单关键帧：供文生图的全句画面描述（须与同镜其它帧链式连续） */
export type PlannedSceneKeyframe = {
  keyframeIndex: number;
  visualPrompt: string;
};

export type SceneKeyframePlanResult = {
  keyframeCount: number;
  keyframes: PlannedSceneKeyframe[];
};

function stripMarkdownFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(stripMarkdownFence(content)) as unknown;
  } catch {
    throw new Error("模型输出不是合法 JSON，请重试");
  }
}

export function clampKeyframeCount(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return MIN_KEYFRAMES_PER_SCENE;
  return Math.min(
    MAX_KEYFRAMES_PER_SCENE,
    Math.max(MIN_KEYFRAMES_PER_SCENE, n),
  );
}

function normalizePlan(
  scene: StoryboardScene,
  keyframeCount: number,
  kfs: PlannedSceneKeyframe[],
): SceneKeyframePlanResult {
  const K = clampKeyframeCount(keyframeCount);

  const byIdx = new Map<number, PlannedSceneKeyframe>();
  for (const row of kfs) {
    const ki = Math.floor(Number(row.keyframeIndex));
    if (!Number.isFinite(ki) || ki < 1 || ki > K) continue;
    const vp = String(row.visualPrompt ?? "").trim();
    if (!vp) continue;
    byIdx.set(ki, { keyframeIndex: ki, visualPrompt: vp });
  }

  const keyframes: PlannedSceneKeyframe[] = [];
  for (let i = 1; i <= K; i++) {
    const hit = byIdx.get(i);
    if (hit) {
      keyframes.push(hit);
    } else {
      keyframes.push({
        keyframeIndex: i,
        visualPrompt:
          i === 1 ?
            scene.visualDescription.trim()
          : `${scene.visualDescription.trim()}\n【同镜关键帧 ${i}/${K}】承接前一关键帧构图与人物，仅做机位/姿态/景别渐进变化；禁止换时空与换装。`,
      });
    }
  }

  return { keyframeCount: K, keyframes };
}

function coerceParsed(
  scene: StoryboardScene,
  root: Record<string, unknown>,
): SceneKeyframePlanResult {
  const kc = clampKeyframeCount(root.keyframeCount);
  const kfArr = Array.isArray(root.keyframes) ? root.keyframes : [];

  const kfs: PlannedSceneKeyframe[] = kfArr.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      keyframeIndex: Math.floor(Number(r.keyframeIndex)),
      visualPrompt: String(r.visualPrompt ?? "").trim(),
    };
  });

  return normalizePlan(scene, kc, kfs);
}

const PLAN_SYSTEM = `你是 HistorAI 的「镜内关键静帧」策划：在**一条口播 = 一镜**不变的前提下，为**该镜**决定需要几张**关键静帧**（K），并为每帧给出可文生图的完整中文画面描述。

【硬约束】
- keyframeCount = K，整数，**必须在 1～4**（含）。
- 同一镜内：须 **同一连续时空**，人物衣冠与主角身份与分镜 visualDescription 一致；仅允许 **景别/机位/姿态/表情** 的渐进变化，禁止无交代换地点、换昼夜、换朝代、换全套造型。
- 每帧 visualPrompt 为**完整中文画面描述**（可含镜头与氛围），须与同镜前后帧 **链式衔接**（后帧明确承接前帧画面中已有元素）。
- 输出**仅**合法 JSON，键名固定，无 Markdown 围栏。

【JSON 形状】
{
  "keyframeCount": number,
  "keyframes": [ { "keyframeIndex": number, "visualPrompt": string } ]
}`;

export async function planSceneKeyframesWithProfile(args: {
  profile: LlmProfileRow;
  apiKey: string;
  scene: StoryboardScene;
  subject: string;
  dynasty?: string;
  seriesTitle?: string;
  peakTitle?: string;
  peakDescription?: string;
  /** 为 true 时在 user 中说明关键帧 1 已有成图，规划须兼容该首帧 */
  preserveFirstKeyframe?: boolean;
  llmRequestId?: string;
}): Promise<SceneKeyframePlanResult> {
  const usesJson = args.profile.supportsJsonObject !== false;
  const cap = resolveChunkMaxTokens(args.profile);
  const scene = args.scene;
  const ctx = [
    `主角/叙事主体：${args.subject.trim()}`,
    args.dynasty?.trim() ? `时代背景：${args.dynasty.trim()}` : "",
    args.seriesTitle?.trim() ? `系列：${args.seriesTitle.trim()}` : "",
    args.peakTitle?.trim() ? `峰值标题：${args.peakTitle.trim()}` : "",
    args.peakDescription?.trim() ? `峰值说明：${args.peakDescription.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const preserve = Boolean(args.preserveFirstKeyframe);
  const user = `${ctx}

【本分镜（单镜一条口播）】
镜号：${scene.index}
durationSec：${scene.durationSec}
visualDescription：
${scene.visualDescription.trim()}
narration（口播全文，声画须一致）：
${scene.narration.trim()}

【任务】
1) 根据画面与口播体量，在 1～4 内选择 **keyframeCount = K**；若场面简单、变化少，**优先 K=1**。
2) 输出 K 条 keyframes，keyframeIndex 从 1 到 K 各出现一次。
${preserve ? "3) **关键帧 1 已有成图**：第 1 条的 visualPrompt 须与当前 visualDescription 叙事与场面一致（可略润色但勿改题），以便用户保留首帧不重画。\n" : ""}

请只输出 JSON 对象。`;

  const maxTokens = Math.min(cap, 8192);

  let raw: string;
  try {
    raw = await callOpenAICompatibleChat({
      url: args.profile.chatCompletionsUrl,
      apiKey: args.apiKey,
      model: args.profile.model,
      messages: [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: user },
      ],
      temperature: 0.35,
      maxTokens,
      responseFormatJsonObject: usesJson,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendLlmDebugLog({
      requestId: args.llmRequestId,
      route: "POST /api/plan-scene-keyframes",
      meta: { phase: "chat_failed", sceneIndex: scene.index, error: msg },
      promptDebug: {
        system: PLAN_SYSTEM,
        user,
        model: args.profile.model,
        chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
        temperature: 0.35,
        usesJsonResponseFormat: usesJson,
        assistantRaw: msg,
        storyboardStrategy: `关键帧规划 · Chat 失败 · 镜 ${scene.index}`,
      },
    });
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendLlmDebugLog({
      requestId: args.llmRequestId,
      route: "POST /api/plan-scene-keyframes",
      meta: { phase: "parse_failed", sceneIndex: scene.index, error: msg },
      promptDebug: {
        system: PLAN_SYSTEM,
        user,
        model: args.profile.model,
        chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
        temperature: 0.35,
        usesJsonResponseFormat: usesJson,
        assistantRaw: raw,
        storyboardStrategy: `关键帧规划 · JSON 失败 · 镜 ${scene.index}`,
      },
    });
    throw e;
  }

  const root = parsed as Record<string, unknown>;
  const plan = coerceParsed(scene, root);

  await appendLlmDebugLog({
    requestId: args.llmRequestId,
    route: "POST /api/plan-scene-keyframes",
    meta: {
      phase: "ok",
      sceneIndex: scene.index,
      keyframeCount: plan.keyframeCount,
    },
    promptDebug: {
      system: PLAN_SYSTEM,
      user,
      model: args.profile.model,
      chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
      temperature: 0.35,
      usesJsonResponseFormat: usesJson,
      assistantRaw: raw,
      storyboardStrategy: `关键帧规划 · K=${plan.keyframeCount} · 镜 ${scene.index}`,
    },
  });

  return plan;
}
