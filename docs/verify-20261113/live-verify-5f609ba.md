# 5f609ba 实机验证记录（2026-11-13 20:00–20:30）

## 结论

**数据链路端到端闭环 ✅；前端视图挂载被 lab 环境兼容性阻塞 ⚠（非插件缺陷）。**

## 已证实（真实 GUI、真实命令、真实数据）

1. **插件安装启用**：awr-lab Web GUI（127.0.0.1:62181）插件面板显示「AWR 项目及上下文管控」已安装、开关 = true。
2. **client bundle 加载**：合并请求 `/plugins/??…,@originoneai/dsh-awr/client.js,…` 成功（200）。
3. **GUI 发起命令 → host 执行 → 面板文件落盘**：
   - 在 GUI 会话（session-1ed29203，dsh-awr 工作区）composer 发送 `/awr progress`；
   - 会话日志 `session.v4.jsonl.zstd` 写入 `command/run seq7 → command/done success "Progress updated: 43 work items, 2 in progress"`（时间戳与点击时刻一致）；
   - 面板文件 `~/.local/state/dsh-awr/panel/session-1ed29203….progress.json` 被刷新为 **schema:2, ok:true, counts {total:43,done:37,active:2,ready:1,blocked:0,waiting:3,sessions:6}**（33543 B，与 in-process buildProgress 结果一致）。
4. 面板文件即读即渲：client/30-data.js 读该文件、schema≠2 拒读；schema-2 视图形态已由 373 项单测中的 GoalBand/页面用例断言渲染（goal 文案、37 / 43 计数格、cell strip、lead-dsh、next=DSH-073）。

## 阻塞（环境性，非 dsh-awr 代码问题）

- lab GUI 主区始终落回欢迎页（`hasViewTabs:false`）：`viewTabs` 汇总为空，连内建 chat/trajectory 视图也未注册 → `resolveActiveView` 返回 undefined → `viewArea` 空渲染。
- 根因指向 **npm CLI（25.8.2）与桌面 app.asar 前端的会话事实/catalog 版本错配**：与 session-be4612c1 的 `SessionFormatError: subagent/catalog requires a supported versioned catalog fact` 同类；命令通道能写入并执行，但前端 session binding 未建立，conversation.view 全家（含 chat）都不挂载。
- 同一 GUI 下 owner 桌面版（62180，Electron 独占）此前已能显示 chips/视图；像素级截图需在 owner 侧或用同版本桌面 lab 完成。

## 遗留动作

- 向业主如实报告 lab 环境限制与 be4612c1 会话损坏（修复 vs 退役二选一）。
- DSH-077 的真实桌面像素验收保持 pending。
