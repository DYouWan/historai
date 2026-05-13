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
import type {
  GenerationResult,
  LlmDebugPhase,
  LlmMessagesDebug,
  StoryboardSpineSnapshot,
  TimelineBeat,
  VideoDurationMin,
} from "@/lib/types";
import {
  getVideoDurationPreset,
  targetSceneCountForPreset,
  TIMELINE_SEGMENTS_HARD_MAX,
} from "@/lib/video-duration";
import { normalizeVoiceoverPayload } from "@/lib/voiceover-normalize";

export type GenerateStoryboardLlmParams = StoryboardPromptParams & {
  profileId?: string | null;
};

type SpineRaw = {
  hook?: string;
  timeline?: RawStoryboardGeneration["timeline"];
  sceneSkeleton?: Array<{
    index?: number;
    beat?: string;
    durationSec?: number;
  }>;
  factNotes?: string[];
  complianceNote?: string | null;
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

function spineParsedFromSnapshot(snap: StoryboardSpineSnapshot): unknown {
  return {
    hook: snap.hook,
    timeline: snap.timeline,
    sceneSkeleton: snap.sceneSkeleton,
    factNotes: snap.factNotes,
    complianceNote: snap.complianceNote ?? null,
  };
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

function timelineFromSpine(spine: SpineRaw): TimelineBeat[] {
  return (
    spine.timeline?.map((t) => ({
      label: t.label,
      text: String(t.text ?? "").trim(),
      sources: (t.sources ?? []).map(String).filter(Boolean),
    })) ?? []
  );
}

function parseAndValidateSpine(args: {
  parsed: unknown;
  expectedSkeletonCount: number;
  dur: ReturnType<typeof getVideoDurationPreset>;
}): { spine: SpineRaw; skeleton: SceneSkeletonRow[]; hook: string } {
  const o = args.parsed as SpineRaw;
  const hook = String(o.hook ?? "").trim();
  if (!hook) {
    throw new Error("叙事骨架阶段：hook 不得为空。");
  }

  const tl = timelineFromSpine(o);
  if (tl.length < args.dur.timelineMin) {
    throw new Error(
      `叙事骨架阶段：timeline 段数为 ${tl.length}，须至少 ${args.dur.timelineMin} 段。`,
    );
  }
  if (tl.length > TIMELINE_SEGMENTS_HARD_MAX) {
    throw new Error(
      `叙事骨架阶段：timeline 段数为 ${tl.length}，不得超过 ${TIMELINE_SEGMENTS_HARD_MAX} 段。`,
    );
  }
  for (const row of tl) {
    if (!row.text) throw new Error("叙事骨架阶段：timeline 每段 text 不得为空。");
    if (!row.sources?.length) {
      throw new Error("叙事骨架阶段：timeline 每段须至少 1 条 sources。");
    }
  }

  const skRaw = o.sceneSkeleton ?? [];
  const skeleton: SceneSkeletonRow[] = skRaw.map((r, i) => ({
    index: typeof r.index === "number" ? r.index : i + 1,
    beat: String(r.beat ?? "").trim(),
    durationSec: Math.min(
      60,
      Math.max(2, Number(r.durationSec ?? args.dur.perSceneCenterSec)),
    ),
  }));

  if (skeleton.length !== args.expectedSkeletonCount) {
    throw new Error(
      `叙事骨架阶段：sceneSkeleton 条数为 ${skeleton.length}，必须为 ${args.expectedSkeletonCount}。`,
    );
  }
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i].index !== i + 1) {
      throw new Error(
        `叙事骨架阶段：sceneSkeleton index 须自 1 连续递增，期望 ${i + 1}，实际 ${skeleton[i].index}。`,
      );
    }
    if (!skeleton[i].beat) {
      throw new Error(`叙事骨架阶段：第 ${i + 1} 条 beat 不得为空。`);
    }
  }

  return { spine: o, skeleton, hook };
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
  hook: string;
  timeline: TimelineBeat[];
  factNotes: string[];
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
    hook,
    timeline,
    factNotes,
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
      d: dur,
      chunkStart: start,
      chunkEnd: end,
      hook,
      timeline,
      factNotes,
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
  let voUser = buildVoiceoverUserPrompt(fullParams, targetScenes, skTable);
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

/**
 * 分层主生成：叙事骨架（L1）→ 整稿口播（L2）→ 分镜扩写（L3）。
 * - stopAfterSpine：仅 L1，pipelinePending=voiceover
 * - generateVoiceoverOnly + spineSnapshot：仅 L2，pipelinePending=scenes
 * - spineSnapshot + 口播 override：仅 L3
 * - stopAfterVoiceover：L1+L2，pipelinePending=scenes
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
  stopAfterVoiceover?: boolean;
  /** 仅 L1 */
  stopAfterSpine?: boolean;
  /** 仅 L2（须带 spineSnapshot） */
  generateVoiceoverOnly?: boolean;
  /** 与 API 响应头 `x-request-id` 一致，失败时写入 `.llm-read.md` 便于对照 */
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
    stopAfterVoiceover,
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

  const stopAfterVoiceoverBundle =
    Boolean(stopAfterVoiceover) &&
    !regenerateOnly &&
    !voiceoverOnly &&
    !stopAfterSpineOnly;

  if (stopAfterSpineOnly && stopAfterVoiceover) {
    throw new Error("不要同时传 stopAfterSpine 与 stopAfterVoiceover。");
  }
  if (
    regenerateOnly &&
    (stopAfterVoiceover || stopAfterSpineOnly || Boolean(generateVoiceoverOnly))
  ) {
    throw new Error(
      "仅扩写分镜时不要同时传 stopAfterSpine / stopAfterVoiceover / generateVoiceoverOnly。",
    );
  }
  if (voiceoverOnly && !spineSnapshot) {
    throw new Error("仅生成整稿口播须提供 spineSnapshot。");
  }

  let hook: string;
  let timeline: TimelineBeat[];
  let skeleton: SceneSkeletonRow[];
  let factNotes: string[];
  let complianceNote: string | undefined;
  let voiceoverFullText: string;
  let voiceoverParagraphs: string[];
  let skipL3: boolean;
  let pipelinePending: "voiceover" | "scenes" | undefined;

  if (regenerateOnly) {
    const validated = parseAndValidateSpine({
      parsed: spineParsedFromSnapshot(spineSnapshot),
      expectedSkeletonCount: targetScenes,
      dur,
    });
    hook = validated.hook;
    skeleton = validated.skeleton;
    timeline = timelineFromSpine(validated.spine);
    factNotes = (validated.spine.factNotes ?? []).map(String);
    complianceNote =
      validated.spine.complianceNote === null ||
      validated.spine.complianceNote === undefined ?
        undefined
      : String(validated.spine.complianceNote);
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
    const validated = parseAndValidateSpine({
      parsed: spineParsedFromSnapshot(spineSnapshot!),
      expectedSkeletonCount: targetScenes,
      dur,
    });
    const spine = validated.spine;
    skeleton = validated.skeleton;
    hook = validated.hook;
    timeline = timelineFromSpine(spine);
    factNotes = (spine.factNotes ?? []).map(String);
    complianceNote =
      spine.complianceNote === null || spine.complianceNote === undefined ?
        undefined
      : String(spine.complianceNote);
    const vo = await executeVoiceoverPhase({
      profile,
      apiKey,
      usesJson,
      fullParams,
      videoDurationMin,
      targetScenes,
      skeleton,
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
        storyboardStrategy: "narrative_skeleton · L1 · JSON.parse failed (首轮)",
        meta: {
          spineFailureStage: "json_parse",
          jsonParseError: j1.message,
        },
      });
      throw new Error("模型输出不是合法 JSON，请重试");
    }
    let spineParsed: unknown = j1.value;
    let validated: ReturnType<typeof parseAndValidateSpine>;
    try {
      validated = parseAndValidateSpine({
        parsed: spineParsed,
        expectedSkeletonCount: targetScenes,
        dur,
      });
    } catch (e1) {
      const msgFirst = e1 instanceof Error ? e1.message : String(e1);
      const assistantRound1 = spineAssistant;
      spineUser = `${spineUser}\n\n【自动重试】上次校验失败：${msgFirst}\n请严格输出合法 JSON：sceneSkeleton 恰好 ${targetScenes} 条，index 1～${targetScenes}；timeline 至少 ${dur.timelineMin} 段、至多 ${TIMELINE_SEGMENTS_HARD_MAX} 段。`;
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
            `【首轮 assistant（JSON 合法但骨架未过校验）】\n${assistantRound1}\n\n` +
            `【次轮 assistant（非法 JSON）】\n${spineAssistant}`,
          storyboardStrategy:
            "narrative_skeleton · L1 · JSON.parse failed (自动重试后)",
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
        validated = parseAndValidateSpine({
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
            "narrative_skeleton · L1 · validate failed (首轮与自动重试后均未通过)",
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

    const spine = validated.spine;
    skeleton = validated.skeleton;
    hook = validated.hook;
    timeline = timelineFromSpine(spine);
    factNotes = (spine.factNotes ?? []).map(String);
    complianceNote =
      spine.complianceNote === null || spine.complianceNote === undefined ?
        undefined
      : String(spine.complianceNote);

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
        skeleton,
        phases,
      });
      voiceoverFullText = vo.voiceoverFullText;
      voiceoverParagraphs = vo.voiceoverParagraphs;
      if (stopAfterVoiceoverBundle) {
        skipL3 = true;
        pipelinePending = "scenes";
      } else {
        skipL3 = false;
        pipelinePending = undefined;
      }
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
      hook,
      timeline,
      factNotes,
      skeleton,
      voiceoverParagraphs,
      phases,
    });
  }

  const rawFinal: RawStoryboardGeneration = {
    hook,
    timeline: timeline.map((t) => ({
      label: t.label,
      text: t.text,
      sources: t.sources,
    })),
    scenes: mergedScenes,
    factNotes,
    complianceNote: complianceNote ?? null,
    voiceoverFullText,
    voiceoverParagraphs,
    sceneSkeleton: skeleton,
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
