# 玉舟客户端与集团 Web 双端原子清单基线

日期：2026-08-28  
候选基线：`304f585e0ffc95158b96b12c4ffd1c090c51829d`  
边界：仅固化已有脱敏合同和缺口骨架；不执行旧系统写操作、生产导入或 P0 技术演练。

## 结论

已建立不可互换的 `client:*` 与 `group-web:*` 原子 locator。当前清单只证明数量守恒和现有证据边界，不代表旧系统已经全量遍历，也不代表目标系统达到业务等价。

| Surface | 原子边界 | Evidence level |
|---|---:|---|
| client | 83 个菜单入口 | `INFERRED=83`；来自 L3 partial 遍历合同，不得提升为 `TRAVERSED` |
| client | 162 表、2,364 字段、212 规则、915 权限 | `MISSING=3,653`；只有总量/库存 hash，缺逐原子名称、locator 和人工审阅绑定 |
| group_web | 231 个数据库菜单 | `DB=231`；证明菜单结构，不证明页面运行时行为 |
| group_web | 186 个可导航源码路径 | `SOURCE=186`；证明源码字段/动作汇总，不证明真实三角色页面遍历 |

全清单 evidence level 汇总：`TRAVERSED=0`、`DB=231`、`SOURCE=186`、`TARGET=0`、`INFERRED=83`、`MISSING=3,653`。

## 机器门禁

- locator 必须分别以 `client:` 或 `group-web:` 开头；同名能力仍必须拥有两个独立 locator。
- 两端 locator 全局不可重复，任何跨 surface 复用均失败。
- client 的 L3 菜单入口固定为 `INFERRED`；没有 L4 证据时不能改为 `TRAVERSED`。
- 162/2,364/212/915 的逐原子名称尚未进入仓库，因此只生成稳定 ordinal 骨架并明确 `MISSING`，不猜测对象内容。
- group Web 菜单固定为 `DB`，源码路径固定为 `SOURCE`；不能用目标 route 或另一端证据提升。
- 每项均包含 menu/page/table/field/rule/permission/action/data-scope 槽位、R/A/E/P/T 目标槽位、evidence hash 或 missing reason。
- 来源合同 hash 漂移、数量收缩、重复 locator、证据等级晋级、绝对工作站路径、凭据或私网 URL 均 fail closed。

## 后续缺口

1. 必须从受控的 reviewed atomic inventory 回填 162 表、2,364 字段、212 规则的真实 stable object locator；ordinal 骨架不能用于映射或迁移决策。
2. 915 权限行必须经过脱敏人工审阅，拆成菜单、动作、字段和数据范围；当前全部保持 `MISSING`。
3. 客户端 83 入口需要 L4 只读实遍历，逐入口补字段、默认值、校验、状态、按钮、报表和角色范围证据。
4. 集团 Web 231 菜单需要三角色 runtime 遍历；186 条 SOURCE 证据不能替代运行时 allow/deny。
5. 只有各 surface 自己的证据可提升等级；一端完成不能自动关闭另一端 gap。

生产历史导入继续为 `HOLD`。
