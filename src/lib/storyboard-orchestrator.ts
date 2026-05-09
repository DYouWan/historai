import { callOpenAICompatibleChat } from "@/lib/chat-openai-compatible";
import type { LlmProfileRow } from "@/lib/llm-profiles";
import {
  appendStoryboardChunkRetryInstruction,
  buildChunkSystemPrompt,
  buildChunkUserPrompt,
  buildSpineSystemPrompt,
  buildSpineUserPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  type SceneSkeletonRow,
  type StoryboardPromptParams,
} from "@/lib/prompts/storyboard-prompts";
import {
  chunkSceneIndexRanges,
  formatStoryboardStrategyLabel,
  resolveChunkMaxTokens,
  resolveScenesPerChunk,
  resolveSingleShotMaxTokens,
  resolveSpineMaxTokens,
  resolveUseChunkedStoryboard,
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
  TimelineBeat,
  VideoDurationMin,
} from "@/lib/types";
import {
  getVideoDurationPreset,
  targetSceneCountForPreset,
} from "@/lib/video-duration";

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
    throw new Error("脊柱阶段：hook 不得为空。");
  }

  const tl = timelineFromSpine(o);
  if (tl.length < args.dur.timelineMin || tl.length > args.dur.timelineMax) {
    throw new Error(
      `脊柱阶段：timeline 段数为 ${tl.length}，须在 ${args.dur.timelineMin}～${args.dur.timelineMax} 之间。`,
    );
  }
  for (const row of tl) {
    if (!row.text) throw new Error("脊柱阶段：timeline 每段 text 不得为空。");
    if (!row.sources?.length) {
      throw new Error("脊柱阶段：timeline 每段须至少 1 条 sources。");
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
      `脊柱阶段：sceneSkeleton 条数为 ${skeleton.length}，必须为 ${args.expectedSkeletonCount}。`,
    );
  }
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i].index !== i + 1) {
      throw new Error(
        `脊柱阶段：sceneSkeleton index 须自 1 连续递增，期望 ${i + 1}，实际 ${skeleton[i].index}。`,
      );
    }
    if (!skeleton[i].beat) {
      throw new Error(`脊柱阶段：第 ${i + 1} 条 beat 不得为空。`);
    }
  }

  return { spine: o, skeleton, hook };
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
  useChunked: boolean;
  videoDurationMin: VideoDurationMin;
}): LlmMessagesDebug {
  const { profile, phases, useChunked, videoDurationMin } = args;
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
    // 单次整包仅 1 条 phase 时，与根级 system/user 完全重复；省略以减小日志体积 / 避免 UI 双份
    phases: phases.length > 1 ? phases : undefined,
    storyboardStrategy: formatStoryboardStrategyLabel({
      useChunked,
      videoDurationMin,
      phaseCount: phases.length,
    }),
  };
}

/**
 * 在线主生成：按档案与成片时长选择单次或分块，并设置 max_tokens。
 */
export async function generateStoryboardWithProfile(args: {
  profile: LlmProfileRow;
  apiKey: string;
  params: GenerateStoryboardLlmParams;
  videoDurationMin: VideoDurationMin;
  chunkMode: StoryboardChunkMode;
}): Promise<{ result: GenerationResult; promptDebug: LlmMessagesDebug }> {
  const { profile, apiKey, videoDurationMin, chunkMode } = args;
  const { profileId: _profileId, ...promptOnly } = args.params;
  void _profileId;
  const fullParams: StoryboardPromptParams = {
    ...promptOnly,
    videoDurationMin,
  };
  const dur = getVideoDurationPreset(videoDurationMin);
  const targetScenes = targetSceneCountForPreset(dur);
  const usesJson = profile.supportsJsonObject !== false;

  const useChunked = resolveUseChunkedStoryboard({
    videoDurationMin,
    chunkMode,
    profile,
  });

  const phases: LlmDebugPhase[] = [];

  if (!useChunked) {
    const maxTok = resolveSingleShotMaxTokens({ videoDurationMin, profile });
    const system = buildSystemPrompt(videoDurationMin);
    const user = buildUserPrompt(fullParams);
    const assistantRaw = await callChat({
      profile,
      apiKey,
      system,
      user,
      maxTokens: maxTok,
      usesJson,
    });
    phases.push({
      phase: "single-shot",
      system,
      user,
      model: profile.model,
      chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
      temperature: 0.6,
      usesJsonResponseFormat: usesJson,
      maxTokens: maxTok,
      assistantRaw,
    });
    const parsed = parseJsonStrict(assistantRaw) as RawStoryboardGeneration;
    const result = normalizeStoryboardRaw(
      parsed,
      profile,
      dur.softMinTotalSec,
    );
    return {
      result,
      promptDebug: buildPromptDebug({
        profile,
        phases,
        useChunked: false,
        videoDurationMin,
      }),
    };
  }

  // —— 分块：脊柱 ——
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

  let spineParsed: unknown = parseJsonStrict(spineAssistant);
  let validated: ReturnType<typeof parseAndValidateSpine>;
  try {
    validated = parseAndValidateSpine({
      parsed: spineParsed,
      expectedSkeletonCount: targetScenes,
      dur,
    });
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    spineUser = `${spineUser}\n\n【自动重试】上次校验失败：${msg}\n请严格输出合法 JSON：sceneSkeleton 恰好 ${targetScenes} 条，index 1～${targetScenes}，timeline 段数在 ${dur.timelineMin}～${dur.timelineMax}。`;
    spineAssistant = await callChat({
      profile,
      apiKey,
      system: spineSystem,
      user: spineUser,
      maxTokens: spineMax,
      usesJson,
    });
    spineParsed = parseJsonStrict(spineAssistant);
    validated = parseAndValidateSpine({
      parsed: spineParsed,
      expectedSkeletonCount: targetScenes,
      dur,
    });
  }

  phases.push({
    phase: "spine",
    system: spineSystem,
    user: spineUser,
    model: profile.model,
    chatCompletionsUrl: profile.chatCompletionsUrl.trim(),
    temperature: 0.6,
    usesJsonResponseFormat: usesJson,
    maxTokens: spineMax,
    assistantRaw: spineAssistant,
  });

  const { spine, skeleton, hook } = validated;
  const timeline = timelineFromSpine(spine);
  const factNotes = (spine.factNotes ?? []).map(String);
  const complianceNote =
    spine.complianceNote === null || spine.complianceNote === undefined
      ? undefined
      : String(spine.complianceNote);

  const ranges = chunkSceneIndexRanges(
    targetScenes,
    resolveScenesPerChunk(profile),
  );
  const chunkMax = resolveChunkMaxTokens(profile);
  const chunkSys = buildChunkSystemPrompt();

  const mergedScenes: NonNullable<RawStoryboardGeneration["scenes"]> = [];
  let previousLastNarration: string | null = null;

  for (let ci = 0; ci < ranges.length; ci++) {
    const { start, end } = ranges[ci]!;
    const skSlice = skeleton.filter((r) => r.index >= start && r.index <= end);
    const nextStart = ranges[ci + 1]?.start;
    const nextBeat =
      nextStart != null ?
        skeleton.find((r) => r.index === nextStart)?.beat ?? null
      : null;

    const chunkUser = buildChunkUserPrompt({
      params: fullParams,
      d: dur,
      chunkStart: start,
      chunkEnd: end,
      hook,
      timeline,
      factNotes,
      skeletonRows: skSlice,
      previousLastNarration,
      nextChunkFirstBeat: nextBeat,
    });

    let userForLog = chunkUser;
    let assistant = await callChat({
      profile,
      apiKey,
      system: chunkSys,
      user: chunkUser,
      maxTokens: chunkMax,
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
        maxTokens: chunkMax,
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
      maxTokens: chunkMax,
      assistantRaw: assistant,
    });

    mergedScenes.push(...scenesPart);
    previousLastNarration =
      scenesPart[scenesPart.length - 1]?.narration?.trim() ?? previousLastNarration;
  }

  if (mergedScenes.length !== targetScenes) {
    throw new Error(
      `分块合并后 scenes 为 ${mergedScenes.length} 条，期望 ${targetScenes}。`,
    );
  }

  const rawFinal: RawStoryboardGeneration = {
    hook,
    timeline: spine.timeline,
    scenes: mergedScenes,
    factNotes: spine.factNotes,
    complianceNote: complianceNote ?? null,
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
      useChunked: true,
      videoDurationMin,
    }),
  };
}
