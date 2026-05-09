import type { StoryboardScene } from "@/lib/types";

/** 将黄金 hook 并入第一镜 narration，供轻剪辑时间线口播与字幕；若首句已以 hook 开头则不重复拼接。 */
export function mergeHookIntoFirstSceneNarration(
  hook: string,
  scenes: StoryboardScene[],
): StoryboardScene[] {
  const h = hook.trim();
  if (!h || scenes.length === 0) return scenes;

  const [first, ...rest] = scenes;
  const n = first.narration.trim();
  const narration = !n ? h : n.startsWith(h) ? n : `${h}\n${n}`;
  return [{ ...first, narration }, ...rest];
}
