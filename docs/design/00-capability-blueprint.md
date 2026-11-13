# dsh-awr 重构蓝图 · 把 AWR 全能力呈现给业主 (2026-11-13)

> 业主指令（创造模式，放开呈现）："看 AWR 主要干啥，按项目特性、能力、能呈现给用户的全链路任务链路、当前状态、完成的、待开始的、阻塞的……只要能提高需求管理能力和快速迭代、能完整体现 AWR 特性和能力的，必须全面全方位在插件里呈现。"
> 事实来源：`awr status --json` / `awr nav --json`(mainline_graph 43节点×40边) / `awr capabilities --json`(57项) / README.zh-CN。本蓝图只呈现 AWR 真实提供的数据，缺的就标缺（诚实法 R6），不画假按钮、不编假进度。

## 一、AWR 到底是干啥的（一句话 + 五支柱）
**一句话**：人和 AI 协作的项目交付平台——围绕同一个项目目标，把「任务与工作线、交叉依赖、上下文、验收证据」组织进一条可接续、可核对的交付链路。

五大价值支柱（README 原文口径，插件必须各自有落点）：
1. **换会话/换 Agent，目标持续有效** → 呈现：目标卡 + 检查点 + 接续入口
2. **多条工作线独立推进、共同交付** → 呈现：工作线(Workstream)视图
3. **依赖的是已验证交付物与版本** → 呈现：依赖图 + 依赖边绑定的验收结果
4. **"完成"有可核对依据** → 呈现：证据链（实现/验证/合并/发布四态）
5. **每份投入对应到工作与结果** → 呈现：投入核算（无数据时诚实标缺）

## 二、AWR 数据源 → 能呈现什么（真实字段）
| AWR 数据源 | 真实吐出的东西（实测） | 呈现落点 |
|---|---|---|
| `status` | 四态桶 current/ready/waiting/blocked + 计数 + 每个 waiting 的 codes(如 dependency_not_completed) + next_action + suggested_work + organization.gaps(10) + omissions.gaps + snapshot 新鲜度 | 状态总览四态、下一步、缺口 |
| `nav.mainline_graph` | 43 节点×40 依赖边；每节点 title/status/next_action/outcomes/blocker/explainable_waits(等待原因+释放条件)/person_responsibility(责任人)/agent_execution(执行归属)/stage_acceptance_window(验收窗口)/last_event_at/workstream_id | 全链路任务链、等待原因、责任人、执行归属 |
| `nav.cross_dependencies` | 跨工作线依赖（本项目为0，多agent项目才有） | 工作线交叉视图 |
| `nav.blockers` | 当前主线阻塞点 | 阻塞区 |
| `nav.accounting` | 投入核算（本项目 available=false → 必须诚实标"未采集"） | 投入产出（诚实留空） |
| `capabilities` | 57 项能力，逐项 已发布/开发中 | 能力覆盖页（诚实分级） |
| `work show` / `object` | 单个工作项全字段 | 详情抽屉 |
| `context compile` | 绑定 revision 的聚焦上下文、token 数 | 上下文效率（接续支柱1） |
| `evidence` | 证据记录 + 报告引用 | 证据链（验收支柱4） |
| `decision` / `spec` | 权威决策、规格版本与需求覆盖 | 决策与规格页 |
| `session` | 认领/会话/checkpoint | 谁在干·检查点（接续支柱1） |
| `event` | 不可变事件流 | 时间线（审计） |
| `ready` | 依赖就绪队列 + 被排除原因 | 「可开始」清单 |

## 三、终极目标四问（每张图都必须 30 秒可答）
1. **目标是什么** → 顶部目标卡：ledger 的 goal + acceptance，大白话化（英文原句必须配中文释义）
2. **离目标多远** → 进度：completed/total + 四态计数；**不得编造百分比**（nav 明确 accounting.is_not_goal_query_completion_rate=true，进度用"37/43 完成"而非假造的 86%）
3. **现在轮到谁** → current 项的 person_responsibility + agent_execution(agent@session)
4. **下一步做什么** → suggested_work 的 next_action（AWR 原话，不翻译歪）

闭环：看(总览) → 接手(ready 队列一键给出认领命令) → 跟踪(全链路节点状态) → 回交(next_action+验收窗口)。

## 四、信息架构（推倒重来后的插件触点）
**触点①：顶栏 chip + popover（轻量速览）**
- chip：`AWR · 进行中2 · 可开始1`（一眼有活没活）
- popover：目标一句话 + 四态计数 + 当前项 next_action + 「打开进展页」+（折叠）技术细节

**触点②：进展页（主战场，围绕终极目标分区）**
- A. **终极目标带**（常驻顶部）：目标卡(goal+acceptance 大白话) / 完成度 37·43 / 现在轮到谁 / 下一步
- B. **全链路交付管线**（核心新增，替代单薄"主线"）：把 mainline_graph 呈现为「可接续、可核对的交付链路」——阶段流(就绪→进行中→等待→验收→完成) + 节点链 + 每节点 next_action/责任人/执行归属
- C. **状态四态**：进行中 / 可开始(附一键认领命令) / 等待中(附 AWR 的等待原因+释放条件) / 阻塞(附 nav.blockers)
- D. **工作线 Workstream**：按 workstream 分组汇总（AWR 核心概念，现在完全没露出）
- E. **验收与证据**：completed 项的 实现/验证/合并/发布 四态 + evidence 记录
- F. **上下文接续**：context compile 的 token 聚焦、最近检查点、如何接续（支柱1）
- G. **投入核算**：accounting，无数据诚实标"宿主未提供，暂无"（支柱5，诚实法）
- H. **能力覆盖**：57 能力分级(已发布/开发中/未启用)——让业主知道 AWR 还能干啥
- I. **健康与缺口**：doctor / omissions.gaps / organization.gaps / snapshot 新鲜度（诚实呈现"哪里没数据"）

**触点③：会话行**：AWR 工具调用折叠为一行事件（保留，轻量）。

## 五、呈现纪律（不重蹈覆辙）
- 只用 `--dsh-*` 主题 token，不硬编码配色（frontend-design 让位于宿主主题）。
- 一切字段来自 AWR JSON 实测；缺字段=显示"未记录/未采集"，绝不用占位假数据。
- 不画不存在的命令按钮；"一键认领"必须是真的 `awr session start ... --claim` 原文。
- 英文 goal/next_action 保留原文 + 中文释义并列，不覆盖原文。
- 分步实现，每步 `node --test` 绿；先样机拍板再落代码。
