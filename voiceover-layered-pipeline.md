# HistorAI：分层口播（叙事 → 整稿 → 切片）实施方案

## 0. 前提（开发阶段 / 终态唯一）

项目**尚未上线**，仍处于开发阶段。**不要求**保留「旧版一次性生成」等行为作为并行分支。

- **终态目标**：下文描述的 **L0→L1→L2→L3→L4 分层管线**即为默认且唯一的文案生成架构。
- **代码层面**：现有与之冲突的路径应 **删除或改写**，而非长期并存「legacy / 兼容模式」。例如：`storyboard-orchestrator` 中与「叙事骨架后直接凭 beat 写口播、无整稿层」等价的老逻辑，应在落地分层后移除；**单次整包（single-shot）**若与分层不一致，则改为内部同样走 L1→L2→L3（或可删除该分支，仅保留分阶段调用），**不以**「保留旧 single-shot」为约束。

**版本**：与仓库当前结构对齐（Next.js App Router、`storyboard-orchestrator`、叙事骨架 + 分块扩写）。  
**后续开发**：按文末「实施顺序」改代码时以本文为终态对照。

---

## 1. 目标与原则

### 1.1 目标

- 产品形态仍是「系列 + 人物 + 切片标题/切口 → 分镜表（含口播）+ 多媒体」，但**文案生成**必须先经过 **整稿口播** 中间层，再落到 `scenes[].narration` 与 `visualDescription`。
- 提升叙事连贯性、减少切片间口径漂移；支持用户编辑「一稿口播」后再执行「对齐分镜 / 补画面」（可跳过重复 L2）。

### 1.2 原则

- **单一默认管线**：不设「经典流程 vs 分层流程」双开关；界面与 API 面向分层终态设计。
- **结构层复用**：**叙事骨架**（`sceneSkeleton`、`hook`、`timeline`）继续承担镜数、beat、时长与叙事节点；**整稿口播（L2）**始终在叙事骨架之后、声画扩写（L3）之前。
- **口播事实源**：生成链路中以 **L2 产出（及用户确认后的 override）** 为口播正文依据；L3 只做对齐时长、口语化微调与画面描述，**不得**改写事实或人称立场。

---

## 2. 与代码模块的对应关系（迁移指向）

| 当前模块 | 文件/位置 | 终态角色 |
|----------|-----------|-----------|
| 叙事骨架 | `buildSpine*`、`parseAndValidateSpine` | **L1** 结构层，保留并沿用 |
| 分块扩写 | `buildChunkUserPrompt`、`parseChunkScenes` | **L3**；输入**必须**绑定 L2 脚本片段 |
| 单次整包 | `storyboard-orchestrator` → `single-shot` | **删除或改为**与 chunked 相同的 L1→L2→L3（禁止长期保留「一跳产出全套口播且无整稿阶段」） |
| 归一化 | `storyboard-normalize.ts`、`merge-hook-narration.ts` | 合并整稿与分镜结果；hook 与首镜规则与 L2/L3 约定一致 |
| API | `api/generate/route.ts` | 请求体体现分层输入（含可选 `voiceoverFullTextOverride`） |
| UI | `PersonStudioWorkspace.tsx` | 常驻展示/编辑口播稿；支持「仅按稿重跑 L3」 |

---

## 3. 数据模型（类型层）

`GenerationResult`（或等价响应）在终态上应**携带整稿口播**，便于展示与二次请求：

1. **`voiceoverFullText`**  
   必填（成功生成时）：一整段口播正文，顺读即为成片口播主干；可含换行。

2. **`voiceoverParagraphs`**  
   推荐：与镜号一一对应的段落数组，长度等于 `scenes.length`，降低 L3 对齐歧义；可由 L2 JSON 直接给出或通过校验强制。

3. **前端状态 `voiceoverLocked`（可选）**  
   仅 UI：表示用户已确认稿，后续只触发 L3（或带 override 的请求）。

**一致性**：若用户提交 `voiceoverFullTextOverride`，则以 override 作为 L2 事实源进入 L3；重跑后 `scenes[].narration` 须与该稿对齐。

---

## 4. 管线分层（逻辑阶段）

| 阶段 | 名称 | 输入 | 输出 |
|------|------|------|------|
| L0 | 上下文 | 系列、人物、切片标题/切口、时长、tone、画风等 | 规范化上下文 |
| L1 | 叙事骨架（结构） | L0 | `hook`、`timeline`、`sceneSkeleton[]` |
| L2 | 整稿口播 | L0 + L1 | `voiceoverFullText`（及推荐 `voiceoverParagraphs`） |
| L3 | 声画扩写 | L1 + L2（或 override） | `scenes[]`：`narration` + `visualDescription` |
| L4 | 归一化 | 合并 | `GenerationResult` |

**说明**：无论成片时长触发「单次 HTTP 响应」还是「多 phase 调试日志」，**逻辑顺序**均为上表；实现上可将 L1–L3 串在同一 handler 内，也可拆为多 endpoint，但**不得**再提供绕过 L2 的默认生成路径。

---

## 5. Prompt 与校验

### 5.1 L2 整稿口播（`storyboard-prompts.ts` 等）

- 角色：HistorAI 口播撰稿人；输出合法 JSON（含 `voiceoverFullText`，推荐含与镜数一致的 `paragraphs`）。
- 上下文：复用 `buildStoryboardContextPrefix` 与产品规则（人称、stakes、唯一高峰、峰终、禁止编年等）。
- 硬约束：镜数 = `targetScenes`；各镜时长参考 `skeleton[i].durationSec`；约 3～4 汉字/秒；全文顺读须讲完本切片。
- 校验：字数区间、人称、`paragraphs.length === targetScenes`（若采用 paragraphs）。

### 5.2 L3 分块扩写

- **必须**注入本块对应脚本文本；明确：仅允许为时长与口语节奏微调，不得新增相反事实或改变人称。
- `previousLastNarration` 仅服务语气衔接，**不**覆盖脚本边界内的实质内容。

### 5.3 重试

- L2 失败：带错误信息重试 L2。
- L3 某 chunk 失败：仅重试该 chunk，且**固定同一 L2 子串**。

---

## 6. API 设计

以 `POST /api/generate` 为主（或拆分为多路由，语义等价即可）：

- **`stopAfterSpine`（可选）**  
  为 true 时仅跑 **L1**，响应 `pipelinePending: "voiceover"`，`voiceoverFullText` 为空，待下一步生成整稿。

- **`generateVoiceoverOnly`（可选）**  
  为 true 时须同时传 **`spineSnapshot`**，仅跑 **L2**；响应 `pipelinePending: "scenes"`，`scenes` 仍为空。

- **`stopAfterVoiceover`（可选）**  
  为 true 时在同一次请求内顺序执行 **L1+L2**，不跑 L3；响应 `pipelinePending: "scenes"`（两步节奏）。

- **`pipelinePending`（响应字段）**  
  `"voiceover"`：仅有叙事骨架；`"scenes"`：已有整稿，待 L3；有分镜后为 undefined。

- **`voiceoverFullTextOverride`（可选）**  
  用户编辑后的口播全文。**终态语义**：override **替代本次的 L2 模型输出**；跑 L3 时仍以该文本为口播依据。  
  典型场景：用户已完成至少一次完整生成（已有 L1），只改口播再「按稿重出分镜」——此时应附带 **L1 快照**（见下节），服务端跳过 L1/L2 调用或仅跳过 L2，直接进入 L3。

- **不再使用** `voiceoverPipeline: "legacy" | "script-first"` 这类双模式字段；默认即分层。

若拆分为 `generate-spine` / `generate-voiceover` / `generate-scenes`，属于实现拆分，产品语义仍为上节五阶段。

### 6.1 Override 时 L1（叙事骨架）从哪来？

L3 的扩写 prompt 依赖 **L1**：`hook`、`timeline`、`sceneSkeleton`（镜数、每镜 beat、`durationSec` 等）。用户只改口播、不重跑叙事骨架时，这些结构必须有一次带到服务端，否则无法按现有「按骨架扩写」的方式生成 `scenes`。

**「缓存」**在此指：**本次请求里 L1 结果由谁提供**，常见两种实现（二选一或组合即可）：

| 方式 | 做法 |
|------|------|
| **客户端带回** | 上次完整生成后，前端保存响应中的叙事骨架字段；点击「按稿重跑」时，请求体除 `voiceoverFullTextOverride` 外，再传一份 **L1 快照**（如 `spine` / `hook` + `timeline` + `sceneSkeleton`）。服务端不重复调用 L1 模型。 |
| **服务端存储** | 完整生成后由服务端写入草稿（session id、用户草稿 id、KV 等）；override 请求只带 id + 新口播，服务端读取上次保存的 L1 再跑 L3。 |

既不重跑 L1、又不带回或取回叙事骨架，则 L3 缺少镜数与 beat，与当前架构不兼容。MVP 可优先 **客户端带回 L1 快照**，实现成本最低。

---

## 7. 前端（PersonStudioWorkspace）

1. **生成节奏**：三步（L1 → L2 → L3）/ 两步（L1+L2 → L3）/ 一步（全流程一次请求），由界面下拉选择。
2. **仅 L1 阶段**：展示叙事骨架与时间线；口播区提示下一步生成整稿。
3. **口播全文**：整稿生成后可编辑；**AI 润色**走独立 `POST /api/polish-voiceover`。
4. **「生成分镜 / 按稿重出分镜」**：提交 `voiceoverFullTextOverride` + `spineSnapshot`，服务端执行 L3。
5. **调试**：`LlmDebugPhase` 含 `narrative_skeleton`、`voiceover-script`、各 chunk。

---

## 8. 实施顺序

1. **类型**：`GenerationResult` 纳入 `voiceoverFullText` / `voiceoverParagraphs`；归一化透传。
2. **Orchestrator**：叙事骨架（L1）之后插入 L2；chunk **仅**在 L2（或 override）存在时运行；**移除或改写**原「无 L2 的 chunk / single-shot」路径。
3. **Prompt**：新增 L2；改写 `buildChunkUserPrompt`。
4. **API**：支持 override；删除双 pipeline 参数（若曾设计）。
5. **UI**：口播编辑区 + 按稿重跑。
6. **回归**：短时长、长时长 + 分块、override 重跑各测一条。

---

## 9. 风险与规避

| 风险 | 规避 |
|------|------|
| 脚本段数与镜数不一致 | L2 强制 `paragraphs.length === targetScenes`；否则 L3 切段校验失败重试 |
| 长成片 token | L2 按 chunk 边界分段生成子稿再拼接，仍为同一逻辑分层 |
| hook 与首镜 | 在 prompt 与 `merge-hook-narration` 中统一：hook 是否并入整稿首段 |

---

## 10. 文档维护

- 实现命名若与本文不一致，更新本文对照即可。
- 细粒度文案规则以 `storyboard-prompts.ts` 为准；本文锁定**分层职责与终态架构**。
