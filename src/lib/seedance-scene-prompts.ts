import { callOpenAICompatibleChat } from "@/lib/chat-openai-compatible";
import type { LlmProfileRow } from "@/lib/llm-profiles";
import { appendLlmDebugLog } from "@/lib/llm-request-logger";
import { resolveChunkMaxTokens } from "@/lib/storyboard-llm-budget";

export type SeedancePromptSceneInput = {
  index: number;
  visualDescription: string;
  narration: string;
  durationSec: number;
};

export type SeedancePromptSceneOutput = {
  index: number;
  adaptationFit: string;
  officialTemplateNotes: string;
  suggestions: string;
  optimizedPrompt: string;
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

function coerceOutputs(
  parsed: unknown,
  expectedIndices: number[],
): SeedancePromptSceneOutput[] {
  const root = parsed as Record<string, unknown>;
  const arr =
    Array.isArray(root.prompts) ? root.prompts
    : Array.isArray(parsed) ? parsed
    : null;
  if (!arr) throw new Error("模型输出须为 { prompts: [...] } 或 JSON 数组");

  const byIndex = new Map<number, SeedancePromptSceneOutput>();
  for (const row of arr) {
    const r = row as Record<string, unknown>;
    const index = Number(r.index);
    if (!Number.isFinite(index)) continue;
    const adaptationFit = String(r.adaptationFit ?? "").trim();
    const officialTemplateNotes = String(
      r.officialTemplateNotes ?? "",
    ).trim();
    const suggestions = String(r.suggestions ?? "").trim();
    const optimizedPrompt = String(r.optimizedPrompt ?? "").trim();
    if (
      !adaptationFit ||
      !officialTemplateNotes ||
      !suggestions ||
      !optimizedPrompt
    ) {
      continue;
    }
    byIndex.set(index, {
      index,
      adaptationFit,
      officialTemplateNotes,
      suggestions,
      optimizedPrompt,
    });
  }

  const missing = expectedIndices.filter((i) => !byIndex.has(i));
  if (missing.length) {
    throw new Error(`本批缺少镜号输出：${missing.join("、")}`);
  }

  return expectedIndices
    .filter((i) => byIndex.has(i))
    .map((i) => byIndex.get(i)!);
}

const BATCH_SIZE = 10;

export async function generateSeedancePromptsWithProfile(args: {
  profile: LlmProfileRow;
  apiKey: string;
  scenes: SeedancePromptSceneInput[];
  subject: string;
  dynasty?: string;
  seriesTitle?: string;
  sliceTitle?: string;
  sliceAngle?: string;
  hook?: string;
  /** 与 `POST /api/suggest-seedance-prompts` 响应头一致，写入 `.llm-read.md` */
  llmRequestId?: string;
}): Promise<SeedancePromptSceneOutput[]> {
  const usesJson = args.profile.supportsJsonObject !== false;
  const cap = resolveChunkMaxTokens(args.profile);

  const ctxLines = [
    `主角/叙事主体：${args.subject}`,
    args.dynasty?.trim() ? `时代背景：${args.dynasty.trim()}` : "",
    args.seriesTitle?.trim() ? `系列：${args.seriesTitle.trim()}` : "",
    args.sliceTitle?.trim() ? `切片标题：${args.sliceTitle.trim()}` : "",
    args.sliceAngle?.trim() ? `切口说明：${args.sliceAngle.trim()}` : "",
    args.hook?.trim() ?
      `黄金开头 hook（人称与叙事口径须一致）：${args.hook.trim()}`
    : "",
  ].filter(Boolean);

  const system = `你是资深影视导演兼 AI「图生视频」提示词顾问，工作流为：已有关键静帧（当前镜），再用 Seedance / 类似模型生成短视频。

你会收到每镜的 visualDescription（HistorAI 用于静帧出图）、narration（口播，仅供参考）、durationSec。

任务（导演思维，逐镜独立分析）：
1) adaptationFit：图生视频适配度——该镜从「静止关键帧」延伸运动时是否合适、难点是什么（群像、大场面、强透视等）。
2) officialTemplateNotes：对齐 Seedance 类官方推荐顺序「主体→动作→环境→镜头→风格→约束」，说明本镜各槽怎么填；强调避免只对静止外观堆砌形容词、动作要可执行可量化、参考关系要写清（基于当前参考图/关键帧）。
3) suggestions：必要添加项与优化建议——如主语锁定主角人设、面部稳定、镜头固定与否、肢体合理等。
4) optimizedPrompt：可直接粘贴图生视频的优化版提示词，建议使用分段标签（中文为主）：主体： / 动作： / 镜头： / 环境与风格： / 约束： ：约束中须包含「基于当前关键帧/参考图，保持主角相貌与构图锚点」类人话表述。

硬约束：
- 不编造与 visualDescription 矛盾的情节与画面；不篡改史实口径。
- optimizedPrompt 假定用户将以「本镜已生成的静帧」为参考图，侧重微动、光影、微风、眼神、旗帜等可在几秒内完成的运动，避免要求完全换场景或与参考帧无关的大跳转。
- 仅输出合法 JSON：{ "prompts": [ { "index": number, "adaptationFit": string, "officialTemplateNotes": string, "suggestions": string, "optimizedPrompt": string } ] }
- prompts 必须覆盖输入中的全部 index，一项不少。`;

  const merged: SeedancePromptSceneOutput[] = [];

  for (let off = 0; off < args.scenes.length; off += BATCH_SIZE) {
    const batch = args.scenes.slice(off, off + BATCH_SIZE);
    const expectedIndices = batch.map((s) => s.index);
    const user =
      `${ctxLines.join("\n")}\n\n【本批分镜 JSON】\n${JSON.stringify({ scenes: batch })}\n\n请输出 JSON，prompts 覆盖镜号：${expectedIndices.join("、")}。`;

    const maxTokens = Math.min(
      cap,
      Math.max(4096, 1800 + batch.length * 950),
    );

    let raw: string;
    try {
      raw = await callOpenAICompatibleChat({
        url: args.profile.chatCompletionsUrl,
        apiKey: args.apiKey,
        model: args.profile.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.45,
        maxTokens,
        responseFormatJsonObject: usesJson,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await appendLlmDebugLog({
        requestId: args.llmRequestId,
        route: "POST /api/suggest-seedance-prompts",
        meta: {
          phase: "chat_failed",
          batchOffset: off,
          sceneIndices: expectedIndices,
          error: msg,
        },
        promptDebug: {
          system,
          user,
          model: args.profile.model,
          chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
          temperature: 0.45,
          usesJsonResponseFormat: usesJson,
          assistantRaw: msg,
          storyboardStrategy: `Seedance · Chat 请求失败 · 镜 ${expectedIndices.join("、")}`,
        },
      });
      throw e;
    }

    try {
      const part = coerceOutputs(parseJson(raw), expectedIndices);
      merged.push(...part);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await appendLlmDebugLog({
        requestId: args.llmRequestId,
        route: "POST /api/suggest-seedance-prompts",
        meta: {
          phase: "parse_failed",
          batchOffset: off,
          sceneIndices: expectedIndices,
          error: msg,
        },
        promptDebug: {
          system,
          user,
          model: args.profile.model,
          chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
          temperature: 0.45,
          usesJsonResponseFormat: usesJson,
          assistantRaw: raw,
          storyboardStrategy: `Seedance · JSON/字段校验失败 · 镜 ${expectedIndices.join("、")}`,
        },
      });
      throw e;
    }

    await appendLlmDebugLog({
      requestId: args.llmRequestId,
      route: "POST /api/suggest-seedance-prompts",
      meta: {
        phase: "ok",
        batchOffset: off,
        sceneIndices: expectedIndices,
      },
      promptDebug: {
        system,
        user,
        model: args.profile.model,
        chatCompletionsUrl: args.profile.chatCompletionsUrl.trim(),
        temperature: 0.45,
        usesJsonResponseFormat: usesJson,
        assistantRaw: raw,
        storyboardStrategy: `Seedance 文案 · 批次成功 · 镜 ${expectedIndices.join("、")}`,
      },
    });
  }

  return merged.sort((a, b) => a.index - b.index);
}
