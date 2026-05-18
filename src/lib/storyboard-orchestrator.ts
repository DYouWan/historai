import { callOpenAICompatibleChat } from "@/lib/chat-openai-compatible";
import type { LlmProfileRow } from "@/lib/llm-profiles";
import { appendLlmDebugLog } from "@/lib/llm-request-logger";
import {
  appendStoryboardChunkRetryInstruction,
  appendStoryboardVoiceoverRetryInstruction,
  buildChunkSystemPrompt,
  buildChunkUserPrompt,
  buildSpineSystemPrompt,
  buildSpineUserPrompt,
  buildVoiceoverSystemPrompt,
  buildVoiceoverUserPrompt,
  type SceneSkeletonRow,
  type StoryboardPromptParams,
} from "@/lib/prompts/storyboard-prompts";
import {
  formatStoryboardStrategyLabel,
  resolveExpandMaxTokensForRange,
  resolveSingleShotMaxTokens,
  resolveStoryboardExpandRanges,
  resolveSpineMaxTokens,
  type StoryboardChunkMode,
} from "@/lib/storyboard-llm-budget";
import {
  normalizeStoryboardRaw,
  type RawStoryboardGeneration,
} from "@/lib/storyboard-normalize";
import {
  buildSpineSnapshotFromParsed,
  parseAndNormalizeSpine,
  spineSnapshotToParseInput,
  type ParsedSpine,
} from "@/lib/storyboard-spine";
import type {
  GenerationResult,
  LlmDebugPhase,
  LlmMessagesDebug,
  ReviewChecklist,
  StoryArc,
  StoryboardSpineSnapshot,
  VideoDurationMin,
} from "@/lib/types";
import {
  getVideoDurationPreset,
  targetSceneCountForPreset,
} from "@/lib/video-duration";
import { normalizeVoiceoverPayload } from "@/lib/voiceover-normalize";

export type GenerateStoryboardLlmParams = StoryboardPromptParams & {
  profileId?: string | null;
};

function parseJsonStrict(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("模型输出不是合法 JSON，请重试");
  }
}

function tryJsonParse(content: string):
  | { ok: true; value: unknown }
  | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 客户端按稿重跑：从口播全文或段落数组得到与镜数对齐的段落 */
export function resolveVoiceoverParagraphsFromClient(args: {
  overrideText?: string | null;
  paragraphsOverride?: string[] | null;
  targetScenes: number;
}): { voiceoverFullText: string; voiceoverParagraphs: string[] } {
  const po = args.paragraphsOverride
    ?.map((s) => String(s ?? "").trim())
    .filter((s) => s.length > 0);
  if (po && po.length === args.targetScenes) {
    const joined = po.join("\n\n");
    const full =
      args.overrideText?.trim() && args.overrideText.trim().length > 0 ?
        args.overrideText.trim()
      : joined;
    return { voiceoverFullText: full, voiceoverParagraphs: po };
  }
  const text = args.overrideText?.trim() ?? "";
  if (!text) {
    throw new Error(
      "按稿重出分镜：请提供口播全文（voiceoverFullTextOverride），或与镜数相同的 voiceoverParagraphsOverride。",
    );
  }
  const parts = text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length !== args.targetScenes) {
    throw new Error(
      `口播正文用空行分段后须为 ${args.targetScenes} 段（当前 ${parts.length} 段）；请在每镜口播之间留一空行。`,
    );
  }
  return { voiceoverFullText: text, voiceoverParagraphs: parts };
}

function parseAndValidateVoiceover(
  parsed: unknown,
  targetScenes: number,
): { voiceoverFullText: string; voiceoverParagraphs: string[] } {
  return normalizeVoiceoverPayload(parsed, targetScenes, {
    errorLabel: "整稿口播",
  });
}

function parseChunkScenes(
  parsed: unknown,
  start: number,
  end: number,
): NonNullable<RawStoryboardGeneration["scenes"]> {
  const o = parsed as { scenes?: RawStoryboardGeneration["scenes"] };
  const scenes = o.scenes ?? [];
  const expected = end - start + 1;
  if (scenes.length !== expected) {
    throw new Error(
      `分镜扩写 index ${start}～${end}：返回 scenes 条数为 ${scenes.length}，须为 ${expected}。`,
    );
  }
  const normalized = scenes.map((s, i) => ({
    index: typeof s.index === "number" ? s.index : start + i,
    visualDescription: String(s.visualDescription ?? "").trim(),
    narration: String(s.narration ?? "").trim(),
    durationSec: Math.min(60, Math.max(2, Number(s.durationSec ?? 7))),
  }));
  normalized.sort((a, b) => a.index - b.index);
  for (let i = 0; i < normalized.length; i++) {
    const want = start + i;
    if (normalized[i].index !== want) {
      throw new Error(
        `分镜扩写：期望 index ${want}，实际 ${normalized[i].index}（块内第 ${i + 1} 条）。`,
      );
    }
    if (!normalized[i].visualDescription || !normalized[i].narration) {
      throw new Error(
        `分镜扩写：index ${want} 的 visualDescription / narration 不得为空。`,
      );
    }
  }
  return normalized;
}

async function callChat(args: {
  profile: LlmProfileRow;
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  usesJson: boolean;
}): Promise<string> {
  return callOpenAICompatibleChat({
    url: args.profile.chatCompletionsUrl,
    apiKey: args.apiKey,
    model: args.profile.model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    temperature: 0.6,
    maxTokens: args.maxTokens,
    responseFormatJsonObject: args.usesJson,
  });
}

function buildPromptDebug(args: {
  profile: LlmProfileRow;
  phases: LlmDebugPhase[];
  videoDurationMin: VideoDurationMin;
}): LlmMessagesDebug {
  const { profile, phases, videoDurationMin } = args;
  const first = phases[0];
  const assistantJoined = phases
    .filter((p) => p.assistantRaw)
    .map(
      (p) =>
        `=== ${p.phase} (max_tokens=${p.maxTokens ?? "—"}) ===\n${p.assistantRaw}`,
    )
    .join("\n\n");
  return {
    system: first?.system ?? "",
    user: first?.user ?? "",
    model: profile.model,
    chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
    temperature: 0.6,
    usesJsonResponseFormat: profile.supportsJsonObject !== false,
    assistantRaw: assistantJoined || undefined,
    phases: phases.length > 1 ? phases : undefined,
    storyboardStrategy: formatStoryboardStrategyLabel({
      videoDurationMin,
      phaseCount: phases.length,
    }),
  };
}

async function runExpandChunks(args: {
  profile: LlmProfileRow;
  apiKey: string;
  usesJson: boolean;
  fullParams: StoryboardPromptParams;
  dur: ReturnType<typeof getVideoDurationPreset>;
  chunkMode: StoryboardChunkMode;
  videoDurationMin: VideoDurationMin;
  targetScenes: number;
  storyArc: StoryArc;
  reviewChecklist: ReviewChecklist;
  skeleton: SceneSkeletonRow[];
  voiceoverParagraphs: string[];
  phases: LlmDebugPhase[];
}): Promise<NonNullable<RawStoryboardGeneration["scenes"]>> {
  const {
    profile,
    apiKey,
    usesJson,
    fullParams,
    dur,
    chunkMode,
    videoDurationMin,
    targetScenes,
    storyArc,
    reviewChecklist,
    skeleton,
    voiceoverParagraphs,
    phases,
  } = args;

  for (let i = 0; i < voiceoverParagraphs.length; i++) {
    if (!voiceoverParagraphs[i]?.trim()) {
      throw new Error(`整稿口播：第 ${i + 1} 镜母稿为空。`);
    }
  }

  const ranges = resolveStoryboardExpandRanges({
    chunkMode,
    videoDurationMin,
    profile,
    targetScenes,
  });
  const chunkSys = buildChunkSystemPrompt();
  const mergedScenes: NonNullable<RawStoryboardGeneration["scenes"]> = [];
  let previousLastNarration: string | null = null;

  for (let ci = 0; ci < ranges.length; ci++) {
    const { start, end } = ranges[ci]!;
    const skSlice = skeleton.filter((r) => r.index >= start && r.index <= end);
    const lockedParagraphs = skSlice.map(
      (r) => voiceoverParagraphs[r.index - 1]!.trim(),
    );
    const nextStart = ranges[ci + 1]?.start;
    const nextBeat =
      nextStart != null ?
        skeleton.find((r) => r.index === nextStart)?.beat ?? null
      : null;

    const maxTok = resolveExpandMaxTokensForRange({
      rangeStart: start,
      rangeEnd: end,
      targetScenes,
      videoDurationMin,
      profile,
    });

    const chunkUser = buildChunkUserPrompt({
      params: fullParams,
      chunkStart: start,
      chunkEnd: end,
      storyArc,
      reviewChecklist,
      skeletonRows: skSlice,
      lockedParagraphs,
      previousLastNarration,
      nextChunkFirstBeat: nextBeat,
    });

    let userForLog = chunkUser;
    let assistant = await callChat({
      profile,
      apiKey,
      system: chunkSys,
      user: chunkUser,
      maxTokens: maxTok,
      usesJson,
    });

    let chunkParsed: unknown = parseJsonStrict(assistant);
    let scenesPart: NonNullable<RawStoryboardGeneration["scenes"]>;
    try {
      scenesPart = parseChunkScenes(chunkParsed, start, end);
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      const retryUser = appendStoryboardChunkRetryInstruction(
        chunkUser,
        msg,
        start,
        end,
      );
      userForLog = retryUser;
      assistant = await callChat({
        profile,
        apiKey,
        system: chunkSys,
        user: retryUser,
        maxTokens: maxTok,
        usesJson,
      });
      chunkParsed = parseJsonStrict(assistant);
      scenesPart = parseChunkScenes(chunkParsed, start, end);
    }

    phases.push({
      phase: `chunk-${start}-${end}`,
      system: chunkSys,
      user: userForLog,
      model: profile.model,
      chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
      temperature: 0.6,
      usesJsonResponseFormat: usesJson,
      maxTokens: maxTok,
      assistantRaw: assistant,
    });

    mergedScenes.push(...scenesPart);
    previousLastNarration =
      scenesPart[scenesPart.length - 1]?.narration?.trim() ??
      previousLastNarration;
  }

  if (mergedScenes.length !== targetScenes) {
    throw new Error(
      `分块合并后 scenes 为 ${mergedScenes.length} 条，期望 ${targetScenes}。`,
    );
  }

  return mergedScenes;
}

async function executeVoiceoverPhase(config: {
  profile: LlmProfileRow;
  apiKey: string;
  usesJson: boolean;
  fullParams: StoryboardPromptParams;
  videoDurationMin: VideoDurationMin;
  targetScenes: number;
  skeleton: SceneSkeletonRow[];
  storyArc: StoryArc;
  reviewChecklist: ReviewChecklist;
  phases: LlmDebugPhase[];
}): Promise<{ voiceoverFullText: string; voiceoverParagraphs: string[] }> {
  const {
    profile,
    apiKey,
    usesJson,
    fullParams,
    videoDurationMin,
    targetScenes,
    skeleton,
    storyArc,
    reviewChecklist,
    phases,
  } = config;

  const skTable = skeleton
    .map(
      (r) =>
        `- index=${r.index} durationSec=${r.durationSec} beat：${r.beat}`,
    )
    .join("\n");
  const voSystem = buildVoiceoverSystemPrompt(videoDurationMin, targetScenes);
  const voMax = resolveSingleShotMaxTokens({ videoDurationMin, profile });
  let voUser = buildVoiceoverUserPrompt(
    fullParams,
    targetScenes,
    skTable,
    storyArc,
    reviewChecklist,
  );
  let voAssistant = await callChat({
    profile,
    apiKey,
    system: voSystem,
    user: voUser,
    maxTokens: voMax,
    usesJson,
  });

  let voParsed: unknown = parseJsonStrict(voAssistant);
  try {
    const vo = parseAndValidateVoiceover(voParsed, targetScenes);
    phases.push({
      phase: "voiceover-script",
      system: voSystem,
      user: voUser,
      model: profile.model,
      chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
      temperature: 0.6,
      usesJsonResponseFormat: usesJson,
      maxTokens: voMax,
      assistantRaw: voAssistant,
    });
    return vo;
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    voUser = appendStoryboardVoiceoverRetryInstruction(
      voUser,
      msg,
      targetScenes,
    );
    voAssistant = await callChat({
      profile,
      apiKey,
      system: voSystem,
      user: voUser,
      maxTokens: voMax,
      usesJson,
    });
    voParsed = parseJsonStrict(voAssistant);
    const vo = parseAndValidateVoiceover(voParsed, targetScenes);
    phases.push({
      phase: "voiceover-script",
      system: voSystem,
      user: voUser,
      model: profile.model,
      chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
      temperature: 0.6,
      usesJsonResponseFormat: usesJson,
      maxTokens: voMax,
      assistantRaw: voAssistant,
    });
    return vo;
  }
}

function spineRetryHint(
  dur: ReturnType<typeof getVideoDurationPreset>,
  targetScenes: number,
): string {
  const milestoneMin = Math.max(2, dur.timelineMin - 1);
  return `sceneSkeleton 恰好 ${targetScenes} 条；storyArc.milestones 至少 ${milestoneMin} 条；peak.label 含高峰关键词；opening 为≤48字单句钩子（悬念或反差），勿照搬唯一切面正文、勿「我回答/我说」剧透 peak。`;
}

/**
 * 分层主生成：叙事方案 L1 → 整稿口播 L2 → 分镜扩写 L3。
 */
export async function generateStoryboardWithProfile(args: {
  profile: LlmProfileRow;
  apiKey: string;
  params: GenerateStoryboardLlmParams;
  videoDurationMin: VideoDurationMin;
  chunkMode: StoryboardChunkMode;
  spineSnapshot?: StoryboardSpineSnapshot | null;
  voiceoverFullTextOverride?: string | null;
  voiceoverParagraphsOverride?: string[] | null;
  stopAfterSpine?: boolean;
  generateVoiceoverOnly?: boolean;
  llmRequestId?: string;
}): Promise<{ result: GenerationResult; promptDebug: LlmMessagesDebug }> {
  const {
    profile,
    apiKey,
    videoDurationMin,
    chunkMode,
    spineSnapshot,
    voiceoverFullTextOverride,
    voiceoverParagraphsOverride,
    stopAfterSpine,
    generateVoiceoverOnly,
    llmRequestId,
  } = args;
  const { profileId: _profileId, ...promptOnly } = args.params;
  void _profileId;
  const fullParams: StoryboardPromptParams = {
    ...promptOnly,
    videoDurationMin,
  };
  const dur = getVideoDurationPreset(videoDurationMin);
  const targetScenes = targetSceneCountForPreset(dur);
  const usesJson = profile.supportsJsonObject !== false;
  const phases: LlmDebugPhase[] = [];

  const regenerateOnly =
    spineSnapshot != null &&
    (Boolean(voiceoverFullTextOverride?.trim()) ||
      (voiceoverParagraphsOverride?.length ?? 0) > 0);

  const voiceoverOnly =
    Boolean(generateVoiceoverOnly) && spineSnapshot != null && !regenerateOnly;

  const stopAfterSpineOnly =
    Boolean(stopAfterSpine) && !regenerateOnly && !voiceoverOnly;

  if (
    regenerateOnly &&
    (stopAfterSpineOnly || Boolean(generateVoiceoverOnly))
  ) {
    throw new Error(
      "仅扩写分镜时不要同时传 stopAfterSpine / generateVoiceoverOnly。",
    );
  }
  if (voiceoverOnly && !spineSnapshot) {
    throw new Error("仅生成整稿口播须提供 spineSnapshot。");
  }

  let parsedSpine: ParsedSpine;
  let voiceoverFullText: string;
  let voiceoverParagraphs: string[];
  let skipL3: boolean;
  let pipelinePending: "voiceover" | "scenes" | undefined;

  if (regenerateOnly) {
    parsedSpine = parseAndNormalizeSpine({
      parsed: spineSnapshotToParseInput(spineSnapshot!),
      expectedSkeletonCount: targetScenes,
      dur,
    });
    const vo = resolveVoiceoverParagraphsFromClient({
      overrideText: voiceoverFullTextOverride,
      paragraphsOverride: voiceoverParagraphsOverride ?? null,
      targetScenes,
    });
    voiceoverFullText = vo.voiceoverFullText;
    voiceoverParagraphs = vo.voiceoverParagraphs;
    skipL3 = false;
    pipelinePending = undefined;
  } else if (voiceoverOnly) {
    parsedSpine = parseAndNormalizeSpine({
      parsed: spineSnapshotToParseInput(spineSnapshot!),
      expectedSkeletonCount: targetScenes,
      dur,
    });
    const vo = await executeVoiceoverPhase({
      profile,
      apiKey,
      usesJson,
      fullParams,
      videoDurationMin,
      targetScenes,
      skeleton: parsedSpine.sceneSkeleton,
      storyArc: parsedSpine.storyArc,
      reviewChecklist: parsedSpine.reviewChecklist,
      phases,
    });
    voiceoverFullText = vo.voiceoverFullText;
    voiceoverParagraphs = vo.voiceoverParagraphs;
    skipL3 = true;
    pipelinePending = "scenes";
  } else {
    const hasAnyOverrideHint =
      spineSnapshot != null ||
      Boolean(voiceoverFullTextOverride?.trim()) ||
      (voiceoverParagraphsOverride?.length ?? 0) > 0;
    if (hasAnyOverrideHint) {
      throw new Error(
        "无效请求：若要按稿扩写分镜，请同时提供 spineSnapshot 与口播 override；若只需生成整稿，请传 generateVoiceoverOnly。",
      );
    }

    const spineMax = resolveSpineMaxTokens(profile);
    const spineSystem = buildSpineSystemPrompt(videoDurationMin, targetScenes);
    let spineUser = buildSpineUserPrompt(fullParams, targetScenes);
    let spineAssistant = await callChat({
      profile,
      apiKey,
      system: spineSystem,
      user: spineUser,
      maxTokens: spineMax,
      usesJson,
    });

    const spineL1LogMeta = (extra: Record<string, unknown>) => ({
      subject: fullParams.subject,
      videoDurationMin,
      targetScenes,
      stopAfterSpine: stopAfterSpineOnly,
      ...extra,
    });

    const logSpineL1Failure = async (entry: {
      user: string;
      assistantRaw: string;
      storyboardStrategy: string;
      meta: Record<string, unknown>;
    }) => {
      await appendLlmDebugLog({
        requestId: llmRequestId,
        route: "POST /api/generate",
        promptDebug: {
          system: spineSystem,
          user: entry.user,
          model: profile.model,
          chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
          temperature: 0.6,
          usesJsonResponseFormat: usesJson,
          assistantRaw: entry.assistantRaw,
          storyboardStrategy: entry.storyboardStrategy,
        },
        meta: spineL1LogMeta(entry.meta),
      });
    };

    const j1 = tryJsonParse(spineAssistant);
    if (!j1.ok) {
      await logSpineL1Failure({
        user: spineUser,
        assistantRaw: spineAssistant,
        storyboardStrategy: "narrative_plan · L1 · JSON.parse failed (首轮)",
        meta: {
          spineFailureStage: "json_parse",
          jsonParseError: j1.message,
        },
      });
      throw new Error("模型输出不是合法 JSON，请重试");
    }
    let spineParsed: unknown = j1.value;
    let validated: ParsedSpine;
    try {
      validated = parseAndNormalizeSpine({
        parsed: spineParsed,
        expectedSkeletonCount: targetScenes,
        dur,
      });
    } catch (e1) {
      const msgFirst = e1 instanceof Error ? e1.message : String(e1);
      const assistantRound1 = spineAssistant;
      spineUser = `${spineUser}\n\n【自动重试】上次校验失败：${msgFirst}\n请严格输出合法 JSON：${spineRetryHint(dur, targetScenes)}`;
      spineAssistant = await callChat({
        profile,
        apiKey,
        system: spineSystem,
        user: spineUser,
        maxTokens: spineMax,
        usesJson,
      });
      const j2 = tryJsonParse(spineAssistant);
      if (!j2.ok) {
        await logSpineL1Failure({
          user: spineUser,
          assistantRaw:
            `【首轮 assistant（JSON 合法但方案未过校验）】\n${assistantRound1}\n\n` +
            `【次轮 assistant（非法 JSON）】\n${spineAssistant}`,
          storyboardStrategy:
            "narrative_plan · L1 · JSON.parse failed (自动重试后)",
          meta: {
            spineFailureStage: "json_parse",
            jsonParseError: j2.message,
            firstValidateError: msgFirst,
          },
        });
        throw new Error("模型输出不是合法 JSON，请重试");
      }
      spineParsed = j2.value;
      try {
        validated = parseAndNormalizeSpine({
          parsed: spineParsed,
          expectedSkeletonCount: targetScenes,
          dur,
        });
      } catch (e2) {
        const msgSecond = e2 instanceof Error ? e2.message : String(e2);
        await logSpineL1Failure({
          user: spineUser,
          assistantRaw:
            `【首轮】\n${assistantRound1}\n\n【次轮】\n${spineAssistant}`,
          storyboardStrategy:
            "narrative_plan · L1 · validate failed (首轮与自动重试后均未通过)",
          meta: {
            spineFailureStage: "validate",
            firstValidateError: msgFirst,
            secondValidateError: msgSecond,
          },
        });
        throw e2;
      }
    }

    phases.push({
      phase: "narrative_skeleton",
      system: spineSystem,
      user: spineUser,
      model: profile.model,
      chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
      temperature: 0.6,
      usesJsonResponseFormat: usesJson,
      maxTokens: spineMax,
      assistantRaw: spineAssistant,
    });

    parsedSpine = validated;

    if (stopAfterSpineOnly) {
      voiceoverFullText = "";
      voiceoverParagraphs = [];
      skipL3 = true;
      pipelinePending = "voiceover";
    } else {
      const vo = await executeVoiceoverPhase({
        profile,
        apiKey,
        usesJson,
        fullParams,
        videoDurationMin,
        targetScenes,
        skeleton: parsedSpine.sceneSkeleton,
        storyArc: parsedSpine.storyArc,
        reviewChecklist: parsedSpine.reviewChecklist,
        phases,
      });
      voiceoverFullText = vo.voiceoverFullText;
      voiceoverParagraphs = vo.voiceoverParagraphs;
      skipL3 = false;
      pipelinePending = undefined;
    }
  }

  let mergedScenes: NonNullable<RawStoryboardGeneration["scenes"]> = [];
  if (!skipL3) {
    mergedScenes = await runExpandChunks({
      profile,
      apiKey,
      usesJson,
      fullParams,
      dur,
      chunkMode,
      videoDurationMin,
      targetScenes,
      storyArc: parsedSpine.storyArc,
      reviewChecklist: parsedSpine.reviewChecklist,
      skeleton: parsedSpine.sceneSkeleton,
      voiceoverParagraphs,
      phases,
    });
  }

  const rawFinal: RawStoryboardGeneration = {
    storyArc: parsedSpine.storyArc,
    scenes: mergedScenes,
    reviewChecklist: parsedSpine.reviewChecklist,
    voiceoverFullText,
    voiceoverParagraphs,
    sceneSkeleton: parsedSpine.sceneSkeleton,
    pipelinePending:
      mergedScenes.length > 0 ? undefined : pipelinePending,
  };

  const result = normalizeStoryboardRaw(
    rawFinal,
    profile,
    dur.softMinTotalSec,
  );

  return {
    result,
    promptDebug: buildPromptDebug({
      profile,
      phases,
      videoDurationMin,
    }),
  };
}

export { buildSpineSnapshotFromParsed };
