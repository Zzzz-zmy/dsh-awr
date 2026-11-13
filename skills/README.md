# skills/ — 本次重构引用的外部技能

本目录存放重构过程中作为工作标准引用的第三方技能文档（vendored，纯文档，不参与构建）。

## frontend-design（Anthropic 官方，anthropics/skills）

- 来源：https://github.com/anthropics/skills/tree/main/skills/frontend-design （含 LICENSE.txt）
- 作用：UI/UX 设计的强制工作标准。核心要求：
  1. 先出设计方案（色板 4–6 个具名 hex、字体与角色、布局概念+ASCII 线框、独特性原则），评审方案后才写代码；
  2. 明确列出了"AI 味模板脸"黑名单（奶油底+赤陶强调、酸性绿暗底、假报纸排版、万物圆角卡片、ALL-CAPS 眉题等），我们的界面必须避开；
  3. 大胆只花在一个记忆点上，其余保持克制；响应式、键盘可见焦点、降低动效偏好都要守住底线。
- 使用节点：DSH-075（HTML 方案稿的视觉方向）与 DSH-076（实现时的样式细节）。
- 注意：本插件必须服从 DSH 主题 token（`--dsh-*`），frontend-design 的自由选色在此让位于宿主主题系统；它负责"信息层级、克制度、去模板脸"，不负责引入新色板。

## 待选（未引入，需要时再取）

- web-artifacts-builder / webapp-testing（同仓库）：依赖各自 scripts/ 目录的脚手架脚本，单独拷 SKILL.md 无效；如需要整套引入时从原仓库克隆使用。
