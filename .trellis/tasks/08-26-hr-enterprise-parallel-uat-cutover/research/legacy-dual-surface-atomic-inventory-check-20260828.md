# 双端原子清单独立审查

日期：2026-08-28
候选：`b411815e7043311379b11acc2d5c0ae968f1ae6d`

## 初审结论

初始候选为 `NO-GO`：客户端 162 表、2,364 字段、212 规则、915 权限由生成器常量产生，manifest 的 `expectedCounts` 只是重复声明；materialized verifier 不能把合法格式的伪 evidence hash 与权威来源区分，也没有未来真实遍历回填所需的前序 inventory hash 链。敏感扫描只检查明文，percent/base64/hex/HTML entity 可绕过。

## 已修复门禁

- 客户端菜单数从 hash 绑定的 traversal contract 实际求和；表、字段、规则、权限数从 hash 绑定的 atomic inventory schema 常量推导。manifest 自报数必须与推导值逐项一致。
- Group Web 的 231 菜单和 186 source path 分别从两个 hash 绑定合同的真实数组长度推导。
- 每个 materialized inventory 固化 source-set hash、record evidence authority、authority hash、inventory version、previous inventory hash，并返回 client/web/combined inventory hash。
- v1 证据等级固定；后续版本必须引用上一版本完整 inventory hash、版本连续、locator 不收缩、证据等级不可降级。真实遍历回填必须同时更新 record authority。
- `MISSING` 项的 R/A/E/P/T 槽位必须全空且 disposition 为 `missing`；不得映射成 implemented/tested/verified/approved。
- client 与 group-web locator 全局唯一且前缀严格隔离；同名能力必须保留两个不同 locator。
- 敏感扫描递归检查每个字符串，并最多三层解析 percent、base64、hex 和 HTML numeric entity 编码。

## 验证

- 双端新合同 8/8 通过，覆盖计数自报漂移、重复/cross-surface locator、伪 hash、MISSING 晋级、四类编码敏感值、增量链缺失和降级。
- 既有客户端 atomic/traversal 合同通过。
- 既有 Group Web mapping/source-audit/live-runtime/implementation-coverage/entry-binding/runtime-topology 合同全部通过。

## 剩余边界

当前仍是 skeleton：客户端 3,653 个逐原子对象没有真实名称与 L4 证据，Group Web 也没有三角色运行时全遍历。新链只允许未来证据受控增量回填，不代表当前已经业务等价；生产历史导入继续 `HOLD`。
