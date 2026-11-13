# P2 预约项数据勘察备忘（2026-11-13）

## 背景与边界

DSH-079 对照稿（progress-page-benchmark.md）把 P2 四项列为预约、不动手：台账趋势、改动与证据、`/awr` 命令、AWR 跨项目总览。本备忘只做一件事：**用真实命令输出给每项测一次数据体温**，让业主的 P2 决策（要不要做、先做哪个）有事实依据。本文档不实现任何 P2 功能，也不新增页面。

探针环境：lab awr 0.8.0（`.local/awr-lab-080`），只读命令（`status` / `event history` / `overview`），未执行任何写操作。

## 结论一览

| P2 项 | 数据可取性 | 一句话结论 |
| --- | --- | --- |
| AWR 跨项目总览 | ✅ 可取，字段扎实 | 本机 4 个项目，2 个 connected / 2 个 attention，连 AWR 原话的故障原因都是现成的展示素材 |
| 台账趋势 | ✅ 可取，但历史尚浅 | 事件全量可翻（游标分页），但本项目台账今天才开始——初期满屏诚实的「历史还浅」态 |
| 改动与证据 | ⚠️ 半可取 | 台账 evidence 条目与 artifact/checkpoint 引用可读；**逐 commit diff 不是 AWR 的数据**，只能引用不伪造 |
| `/awr` 命令 | ✅ 现状已有 | 插件已注册 command row；P2 说的是扩展语义，属于产品决策不属于数据问题 |

## 1. AWR 跨项目总览 —— 数据实存，建议作为 P2 首选

### 数据来源（已实测）

`~/.local/state/awr/projects.json`（version 3）是 AWR 自己维护的跨项目注册表。本机实测 4 条记录，字段：`name`、`root`、`project_id`、`registered_at`、`last_used_at`、`available`、`state`（connected / attention）、`last_seen_at`、`issue`。

本机真实样本（2026-11-13 采集）：

| 项目 | state | 备注（issue 为 AWR 原话） |
| --- | --- | --- |
| BigDataOps bdp-platform | connected | last_used 有值 |
| dsh-awr | connected | 本项目 |
| awr-console | attention | `storage error: read queries require a current AWR database; use doctor to inspect it` |
| demo | attention | 同上 |

对 connected 项目可再跑 `awr --project <root> status --json` 拿每个项目的真实状态。bdp-platform 实测返回：`blocked_count: 1`、真实中文 `next_action`（「核实 OaFlowApprovalGateway 组件入参与 starter 多选控件协议…」）、`counts{completed,draft,planned}`、`history{business_checked_completed,gap_total,…}`。attention 项目的 status 会直接报错（`storage error: read snapshot requires the current schema…`）——**这正是该显示的**：总览页把 AWR 的 issue 原话呈现出来，不翻译、不粉饰。

### 口径与风险（诚实法约束）

- `projects.json` 是 AWR 内部状态文件，**不是 CLI 稳定契约**。读取失败或格式变化 → 页面显示「读不到注册表」并给出路径，不猜。
- `awr overview --json` 只返回本地 hub service 信息（实测 `{ok, service:{url: http://127.0.0.1:7381, …}}`），hub 的 HTTP API 无契约承诺，**不用**。
- 逐项目 `status --json` 是子进程调用，项目多时有耗时；扫描节奏（进页面时扫一次 / 手动刷新）是实现期决策，默认「进页面扫一次 + 手动重扫」，绝不做后台常驻。
- 不显示跨项目「总完成率」——违反诚实法的混合百分比。

## 2. 台账趋势 —— 可取数，初期就是「历史浅」态

`awr event history --json --limit 100` 支持游标分页，游标是结构化对象（`{created_at, event_id, project_id, project_revision}`），需 JSON 序列化后回传 `--cursor`。实测翻 2 页取到全部 **136 条事件**，17 种类型（source.projected 45、source.freshness_changed 43、checkpoint.created 5、work.progressed 1、proposal.approved 1…）。

关键事实：**136 条事件全部落在 2026-11-13 同一天**——这个项目的台账就是今天建起来的。所以趋势图上线初期只会有一根柱子，此时按空态三分类规矩显示「台账从 <日期> 才开始，到 <X> 日自然成趋势」，而不是画假曲线或缩窗口硬凑。

趋势口径（若业主拍板做）：按天计数 AWR 自己记录的事件，可分「机械噪声」（source.*）与「工作动作」（session/checkpoint/work/proposal.*）两类堆叠，口径写进 `*Tip`。**不发明「完成率曲线」**。

## 3. 改动与证据 —— 台账有，diff 没有

可读：台账 work item 的 `evidence` 条目（YAML 原文）、事件上的 `artifact_id` / `checkpoint_id` / `work_item_id` 引用、`awr evidence` 读子命令。
取不到：逐 commit 的代码 diff——那是 git 的领域，AWR 不存。设计只能做「evidence 条目 + 工件引用列表」，引用可跳到本地文件；**不得用文件改动时间线冒充 diff**。

## 4. `/awr` 命令 —— 现状已有，扩展属产品决策

插件已在 `conversation.chat.commandview` 注册 command row（P0 已交付）。「/awr 命令」作为 P2 项指的是更深的命令语义（例如从输入框直接 claim / 记录进展），这是写操作，超出当前「页面只做读取」的定位，需业主单独拍板，不属于本备忘的数据问题。

## 给业主的决策请求

1. P2 是否要做？若做，勘察结论支持 **跨项目总览优先**：数据实存、一屏解决「我这么多项目哪个在等我」的真痛点、且 2 个 attention 项目立刻能演示真话显示。
2. 台账趋势是否接受「上线初期只有一根柱子 + 历史浅空态」的真实形态？若不接受，此项应押后而非凑数。
3. 改动与证据若做，只呈现 evidence 与工件引用、不碰 diff，是否认可？

（本文档所有输出可用以下命令复跑：`awr --project <root> status --json`、`awr event history --json --limit 100`、读 `~/.local/state/awr/projects.json`。）
