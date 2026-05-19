import type {
  ReviewChecklist,
  SceneSkeletonEntry,
  StoryArc,
  StoryArcMilestone,
  StoryboardSpineSnapshot,
} from "@/lib/types";
import {
  TIMELINE_SEGMENTS_HARD_MAX,
  type VideoDurationPreset,
} from "@/lib/video-duration";

const PEAK_LABEL_KEYWORDS =
  /高潮|顶点|翻盘|一搏|定局|一绝|峰值|顶峰|高潮镜|翻盘镜/;

export type ParsedSpine = {
  storyArc: StoryArc;
  sceneSkeleton: SceneSkeletonEntry[];
  reviewChecklist: ReviewChecklist;
};

type RawSpineInput = {
  storyArc?: {
    milestones?: Array<{
      label?: string;
      intent?: string;
      sceneRange?: string;
      sources?: string[];
    }>;
    peak?: {
      label?: string;
      intent?: string;
      sceneRange?: string;
      sources?: string[];
    };
    closing?: string;
  };
  sceneSkeleton?: Array<{
    index?: number;
    beat?: string;
    durationSec?: number;
  }>;
  reviewChecklist?: {
    factsToVerify?: string[];
    publishCautions?: string | null;
  };
};

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

type RawMilestone = NonNullable<
  NonNullable<RawSpineInput["storyArc"]>["milestones"]
>[number];

function normalizeMilestone(m: RawMilestone): StoryArcMilestone {
  return {
    label: m.label?.trim() || undefined,
    intent: trim(m.intent),
    sceneRange: m.sceneRange?.trim() || undefined,
    sources: (m.sources ?? []).map(String).filter(Boolean),
  };
}

function reviewFromRaw(o: RawSpineInput): ReviewChecklist {
  const rc = o.reviewChecklist;
  return {
    factsToVerify: (rc?.factsToVerify ?? [])
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5),
    publishCautions:
      rc?.publishCautions === null || rc?.publishCautions === undefined ?
        null
      : trim(rc.publishCautions) || null,
  };
}

function parseStoryArcFromRaw(o: RawSpineInput): StoryArc | null {
  const arc = o.storyArc;
  if (!arc) return null;
  const closing = trim(arc.closing);
  const milestones = (arc.milestones ?? []).map(normalizeMilestone);
  const peakRaw = arc.peak;
  const peak = {
    label: trim(peakRaw?.label) || "叙事高峰",
    intent: trim(peakRaw?.intent),
    sceneRange: peakRaw?.sceneRange?.trim() || undefined,
    sources: (peakRaw?.sources ?? []).map(String).filter(Boolean),
  };
  if (!peak.intent || !closing) return null;
  return { milestones, peak, closing };
}

function validateStoryArc(storyArc: StoryArc, dur: VideoDurationPreset): void {
  if (!storyArc.peak.intent) {
    throw new Error("叙事方案：storyArc.peak.intent 不得为空。");
  }
  if (!storyArc.closing) {
    throw new Error("叙事方案：storyArc.closing 不得为空。");
  }
  const milestoneMin = Math.max(2, dur.timelineMin - 1);
  if (storyArc.milestones.length < milestoneMin) {
    throw new Error(
      `叙事方案：storyArc.milestones 须至少 ${milestoneMin} 条（当前 ${storyArc.milestones.length}）。`,
    );
  }
  const nodeCount = storyArc.milestones.length + 1;
  if (nodeCount > TIMELINE_SEGMENTS_HARD_MAX) {
    throw new Error(
      `叙事方案：里程碑 + 高峰节点共 ${nodeCount} 个，不得超过 ${TIMELINE_SEGMENTS_HARD_MAX}。`,
    );
  }
  for (const m of storyArc.milestones) {
    if (!m.intent) {
      throw new Error("叙事方案：每条 milestone.intent 不得为空。");
    }
  }
  if (!PEAK_LABEL_KEYWORDS.test(storyArc.peak.label)) {
    throw new Error(
      "叙事方案：storyArc.peak.label 须含「高潮」「顶点」「翻盘」「一搏」「定局」「一绝」或其同义语之一。",
    );
  }
  const sourceCount =
    storyArc.milestones.reduce((n, m) => n + (m.sources?.length ?? 0), 0) +
    (storyArc.peak.sources?.length ?? 0);
  if (sourceCount < 2) {
    throw new Error(
      "叙事方案：milestones 与 peak 的 sources 合计至少 2 条（史据/学者观点简述）。",
    );
  }
}

function parseSceneSkeleton(
  skRaw: RawSpineInput["sceneSkeleton"],
  expectedCount: number,
  dur: VideoDurationPreset,
): SceneSkeletonEntry[] {
  const skeleton: SceneSkeletonEntry[] = (skRaw ?? []).map((r, i) => ({
    index: typeof r.index === "number" ? r.index : i + 1,
    beat: trim(r.beat),
    durationSec: Math.min(
      60,
      Math.max(2, Number(r.durationSec ?? dur.perSceneCenterSec)),
    ),
  }));
  if (skeleton.length !== expectedCount) {
    throw new Error(
      `叙事方案：sceneSkeleton 条数为 ${skeleton.length}，必须为 ${expectedCount}。`,
    );
  }
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i].index !== i + 1) {
      throw new Error(
        `叙事方案：sceneSkeleton index 须自 1 连续递增，期望 ${i + 1}，实际 ${skeleton[i].index}。`,
      );
    }
    if (!skeleton[i].beat) {
      throw new Error(`叙事方案：第 ${i + 1} 条 beat 不得为空。`);
    }
  }
  return skeleton;
}

/** 将 L1 模型输出或客户端快照归一为内部结构 */
export function parseAndNormalizeSpine(args: {
  parsed: unknown;
  expectedSkeletonCount: number;
  dur: VideoDurationPreset;
}): ParsedSpine {
  const o = args.parsed as RawSpineInput;
  const sceneSkeleton = parseSceneSkeleton(
    o.sceneSkeleton,
    args.expectedSkeletonCount,
    args.dur,
  );
  const reviewChecklist = reviewFromRaw(o);

  const storyArc = parseStoryArcFromRaw(o);
  if (!storyArc) {
    throw new Error(
      "叙事方案：须提供完整 storyArc（milestones、peak、closing）。",
    );
  }

  validateStoryArc(storyArc, args.dur);

  return {
    storyArc,
    sceneSkeleton,
    reviewChecklist,
  };
}

export function formatStoryArcForPrompt(storyArc: StoryArc): string {
  return JSON.stringify(storyArc, null, 2);
}

export function formatReviewChecklistForPrompt(
  checklist: ReviewChecklist,
): string {
  if (
    !checklist.factsToVerify.length &&
    !checklist.publishCautions?.trim()
  ) {
    return "（无额外核对项）";
  }
  return JSON.stringify(checklist, null, 2);
}

export function spineSnapshotToParseInput(
  snap: StoryboardSpineSnapshot,
): unknown {
  return {
    storyArc: snap.storyArc,
    sceneSkeleton: snap.sceneSkeleton,
    reviewChecklist: snap.reviewChecklist,
  };
}

export function buildSpineSnapshotFromParsed(
  parsed: ParsedSpine,
): StoryboardSpineSnapshot {
  return {
    storyArc: parsed.storyArc,
    sceneSkeleton: parsed.sceneSkeleton,
    reviewChecklist: parsed.reviewChecklist,
  };
}

export function buildSpineSnapshotFromResult(result: {
  storyArc: StoryArc;
  sceneSkeleton: SceneSkeletonEntry[];
  reviewChecklist: ReviewChecklist;
}): StoryboardSpineSnapshot {
  return {
    storyArc: result.storyArc,
    sceneSkeleton: result.sceneSkeleton,
    reviewChecklist: result.reviewChecklist,
  };
}
