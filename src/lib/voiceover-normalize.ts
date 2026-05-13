/**
 * L2 整稿口播：从模型 JSON 得到 voiceoverFullText + voiceoverParagraphs。
 * **优先** `paragraphs`（恰好 N 条）：服务端用 `\n\n` 拼接为 `voiceoverFullText`。
 * 若仅提供 `voiceoverFullText`，则按双换行切分为段；少切/多切 1～3 段时尽力合并或拆分。
 */

const MAX_SEGMENT_DRIFT = 3;

function mergeOnceMinimalAdjacent(parts: string[]): string[] {
  if (parts.length < 2) return parts;
  let bestI = 0;
  let bestSum = Infinity;
  for (let i = 0; i < parts.length - 1; i++) {
    const sum = parts[i].length + parts[i + 1].length;
    if (sum < bestSum) {
      bestSum = sum;
      bestI = i;
    }
  }
  const merged =
    `${parts[bestI].trimEnd()} ${parts[bestI + 1].trimStart()}`.trim();
  return [...parts.slice(0, bestI), merged, ...parts.slice(bestI + 2)];
}

function splitLongestOnce(parts: string[]): string[] | null {
  if (parts.length === 0) return null;
  let maxI = 0;
  let maxLen = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > maxLen) {
      maxLen = parts[i].length;
      maxI = i;
    }
  }
  const s = parts[maxI];
  const idx = s.search(/[。！？]/);
  if (idx >= 0 && idx < s.length - 1) {
    const a = s.slice(0, idx + 1).trim();
    const b = s.slice(idx + 1).trim();
    if (b.length > 0) {
      return [...parts.slice(0, maxI), a, b, ...parts.slice(maxI + 1)];
    }
  }
  const mid = Math.floor(s.length / 2);
  if (mid < 4 || mid > s.length - 4) return null;
  return [
    ...parts.slice(0, maxI),
    s.slice(0, mid).trim(),
    s.slice(mid).trim(),
    ...parts.slice(maxI + 1),
  ];
}

/** 将段落条数修正为恰好 target（仅当偏差 ≤ MAX_SEGMENT_DRIFT） */
function repairSegmentCount(
  segments: string[],
  target: number,
): string[] | null {
  let s = segments.map((x) => x.trim()).filter((x) => x.length > 0);
  const drift = Math.abs(s.length - target);
  if (drift > MAX_SEGMENT_DRIFT) return null;
  if (s.length === target) return s;

  while (s.length > target) {
    if (s.length < 2) return null;
    s = mergeOnceMinimalAdjacent(s);
  }
  while (s.length < target) {
    const next = splitLongestOnce(s);
    if (next === null) return null;
    s = next;
  }
  return s.length === target ? s : null;
}

function finalize(parts: string[]): {
  voiceoverFullText: string;
  voiceoverParagraphs: string[];
} {
  return {
    voiceoverFullText: parts.join("\n\n"),
    voiceoverParagraphs: parts,
  };
}

export function normalizeVoiceoverPayload(
  parsed: unknown,
  targetScenes: number,
  options?: { errorLabel?: string },
): { voiceoverFullText: string; voiceoverParagraphs: string[] } {
  const label = options?.errorLabel ?? "整稿口播";
  const o = parsed as {
    voiceoverFullText?: string;
    paragraphs?: unknown[];
  };
  const paragraphsRaw = (o.paragraphs ?? [])
    .map((p) => String(p ?? "").trim())
    .filter((s) => s.length > 0);
  const fullTextRaw = String(o.voiceoverFullText ?? "").trim();

  const splitFromFull = fullTextRaw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (paragraphsRaw.length === targetScenes) {
    return finalize(paragraphsRaw);
  }

  const repairedParagraphs = repairSegmentCount(paragraphsRaw, targetScenes);
  if (repairedParagraphs !== null) {
    return finalize(repairedParagraphs);
  }

  if (splitFromFull.length === targetScenes) {
    return finalize(splitFromFull);
  }

  const repairedFromFull = repairSegmentCount(splitFromFull, targetScenes);
  if (repairedFromFull !== null && fullTextRaw.length > 0) {
    return finalize(repairedFromFull);
  }

  if (paragraphsRaw.length > 0) {
    throw new Error(
      `${label}：paragraphs 须恰好 ${targetScenes} 条，当前 ${paragraphsRaw.length}（与目标相差超过 ${MAX_SEGMENT_DRIFT} 条时无法自动修正）。`,
    );
  }

  if (splitFromFull.length > 0) {
    throw new Error(
      `${label}：voiceoverFullText 用空行分段后为 ${splitFromFull.length} 段，须 ${targetScenes} 段（相差超过 ${MAX_SEGMENT_DRIFT} 条时无法自动修正）；且 paragraphs 无法修正到目标条数。`,
    );
  }

  throw new Error(
    `${label}：请提供 **paragraphs**（字符串数组，恰好 ${targetScenes} 条，按镜序）；或提供 voiceoverFullText（镜间双换行分段，可自动修正的偏离须 ≤ ${MAX_SEGMENT_DRIFT}）。`,
  );
}
