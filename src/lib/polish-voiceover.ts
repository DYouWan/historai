import { callOpenAICompatibleChat } from "@/lib/chat-openai-compatible";
import type { LlmProfileRow } from "@/lib/llm-profiles";
import { resolveChunkMaxTokens } from "@/lib/storyboard-llm-budget";
import type { Tone } from "@/lib/types";
import { normalizeVoiceoverPayload } from "@/lib/voiceover-normalize";

function parseJsonStrict(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("模型输出不是合法 JSON，请重试");
  }
}

function parsePolishedVoiceover(
  parsed: unknown,
  paragraphCount: number,
): { voiceoverFullText: string; voiceoverParagraphs: string[] } {
  return normalizeVoiceoverPayload(parsed, paragraphCount, {
    errorLabel: "润色结果",
  });
}

export async function polishVoiceoverWithProfile(args: {
  profile: LlmProfileRow;
  apiKey: string;
  paragraphCount: number;
  voiceoverFullText: string;
  hook: string;
  subject: string;
  seriesTitle?: string;
  sliceTitle?: string;
  sliceAngle?: string;
  dynasty?: string;
  tone: Tone;
}): Promise<{ voiceoverFullText: string; voiceoverParagraphs: string[] }> {
  const usesJson = args.profile.supportsJsonObject !== false;
  const toneHint =
    args.tone === "serious"
      ? "严肃科普口吻，少用夸张梗。"
      : "叙事向，可读性与节奏优先，可适度悬念。";

  const ctxParts = [
    `主角/主题：${args.subject}`,
    args.dynasty?.trim() ? `背景：${args.dynasty.trim()}` : "",
    args.seriesTitle?.trim() ? `系列：${args.seriesTitle.trim()}` : "",
    args.sliceTitle?.trim() ? `切片标题：${args.sliceTitle.trim()}` : "",
    args.sliceAngle?.trim() ? `切口说明：${args.sliceAngle.trim()}` : "",
    `黄金 hook（人称与切口须与口播一致）：${args.hook}`,
    `口吻：${toneHint}`,
  ].filter(Boolean);

  const n = args.paragraphCount;
  const system = `你是 HistorAI 的口播编辑，负责对短视频口播稿做润色。\n\n硬约束：\n- **禁止**改动史实判断、关键数字结论、人称设定（个人「我」/ 群体「他们」）与叙事命题。\n- **禁止**增删「镜」：输出 **paragraphs 必须恰好 ${n} 条**，与输入分段一一对应（只润色每条内部行文，勿合并或拆分镜）。\n- **voiceoverFullText** 须为**一篇连贯口播长稿**：从头到尾顺读自然；仅在**镜与镜之间**用**两个换行**分段，段内避免「一步一句」的碎片感。\n- **paragraphs** 必须与 **voiceoverFullText** 按双换行切分后的 **${n} 段逐字一致**（可先写长稿再拆段核对）。\n- 可做：口语节奏、段间衔接词、删冗余、标点与气息更顺。\n- 只输出合法 JSON，中文：{ "voiceoverFullText": "...", "paragraphs": [...] }。`;

  const user = `${ctxParts.join("\n")}\n\n【待润色口播全文】\n${args.voiceoverFullText.trim()}\n\n请输出 JSON，paragraphs 恰好 ${n} 条。`;

  const cap = resolveChunkMaxTokens(args.profile);
  const maxTokens = Math.min(
    cap,
    Math.max(4096, Math.floor(args.voiceoverFullText.length * 2) + 2500),
  );

  const raw = await callOpenAICompatibleChat({
    url: args.profile.chatCompletionsUrl,
    apiKey: args.apiKey,
    model: args.profile.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.35,
    maxTokens,
    responseFormatJsonObject: usesJson,
  });

  return parsePolishedVoiceover(parseJsonStrict(raw), n);
}
