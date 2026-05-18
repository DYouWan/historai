/**
 * 电影质感封面专用提示 — 与动漫历史/现代封面分离
 */

import { COVER_VERTICAL_LAYOUT_RULES_ANIME_HISTORICAL } from "@/lib/prompts/cover-prompts-anime-historical";
import {
  anchorSubjectLabelForImage,
  safePromptInline,
  SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
} from "@/lib/prompts/cover-prompts-shared";

export function buildPortraitCoverPromptCinematic(opts: {
  subject?: string | null;
  subjectAppearance: string;
  dynasty?: string | null;
}): string {
  const protagonist = anchorSubjectLabelForImage(opts.subject);
  const app = safePromptInline(
    opts.subjectAppearance,
    SUBJECT_APPEARANCE_COVER_PROMPT_MAX,
  );
  const lines: string[] = [];

  lines.push(
    `【封面图｜竖屏外宣·电影质感】唯一视觉中心「${protagonist}」。电影感单帧，镜头与光影偏剧情片静帧；人物外形须与下文「人物形象」一致，忌泛古代肖像或与命题无关的场面。`,
  );
  lines.push(COVER_VERTICAL_LAYOUT_RULES_ANIME_HISTORICAL);
  lines.push(`【人物形象】须如实体现：${app}`);

  const dyn = opts.dynasty?.trim();
  if (dyn) {
    lines.push(
      `【时代服饰】须符合「${safePromptInline(dyn, 48)}」的常见冠服与器物气质；勿混用其它朝代典型装束。`,
    );
  }

  return lines.join("\n");
}
