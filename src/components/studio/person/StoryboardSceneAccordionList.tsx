"use client";

import type { StoryboardScene } from "@/lib/types";
import { type Dispatch, type SetStateAction } from "react";

const badgeBase =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 tabular-nums";
const badgeSuccess = `${badgeBase} bg-emerald-950/50 text-emerald-100/90 ring-emerald-800/40`;
const badgeRunning = `${badgeBase} bg-amber-950/45 text-amber-50/90 ring-amber-700/35`;
const badgeFail = `${badgeBase} bg-rose-950/40 text-rose-100 ring-rose-800/40`;
const badgeMuted = `${badgeBase} bg-zinc-900/90 text-zinc-500 ring-zinc-800/70`;

const storyboardOpBtnBase =
  "inline-flex min-h-[2.35rem] shrink-0 items-center justify-center rounded-lg px-3 py-2 text-center text-[11px] font-semibold leading-tight tracking-wide transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";
const storyboardOpPrimaryBtn = `${storyboardOpBtnBase} border border-amber-500/45 bg-gradient-to-b from-amber-500/[0.18] to-amber-950/30 text-amber-50 shadow-sm hover:border-amber-400/55`;
const storyboardOpSecondaryBtn = `${storyboardOpBtnBase} border border-zinc-600/85 bg-zinc-900/55 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800/50`;
const storyboardOpCoverRefBtn = `${storyboardOpBtnBase} border border-amber-400/35 bg-amber-950/20 text-amber-100/95 hover:border-amber-400/50`;
const storyboardOpTtsBtn = `${storyboardOpBtnBase} border border-sky-500/40 bg-gradient-to-b from-sky-500/16 to-sky-950/45 text-sky-50 hover:border-sky-400/50`;

const sceneAccordionClass =
  "group/scene rounded-xl border border-zinc-800/60 bg-zinc-950/40 ring-1 ring-zinc-800/35 open:bg-zinc-950/55 open:ring-amber-900/20";
const sceneSummaryClass =
  "flex cursor-pointer list-none items-start gap-3 px-3 py-3 marker:content-none sm:items-center sm:gap-4 sm:px-4 sm:py-3.5 [&::-webkit-details-marker]:hidden";

export type SceneAssetRow = {
  sceneIndex: number;
  status: "idle" | "running" | "success" | "failed";
  url?: string;
  error?: string;
};

export type SceneKeyframeRowState = {
  keyframeIndex: number;
  visualPrompt: string;
  status: "idle" | "running" | "success" | "failed";
  url?: string;
  error?: string;
};

export type SceneKeyframePlanUi = {
  keyframeCount: number;
  keyframes: SceneKeyframeRowState[];
  planningBusy: boolean;
  planningError: string | null;
  generatingKeyframeIndex: number | null;
};

export type SceneTtsRow = {
  status: "idle" | "running" | "success" | "failed";
  error?: string;
};

export type StoryboardSceneAccordionListProps = {
  scenes: StoryboardScene[];
  assets: Record<number, SceneAssetRow>;
  sceneTtsByIndex: Record<number, SceneTtsRow>;
  sceneKeyframeUiByScene: Record<number, SceneKeyframePlanUi>;
  sceneExpandedByScene: Record<number, boolean>;
  onSceneExpandedChange: Dispatch<SetStateAction<Record<number, boolean>>>;
  latestCoverUrl: string | null;
  subject: string;
  profileId: string;
  imageProfileId: string;
  volcTtsEffectiveVoiceType: string;
  loading: boolean;
  sceneTtsBatchBusy: boolean;
  resolveReferenceForScene: (
    sceneIndex: number,
    urlByIndex: Record<number, string>,
    snapshot: Record<number, SceneAssetRow>,
    standaloneCoverUrl: string | null,
  ) => { referenceImageUrl?: string; referenceRole?: "previous" | "cover" };
  onRunSingleAsset: (
    sceneIndex: number,
    visual: string,
    narration: string,
    ref?: { referenceImageUrl?: string; referenceRole?: "previous" | "cover" },
  ) => void;
  onRunSceneTts: (sceneIndex: number, narration: string) => void;
  onRunPlanSceneKeyframes: (sceneIndex: number, force: boolean) => void;
  onBatchGenerateSceneStills: (sceneIndex: number) => void;
  onRunSceneKeyframeFillMissing: (sceneIndex: number) => void;
  onRunSingleKeyframeAsset: (
    sceneIndex: number,
    keyframeIndex: number,
    visual: string,
    referenceImageUrl: string,
  ) => void;
  onSetSceneKeyframeUi: Dispatch<
    SetStateAction<Record<number, SceneKeyframePlanUi>>
  >;
  onError: (message: string) => void;
};

function narrationPreview(text: string, max = 80): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "（无口播）";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function ImageStatusBadge({
  status,
  error,
  label,
}: {
  status: SceneAssetRow["status"] | undefined;
  error?: string;
  label: string;
}) {
  if (status === "running") return <span className={badgeRunning}>生成中</span>;
  if (status === "success") return <span className={badgeSuccess}>{label}</span>;
  if (status === "failed") {
    return (
      <span className={badgeFail} title={error}>
        失败
      </span>
    );
  }
  return <span className={badgeMuted}>未生成</span>;
}


function KeyframeCard({
  sceneIndex,
  kf,
  kfUi,
  row,
  imageProfileId,
  onVisualPromptChange,
  onGenerateKeyframe,
}: {
  sceneIndex: number;
  kf: SceneKeyframeRowState;
  kfUi: SceneKeyframePlanUi;
  row: SceneAssetRow | undefined;
  imageProfileId: string;
  onVisualPromptChange: (keyframeIndex: number, value: string) => void;
  onGenerateKeyframe: (keyframeIndex: number) => void;
}) {
  const thumbUrl =
    kf.keyframeIndex === 1 ?
      (row?.url?.trim() || kf.url?.trim())
    : kf.url?.trim();
  const kfBusy = kfUi.generatingKeyframeIndex === kf.keyframeIndex;
  const isPrimary = kf.keyframeIndex === 1;

  const statusBadge =
    isPrimary ?
      row?.status === "running" || kfBusy ? (
        <span className={badgeRunning}>主图生成中</span>
      ) : row?.status === "success" ? (
        <span className={badgeSuccess}>主静图</span>
      ) : row?.status === "failed" ? (
        <span className={badgeFail} title={row.error}>
          失败
        </span>
      ) : (
        <span className={badgeMuted}>未生成</span>
      )
    : kf.status === "running" || kfBusy ? (
        <span className={badgeRunning}>生成中</span>
      ) : kf.status === "success" ? (
        <span className={badgeSuccess}>已出图</span>
      ) : kf.status === "failed" ? (
        <span className={badgeFail} title={kf.error}>
          失败
        </span>
      ) : (
        <span className={badgeMuted}>未生成</span>
      );

  return (
    <div
      className={`flex shrink-0 flex-col gap-2 rounded-lg border border-zinc-800/70 bg-zinc-950/50 p-2.5 ring-1 ring-zinc-800/30 ${isPrimary ? "w-[10.5rem]" : "w-36"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-amber-100/90">
          {isPrimary ? "关键帧 1 · 主静图" : `关键帧 ${kf.keyframeIndex}`}
        </span>
        {statusBadge}
      </div>
      {thumbUrl ? (
        <div className="overflow-hidden rounded-lg bg-black/40 ring-1 ring-zinc-700/70">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt={`第 ${sceneIndex} 镜 关键帧 ${kf.keyframeIndex}`}
            className={`aspect-[9/16] w-full object-cover object-center ${isPrimary ? "max-h-44" : "max-h-36"}`}
          />
        </div>
      ) : (
        <div className="flex aspect-[9/16] max-h-36 items-center justify-center rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 text-[10px] text-zinc-600">
          无预览
        </div>
      )}
      <label className="block text-[10px] font-medium text-zinc-500">
        画面描述
        <textarea
          className="mt-1 max-h-20 w-full resize-y rounded border border-zinc-800/80 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-200 focus:border-amber-600/35 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
          rows={2}
          value={kf.visualPrompt}
          onChange={(e) => onVisualPromptChange(kf.keyframeIndex, e.target.value)}
        />
      </label>
      {!isPrimary ? (
        <button
          type="button"
          disabled={!imageProfileId || kfBusy || kfUi.planningBusy}
          className={storyboardOpSecondaryBtn}
          onClick={() => onGenerateKeyframe(kf.keyframeIndex)}
        >
          生成此帧
        </button>
      ) : null}
      {!isPrimary && kf.status === "failed" && kf.error ? (
        <p className="text-[10px] leading-snug text-rose-300/90">{kf.error}</p>
      ) : null}
    </div>
  );
}

export function StoryboardSceneAccordionList(props: StoryboardSceneAccordionListProps) {
  const {
    scenes,
    assets,
    sceneTtsByIndex,
    sceneKeyframeUiByScene,
    sceneExpandedByScene,
    onSceneExpandedChange,
    latestCoverUrl,
    subject,
    profileId,
    imageProfileId,
    volcTtsEffectiveVoiceType,
    loading,
    sceneTtsBatchBusy,
    resolveReferenceForScene,
    onRunSingleAsset,
    onRunSceneTts,
    onRunPlanSceneKeyframes,
    onBatchGenerateSceneStills,
    onRunSceneKeyframeFillMissing,
    onRunSingleKeyframeAsset,
    onSetSceneKeyframeUi,
    onError,
  } = props;

  const buildUrlByIndex = () => {
    const urlBy: Record<number, string> = {};
    for (const [k, v] of Object.entries(assets)) {
      const idx = Number(k);
      if (v.status === "success" && v.url) urlBy[idx] = v.url;
    }
    return urlBy;
  };

  const updateKeyframePrompt = (
    sceneIndex: number,
    keyframeIndex: number,
    value: string,
  ) => {
    onSetSceneKeyframeUi((prev) => {
      const cur = prev[sceneIndex];
      if (!cur) return prev;
      return {
        ...prev,
        [sceneIndex]: {
          ...cur,
          keyframes: cur.keyframes.map((r) =>
            r.keyframeIndex === keyframeIndex ? { ...r, visualPrompt: value } : r,
          ),
        },
      };
    });
  };

  return (
    <div className="flex gap-3 sm:gap-4">
      <nav
        className="hidden w-11 shrink-0 flex-col gap-1 pt-1 lg:flex"
        aria-label="镜号快速跳转"
      >
        {scenes.map((s) => (
          <a
            key={`nav-${s.index}`}
            href={`#scene-card-${s.index}`}
            className="flex size-9 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-950/60 text-[11px] font-bold tabular-nums text-zinc-400 ring-1 ring-zinc-800/40 transition hover:border-amber-600/35 hover:text-amber-100"
          >
            {s.index}
          </a>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-2">
        {scenes.map((s) => {
          const row = assets[s.index];
          const ttsRow = sceneTtsByIndex[s.index];
          const kfUi = sceneKeyframeUiByScene[s.index];
          const expanded = Boolean(sceneExpandedByScene[s.index]);
          const thumbK1 = row?.url?.trim();

          const sortedKfs =
            kfUi?.keyframes ?
              [...kfUi.keyframes].sort((a, b) => a.keyframeIndex - b.keyframeIndex)
            : [];

          return (
            <details
              key={`scene-${s.index}`}
              id={`scene-card-${s.index}`}
              open={expanded}
              className={sceneAccordionClass}
              onToggle={(e) => {
                const el = e.currentTarget;
                onSceneExpandedChange((prev) => ({
                  ...prev,
                  [s.index]: el.open,
                }));
              }}
            >
              <summary className={sceneSummaryClass}>
                <span
                  className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-zinc-800/95 to-zinc-900/95 text-sm font-bold tabular-nums text-amber-100 ring-2 ring-amber-600/20 sm:mt-0"
                  aria-hidden
                >
                  {s.index}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-zinc-900/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-400 ring-1 ring-zinc-700/70">
                      {s.durationSec}s
                    </span>
                    <ImageStatusBadge status={row?.status} error={row?.error} label="静帧" />
                    <ImageStatusBadge
                      status={ttsRow?.status}
                      error={ttsRow?.error}
                      label="语音"
                    />
                    {kfUi && kfUi.keyframeCount > 1 ? (
                      <span className={badgeMuted}>{kfUi.keyframeCount} 关键帧</span>
                    ) : null}
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-snug text-zinc-300/95 sm:line-clamp-1">
                    {narrationPreview(s.narration, expanded ? 200 : 72)}
                  </p>
                </div>
                {thumbK1 && !expanded ? (
                  <div className="hidden w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-700/70 sm:block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbK1}
                      alt=""
                      className="aspect-[9/16] w-full object-cover"
                    />
                  </div>
                ) : null}
                <span className="shrink-0 text-[10px] text-zinc-500 group-open/scene:hidden">
                  展开
                </span>
                <span className="hidden shrink-0 text-[10px] text-zinc-500 group-open/scene:inline">
                  收起
                </span>
              </summary>

              <div className="space-y-4 border-t border-zinc-800/55 px-3 py-4 sm:px-4">
                {s.index > 1 ? (
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    镜间衔接：出图时可优先参考第 {s.index - 1} 镜成片（「按上一镜出图」）。
                  </p>
                ) : null}

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    口播
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-200/95">
                    {s.narration}
                  </p>
                </div>

                <details className="rounded-lg border border-zinc-800/60 bg-zinc-950/35 open:ring-1 open:ring-zinc-800/40">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
                    场面描述（visualDescription）
                  </summary>
                  <p className="border-t border-zinc-800/50 px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-zinc-300/95">
                    {s.visualDescription}
                  </p>
                </details>

                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    本镜操作
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {s.index > 1 ? (
                      <>
                        <button
                          type="button"
                          disabled={row?.status === "running"}
                          className={storyboardOpPrimaryBtn}
                          onClick={() => {
                            const urlBy = buildUrlByIndex();
                            onRunSingleAsset(
                              s.index,
                              s.visualDescription,
                              s.narration,
                              resolveReferenceForScene(
                                s.index,
                                urlBy,
                                assets,
                                latestCoverUrl,
                              ),
                            );
                          }}
                        >
                          按上一镜出图
                        </button>
                        <button
                          type="button"
                          disabled={row?.status === "running"}
                          className={storyboardOpSecondaryBtn}
                          onClick={() =>
                            onRunSingleAsset(
                              s.index,
                              s.visualDescription,
                              s.narration,
                            )
                          }
                        >
                          按切片内容生成
                        </button>
                        {latestCoverUrl ? (
                          <button
                            type="button"
                            disabled={row?.status === "running"}
                            className={storyboardOpCoverRefBtn}
                            onClick={() =>
                              onRunSingleAsset(
                                s.index,
                                s.visualDescription,
                                s.narration,
                                {
                                  referenceImageUrl: latestCoverUrl,
                                  referenceRole: "cover",
                                },
                              )
                            }
                          >
                            按封面重生
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={row?.status === "running"}
                        className={storyboardOpPrimaryBtn}
                        onClick={() => {
                          const urlBy = buildUrlByIndex();
                          onRunSingleAsset(
                            s.index,
                            s.visualDescription,
                            s.narration,
                            resolveReferenceForScene(
                              s.index,
                              urlBy,
                              assets,
                              latestCoverUrl,
                            ),
                          );
                        }}
                      >
                        按分镜出图
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        !s.narration.trim() ||
                        !subject.trim() ||
                        !volcTtsEffectiveVoiceType.trim() ||
                        ttsRow?.status === "running" ||
                        sceneTtsBatchBusy
                      }
                      className={storyboardOpTtsBtn}
                      onClick={() => onRunSceneTts(s.index, s.narration)}
                    >
                      {ttsRow?.status === "running" ? "合成中…" : "生成语音"}
                    </button>
                  </div>
                  {row?.status === "failed" && row.error ? (
                    <p className="mt-2 text-[11px] text-rose-300/95">{row.error}</p>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-xl border border-zinc-800/60 bg-zinc-950/45 p-3 ring-1 ring-zinc-800/35 sm:p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200/55">
                      静帧时间轴
                    </span>
                    {kfUi?.planningBusy ? <span className={badgeRunning}>规划中…</span> : null}
                    {kfUi?.generatingKeyframeIndex != null ? (
                      <span className={badgeRunning}>
                        出图 K{kfUi.generatingKeyframeIndex}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={
                        !subject.trim() ||
                        !profileId ||
                        !imageProfileId ||
                        kfUi?.planningBusy ||
                        kfUi?.generatingKeyframeIndex != null ||
                        row?.status === "running"
                      }
                      className={storyboardOpPrimaryBtn}
                      title="规划本镜关键帧并依次生成 K1～Kn 静帧"
                      onClick={() => onBatchGenerateSceneStills(s.index)}
                    >
                      批量生成本镜静帧
                    </button>
                    <button
                      type="button"
                      disabled={
                        !subject.trim() ||
                        !profileId ||
                        kfUi?.planningBusy ||
                        kfUi?.generatingKeyframeIndex != null
                      }
                      className={storyboardOpSecondaryBtn}
                      onClick={() => onRunPlanSceneKeyframes(s.index, true)}
                    >
                      仅重规划
                    </button>
                    <button
                      type="button"
                      disabled={
                        !subject.trim() ||
                        !imageProfileId ||
                        !kfUi ||
                        kfUi.keyframeCount <= 1 ||
                        kfUi.planningBusy ||
                        kfUi.generatingKeyframeIndex != null
                      }
                      className={storyboardOpSecondaryBtn}
                      onClick={() => onRunSceneKeyframeFillMissing(s.index)}
                    >
                      仅补缺少帧
                    </button>
                  </div>
                  {kfUi?.planningError ? (
                    <p className="text-[12px] text-rose-300/95">{kfUi.planningError}</p>
                  ) : null}

                  {!kfUi ? (
                    <div className="flex flex-wrap items-start gap-3">
                      <p className="min-w-[12rem] flex-1 text-[12px] leading-relaxed text-zinc-500">
                        尚未规划关键帧。可先单张出主静图，再点「批量生成本镜静帧」规划并补齐各帧。
                      </p>
                      {row?.url ? (
                        <div className="w-28 shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-700/70">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.url}
                            alt={`第 ${s.index} 镜主静图`}
                            className="aspect-[9/16] w-full object-cover"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="-mx-1 overflow-x-auto px-1 pb-1">
                      <div className="flex min-w-min items-stretch gap-2">
                        {sortedKfs.map((kf) => (
                          <KeyframeCard
                            key={`kf-${s.index}-${kf.keyframeIndex}`}
                            sceneIndex={s.index}
                            kf={kf}
                            kfUi={kfUi}
                            row={row}
                            imageProfileId={imageProfileId}
                            onVisualPromptChange={(ki, v) =>
                              updateKeyframePrompt(s.index, ki, v)
                            }
                            onGenerateKeyframe={(ki) => {
                              const prevKf = kfUi.keyframes.find(
                                (x) => x.keyframeIndex === ki - 1,
                              );
                              const refUrl =
                                prevKf?.url?.trim() ??
                                (row?.status === "success" && row.url ?
                                  row.url
                                : undefined);
                              if (!refUrl?.trim()) {
                                onError(
                                  `须先完成关键帧 ${ki - 1} 或主静图`,
                                );
                                return;
                              }
                              onRunSingleKeyframeAsset(
                                s.index,
                                ki,
                                kfUi.keyframes.find((x) => x.keyframeIndex === ki)
                                  ?.visualPrompt ?? "",
                                refUrl,
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
