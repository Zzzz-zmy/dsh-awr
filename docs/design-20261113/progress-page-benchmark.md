# dsh-awr 进展页 · 对标「上下文」页 对照设计稿（DSH-079）

日期：2026-11-13 ｜ 状态：**待业主点头，未动一行业务代码**
配套高保真稿：`docs/design-20261113/progress-page-mockup.html`（用 dsh-awr 真实台账数据渲染，非假数据）

---

## 0. 先把对标对象说准（不猜）

业主说的「那个上下文 tab 的页面」，我在本机查清了，**不是 DSH 内置页**：

| 事实 | 证据 |
| --- | --- |
| 它是第三方插件 **`dsh-context` 0.83.1**（已装在 desktop profile） | `~/.dsh/profiles/desktop/package.json` → `"dsh-context": "0.83.1"` |
| 它提供：会话内 **上下文 Tab**、**编队 Tab**、侧边栏 **上下文洞察** 总览页、`/context` 命令、右侧面板 | 同插件 `README.md` L15-21、`locale/zh.json` meta.title「上下文 (dsh-context)」 |
| DSH 本体（app.asar 0.2.2-rc.2）只有 聊天/轨迹/统计 三个会话视图，没有叫「上下文」的 tab | asar 静态扫描：`conversation.view` 仅 chat/trajectory/stats；`view.stats` 中文标签=「统计」 |
| 它的页面级设计语言我全部拿到了：中文文案表 **734 条** + README 每张卡片「解答的问题」 | 从 `lib/client.js` locale 表提取（`/tmp/dshref/ctx-zh.json`） |

下面所有"抄它"的地方，都以它的真实文案/结构为准，不靠印象。

---

## 1. 它为什么"该有的都有"——可复制的设计 DNA（10 条）

| # | 它的做法 | 真实证据（中文文案原文） | 我们要落成什么 |
| --- | --- | --- | --- |
| 1 | **每张卡片只回答一个问题**，README 直接把问题写进表头 | "Context Stats＝这个会话跑得怎么样 / Token Stats＝Token 花在哪 / Current Context＝此刻窗口里有什么" | 进展页每个区块标题下写死一句「回答的问题」 |
| 2 | **口径写在 tooltip / 副行里，绝不裸奔** | `stats.billedTip`「Token 用量为计费合计：未缓存输入、缓存读取、缓存写入与输出」；`timing.toolsBusyTip` 连"并行调用会重叠、等用户不计入"都写清 | 每个指标带 `title` 口径句；AWR 的 `accounting.detail` 直接当口径用 |
| 3 | **估算值一律带 `~` / 「（估算）」，实测值并列** | `overview.estimate = tokens（估算）`、`overview.ofUsed = 占已用上下文` | 凡是我们推导出来的数（卡龄、完成率）标 `~`；AWR 原样给的数不标 |
| 4 | **空态说清"为什么空 + 什么时候会有"** | `ov.usage.empty = 近 7 天暂无用量 — 会话产生模型请求后，这里会显示每日 Token 与费用` | 三类空态文案：无台账 / 台账读不了（已有）/ 有台账但该类事件为 0 |
| 5 | **筛选标签自带计数，点击全站联动** | `files.kind.*` 兼筛选器；`stats.*Jump` 一堆跳转胶囊（"在上下文浏览器中展开该工具的运行结果"） | 状态 chip 点=筛；工作项胶囊点=开抽屉；抽屉里每个字段点=跳证据 |
| 6 | **堆叠条以"全量"为基准，连"预留/未知"都画出来（斜纹）** | `overview.reserveHeadroom = 压缩预留空间`、`overview.reserveTrigger = 自动压缩触发线` | 台账状态分布条：done/active/ready/blocked/waiting + 斜纹「不计入统计(archived)」 |
| 7 | **事件流＝类型标签(带总数) + 净变化 + 精确定位** | `kind.* = 注入/压缩/剪枝/切换/模式`；`ev.compaction = 压缩上下文（摘要替换 {n} 条消息）`；`events.at = T{t} S{s}` | 台账事件流：登记/认领/推进/阻塞/解除/验收/回退 + 状态净变化 + `rev 118` 定位 |
| 8 | **趋势图可切 Step/Turn、Total/Delta，事件标在发生的那根柱上** | `gran.step/turn`、Delta 模式"压缩向下延伸" | 台账趋势：按天 revision/提交柱，Delta 模式=新增−完成，阻塞事件画在当天柱上 |
| 9 | **相对时间 + 密集小字排版**（`ov.time.h = {n} 小时前`，数字 `tabular-nums`） | 同上 | 卡龄/最近更新全部相对时间，数字等宽 |
| 10 | **编队 Tab：摘要条 + 泳道时间线 + 协作任务（状态筛选 + blocked-by 依赖链点亮）** | `fleet.pulse.agents/running/tasks/messages`；README L199-201 | AWR 天生就是这个：**谁认领了什么**——6 个真实 session + claim 关系直接铺泳道 |

**我们比它多出来的东西**（不是抄，是 AWR 语义自带的护城河）：依赖图/分层、认领与冲突、可解释等待（`explainable_waits` 带释放条件）、以及 AWR 官方的**反伪完成率声明**：

> `accounting.detail = "Attach WS-040 account_approved_scope output; never invent a blended completion percent"`

它算不出总完成度就不给，我们同样不给——并把这句口径原样摆到页面上。这比"显示一个百分比"更可信。

---

## 2. 逐区块对照：它的卡片 → 我们的卡片 → 数据到底从哪来

数据列全部核对过 `awr overview snapshot --json`（rev 118）与面板 `progress.json`（schema 2）真实字段，**没有一条是我造的**。

| dsh-context 的卡片 | 回答的问题 | dsh-awr 对应卡片 | 真实数据源 | 现状 |
| --- | --- | --- | --- | --- |
| Context Stats（轮次/步数/输入输出） | 这个会话跑得怎么样 | **台账统计**：工作项 45 · 完成 42 · 进行 2 · 待办 1 · 阻塞 0 · 会话 6 | `counts{}` 已有 | ✅ 有数字，缺"回答的问题"+口径 |
| Token Stats 六色堆叠条（占窗口 % + 斜纹预留） | Token 花在哪 | **状态分布条**：done/active/ready/blocked/waiting 分色 + 斜纹不计入项；总长=在办项占全量 | `nodes[].state` | ⚠️ 待做 |
| Current Context（此刻窗口里有什么） | 此刻在干什么 | **此刻在做**：当前认领项 + 认领 Agent + 模型 + 开始时间 | `sessions[]`（6 条真数据，含 `work_item_id`/`model`/`started_at`） | ❌ 完全没有 |
| Context Trend（每请求一根柱 + 事件标记） | 怎么演变到今天 | **台账趋势**：按天 修订/提交 柱，Delta 模式（新增−完成），阻塞/解锁标在当天 | 需 host 侧从 `events`/git log 归集（`events.events` 当前=空数组，须诚实显示空态） | ❌ 待做，含空态 |
| Context Browser（某请求由什么组成，逐项展开看原文 + vs 上一轮 +N/±Nk） | 这一项凭什么算完成 | **工作项明细抽屉**：验收标准逐条列出 + evidence 原文 + 与上一 revision 差异徽标 | `mainline_graph[].outcomes[]`（真有条文，如 DSH-077 两条）、`tech.source/where` | ⚠️ 抽屉已有，缺逐条验收 + 差异徽标 |
| Context Events（类型筛选带总数 + 净变化 + T/S 定位） | 状态什么时候为何变的 | **台账事件流**：登记/认领/推进/阻塞/解除/验收/回退 + `rev` 定位 | `events.events`（当前空）→ 空态文案；有则渲染 | ❌ 待做 |
| File Activity（每文件一行 +N/−M 行，点击跳工具结果） | Agent 对文件做了什么 | **改动与证据**：本次任务改了哪些文件、行数、commit 链接 | git（host 侧），evidence 路径 | ❌ 待做（P2） |
| 命令执行（跑了什么/耗时/退出码/程序分布） | 用什么验证的 | **验证记录**：`node --test` 405/376/0 这类实测事实 + 耗时 | 需 ledger evidence 结构化（P2） | ❌ 待做 |
| 上下文洞察页（KPI 栏 + 7天图 + 8周热力图 + 会话卡片） | 跨会话我整体在什么状态 | **AWR 总览页**（跨项目）：KPI 栏 + 提交热力图 + 项目卡片（状态分布环 + 阻塞数 + 最近活动） | 需 host 侧多项目聚合（P2） | ❌ 新页面 |
| 编队 Tab（摘要条 + 泳道 + 协作任务 + blocked-by 链） | 谁在做什么、谁卡谁 | **协作视图**：Agent 泳道 + 工作项按认领分组 + 依赖链点亮 | `sessions[]` + `nodes[].dependsOn/unlocks`（已有） | ⚠️ 有图无泳道 |
| `/context` 命令（不离开聊天看构成） | 快速一瞥 | **`/awr` 命令**：当前工作项 + 下一步 + 阻塞 弹窗 | 面板 `progress.json` | ❌ 待做（P2） |

---

## 3. 业主点名的「下一步做什么」——三层重做方案（P0）

### 3.1 现在为什么不合格

现在只是把台账 `next_action` 整段文本原样贴出来（DSH-077 那条 200+ 字，一句话里塞了 PR 链接、验收清单、①②③待办）。**这是偷懒，不是设计。**

### 3.2 三层结构

| 层 | 内容 | 取数规则（真实、可降级） | 用 DSH-077 真实数据的样子 |
| --- | --- | --- | --- |
| **① 结论** | 一句话，≤40 字，动词开头，说"下一步做什么" | 取该项 `next_action` 的第一句（按 `。/；/（①` 切）；切不出就取前 40 字并标 `…`；**永不编造** | 「PR #1 已开，等业主八项像素验收后合并」 |
| **② 归因** | 归属哪一项、谁认领、卡在哪、什么时候动的、依据是什么 | `next.key/title/state`；`claimedBy`（无则显示「未认领」）；`blocker`/`wait.release`；`changedAt`→相对时间；`nav.guidance.basis` 原文当"依据" | 「DSH-077 · 推倒重来·节点4 · 进行中 · **未认领** · 依据：Work DSH-077 (推倒重来·节点4: 真机验收与合并)」 |
| **③ 指标** | 让"下一步有多远"可量化 | 主线完成度 `lanes[]` done/total；验收标准条数 `outcomes.length`（**AWR 未透出勾选状态，就不显示 x/y 已勾选，改为列出条文**）；状态分布条；`accounting` 口径原样 | 「主线 DSH：41/44 完成 · 本项验收标准 2 条（AWR 未记录勾选状态）· 台账 45 项：完成 42 / 进行 2 / 待办 1 · AWR 声明：不给混合完成百分比」 |
| **展开** | 「查看完整下一步」→ 原文全量 + `nav.guidance.next_action/recheck` | 原文一字不改 | 现有那段全文 |

**降级规则**（对齐 dsh-context 的"缺就不渲染，绝不半渲染"）：没有 claimedBy 就不出现"未认领"以外的猜测；没有 blocker 就不出现阻塞位；`outcomes` 为空就不出现验收层；`events` 为空就出现带解释的空态而不是假事件。

### 3.3 host 侧改动（向后兼容，schema 仍可在需要时再 +1）

`lib/progress-view.js` 现有 `next: {key, state, text}` → 扩为：

```
next: { key, state, headline, text, refs: [{kind:'work'|'source', key, title?}],
        claimedBy?, blocker?, wait?, changedAt?, basis?, checklist: [{text, done?}] ,
        lane: {id, done, total} }
```

新增字段全部可选，老面板读 `text` 照旧可用；`headline` 由纯字符串切分规则产生（可测、无 LLM、无编造）。

---

## 4. 分期（每步都可测、可回滚、小提交）

| 期 | 范围 | 验收 |
| --- | --- | --- |
| **P0-A** | 下一步三层（结论/归因/指标）+ host 结构化 `next` + 降级 | 单测覆盖：长文本切首句、无 claimedBy、无 outcomes、空 text 不渲染；业主看一眼点头 |
| **P0-B** | 全站对标：区块「回答的问题」副标题、指标口径 title、`~` 前缀规则、空态三分类文案、状态分布堆叠条（含斜纹）、相对时间+tabular-nums | harness 断言每个 section 有 question 文案；分布条宽度按真实 counts；无数据不渲染 |
| **P1** | 此刻在做（sessions 卡片）、台账事件流（含空态）、协作泳道（sessions×dependsOn）、工作项抽屉逐条验收 + 与上一 rev 差异徽标 | 用 rev 118 真机数据截图验收 |
| **P2** | 台账趋势（按天柱+Delta+事件标记）、改动与证据、`/awr` 命令、AWR 跨项目总览页 | 单独再出对照稿，业主拍板后做 |

P0-A + P0-B 是这次要业主点头的部分；P1/P2 只做预约，不动手。

---

## 5. 请业主确认的三件事

1. 三层「下一步」的**层序与内容**（结论 → 归因 → 指标 → 展开原文）是否就是你要的"直观"？
2. **完成率口径**：AWR 官方拒绝给混合百分比，我们照它不给，只给"主线 41/44 + 状态分布 + 验收条文"——接受吗？（想要百分比我就只能用"完成项/总项"这种自造口径，并明确标注是插件自算、非 AWR 结论。）
3. 分期范围：**这次只做 P0-A + P0-B**，P1/P2 排队——还是要我把 P1 的"此刻在做 + 事件流"一起塞进这轮？

> 高保真稿打开即看（真实数据）：`docs/design-20261113/progress-page-mockup.html`
