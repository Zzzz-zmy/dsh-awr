# 真机验证：schema 2 全链路（lab 62181，2026-11-13 20:56）

会话：`session-1ed29203-eb0d-4e49-b097-dd0743b31d6c`（标题「收到回复测试」，只在 lab 侧）
面板文件：`~/.local/state/dsh-awr/panel/session-1ed29203-….progress.json`

## 落盘文件（`awr progress` 真跑后的真实产物）

```
1ed29203 schema 2 counts 40/43 cov 57/57 groups 22 health true acctAvail false
```

## DOM 断言（bsk evaluate，data-testid 实测）

```json
{"chipCount":"40/43",
 "ids":["awr-dot","awr-chip-count","awr-page","awr-updated","awr-goalband",
        "awr-gauge","awr-view-lines","awr-footzones","awr-coverage",
        "awr-coverage-group","awr-health","awr-accounting"]}
```

Popover 四问（同一会话打开头部 chip 后实测）：

```json
{"digestIds":["awr-digest","awr-digest-goal","awr-digest-count","awr-digest-next"],
 "count":"40 / 43",
 "goal":"Build a DeepSeek Harness plugin that lets AWR manage work state …",
 "next":"已交付七刀：①四问带+schema2（5f609ba）②GUI 发命令闭环实测…"}
```

三区分区文案（页面文本实测）：

- `awr-coverage`：`本机的 AWR 能做什么` — `57 项能力应答 57 项` `57 / 57` `awr 0.7.0` `local`，22 个 group 全部 `n/n`
- `awr-health`：`项目是否健康` — `项目数据库完好` `表结构 v14`
- `awr-accounting`：`投入核算` — `暂时没有数字：合同批准、观测核实之前，AWR 拒绝给这个数——留白是真的。`

诚实法核对：`acctAvail false` 与页面文案一致，页面上没有编造出任何百分比；缺数据时展示的是留白而不是假数字。

## 截图（给业主看像素）

- `live-page-goalband.png`：头部 chip + 四问带 + 40/43 gauge
- `live-page-footzones.png`：能力覆盖 / 健康 / 投入核算 三区
- `live-chip-popover.png`：头部 chip 展开的四问 Popover

## 未闭环项（不是本插件的锅）

`session-be4612c1-…` 的面板文件在同一时刻被写回 `schema 1`。原因已定位：业主桌面实例
（PID 33038，端口 62180，Fri Nov 13 13:54 启动）内存里还是旧版 host lib，它也在写这个共享
会话的面板文件，旧版不写 `coverage/health/accounting`。业主重启桌面 App 后即消失（DSH-077）。

同一时刻对照（两个文件的 mtime 只差 4 秒，一 schema 2 一 schema 1）就是双 host 抢占的直接证据。
