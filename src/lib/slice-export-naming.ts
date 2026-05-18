/**
 * 切片导出路径/文件名拼装（无 Node fs，可供客户端与服务端共用）
 */

export function sanitizeExportSegment(s: string, max: number): string {
  const t = s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return t || "untitled";
}

export function buildSliceExportFolderName(
  subject: string,
  title: string,
): string {
  const folderTitle = title.trim() || "未命名标题";
  return `${sanitizeExportSegment(subject.trim(), 48)}_${sanitizeExportSegment(folderTitle, 80)}`;
}

/** 封面静帧落盘 stem：系列名-主角名-画风-cover（不含叙事时长 1m 等） */
export function buildCoverImageFileStem(params: {
  seriesTitle: string;
  sliceTitle?: string;
  subject: string;
  stylePreset: string;
}): string {
  const series =
    params.seriesTitle.trim() ||
    params.sliceTitle?.trim() ||
    "未命名系列";
  const hero = params.subject.trim() || "historai";
  const style = params.stylePreset.trim() || "anime";
  const raw = `${series}-${hero}-${style}-cover`.replace(/\s+/g, "-");
  return sanitizeExportSegment(raw, 96);
}
