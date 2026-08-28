# 玉舟双端入口库存正式拆分

本切片以机器合同取代此前“83 个混合入口”的临时统计口径，不改写历史观察记录，也不把数据库、源码、目标映射或测试 fixture 视为旧端实时遍历证据。

## 当前权威边界

- 玉舟桌面客户端：12 个适用业务族、68 个入口、17 个 page check。68 个入口独立进入客户端 observed/partial/pending 分母；当前全部仍为 `PENDING`，L4 贡献为 0。
- 玉舟集团 Web：231 个菜单和 186 个源码路径仍是完整结构库存；原混合台账中的 15 个 Web 快捷入口改为独立 `group-web:shortcut:NNN` 交叉引用，不进入客户端分母，也不替代 231 项集团菜单。
- 每个快捷入口按绑定合同顺序取得稳定 locator，并保留 page/tab/dialog/M3/field/action/state/rule 原子链。未取得真实 Web 会话证据前，所有链均为空、`observationStatus=pending`、`compatibilityScoreContribution=0`、`productionImport=HOLD`。
- 快捷入口只允许引用集团 Web 菜单 locator 或记录为 `target_route_only`；后者明确表示尚无可证明的一对一旧菜单对应关系，不得自动补猜。

## 评分影响

本切片只修正 surface 分母和证据归属，不提升任何 live evidence。总兼容验证继续为 `IN_PROGRESS`，总分保持 13.75/100，硬缺口继续包含原子库存未完成、客户端 L4 遍历缺失和 L5 业务签署缺失。

## 权威文件

- `scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json`
- `scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json`
- `scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json`
- `scripts/hr-cutover/contracts/legacy-group-web-atomic-inventory-v1.json`
- `scripts/hr-cutover/contracts/legacy-group-web-shortcut-cross-reference-v1.json`
- `scripts/hr-cutover/contracts/legacy-web-entry-target-binding-v1.json`
- `scripts/hr-cutover/legacy-client-live-traversal-lib.mjs`
- `scripts/hr-cutover/legacy-dual-surface-atomic-inventory-lib.mjs`

旧报告中出现的“客户端 83 个入口”应理解为当时的 68 desktop-client + 15 Group Web 混合统计，不再作为当前机器分母。

结构 inventory 的 package 入口使用 `pnpm run hr:migration:legacy-inventory:verify /absolute/path/to/inventory.json`；package 脚本负责显式传入 `--inventory`。无参数、相对路径、多余参数和未知参数均失败即停。
