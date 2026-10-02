# 园区餐厅管理（食堂承包经营）模块 — 权限设计

> 所属模块：`canteen`（园区餐厅管理 / 食堂承包经营）
> 当前阶段：规划设计（权限点全量清单，不含生产代码）
> 权限点前缀 `canteen:*`；常量集中在 `packages/shared/src`（冒号命名 `模块:资源:动作`），并配 permission-bundles，在 saas-modules 注册模块码 `canteen`。

---

## 1. 权限点命名约定

- 格式：`canteen:<资源>:<动作>`，与 `packages/shared/src` 常量名一一对应。
  常量命名（packages/shared/src/canteen.ts，设计示意）：
  ```ts
  export const CANTEEN = {
    OUTLET_VIEW: 'canteen:outlet:view',
    OUTLET_CREATE: 'canteen:outlet:create',
    // ... 与下表一一对应
  } as const;
  ```
- 同时定义 permission-bundles（角色包）：如 `canteen-admin-bundle`、`canteen-cashier-bundle`、`canteen-contractor-bundle`、`canteen-finance-bundle`、`canteen-employee-bundle`。
- 在 saas-modules 注册模块码 `canteen`，模块授权后方可分配下属权限。

## 2. 权限点全量清单（canteen:*）

| 权限点 | 含义 |
|---|---|
| `canteen:outlet:view` | 查看餐厅/档口 |
| `canteen:outlet:create` | 新建档口 |
| `canteen:outlet:update` | 编辑档口 |
| `canteen:outlet:status` | 档口启停（open/suspended/closed） |
| `canteen:category:view` | 查看品类 |
| `canteen:category:create` | 新建品类 |
| `canteen:category:update` | 编辑品类 |
| `canteen:category:delete` | 删除品类 |
| `canteen:dish:view` | 查看餐品 |
| `canteen:dish:create` | 新建餐品 |
| `canteen:dish:update` | 编辑餐品/定价 |
| `canteen:dish:shelf` | 餐品上架/下架 |
| `canteen:dish:stock` | 调整每日库存 |
| `canteen:order:view` | 查看订单与明细 |
| `canteen:order:create` | POS 下单/收款（含轮询） |
| `canteen:order:cancel` | 撤单（paid 前） |
| `canteen:order:refund` | 发起退款（paid 后，转审核） |
| `canteen:order:audit` | 退款/撤单审核 |
| `canteen:payment:view` | 查看支付流水 |
| `canteen:qrcode:view` | 查看收款码 |
| `canteen:qrcode:manage` | 登记/启停收款码 |
| `canteen:session:open` | POS 开班 |
| `canteen:session:close` | 结班日结 |
| `canteen:session:view` | 查看班次（含本人本班） |
| `canteen:wallet:view` | 查看本人补贴钱包与流水/出示个人码 |
| `canteen:wallet:lookup` | 收银按员工查余额（lookup-employee） |
| `canteen:wallet:manage` | 管理/冻结钱包 |
| `canteen:subsidy:grant:view` | 查看补贴发放单 |
| `canteen:subsidy:grant:generate` | 生成/触发发放（run-grant） |
| `canteen:subsidy:grant:expire` | 触发月末清零（run-expire） |
| `canteen:meal-record:view` | 查看员工用餐记录 |
| `canteen:refund:view` | 查看退款单 |
| `canteen:settlement:view` | 查看结算单与明细 |
| `canteen:settlement:generate` | 生成月度结算（draft） |
| `canteen:settlement:submit` | 提交结算（submitted） |
| `canteen:settlement:reconcile` | 财务核对（reconciling） |
| `canteen:settlement:approve` | 审批结算（approved） |
| `canteen:settlement:settle` | 付款结账（settled，传凭证） |
| `canteen:settlement:dispute` | 差异挂起/异议（disputed） |
| `canteen:report:view` | 查看报表 |
| `canteen:dashboard:view` | 查看经营看板 |

> 菜单/页面入口通过对应的 `:view` 权限点控制可见性；前端隐藏按钮不作为授权依据，API 端二次校验。

## 3. 角色—权限矩阵（6 类角色）

说明：●=授予，◐=受限（受 data-scope/field-policy 约束），○=不授予。

| 权限点 | platform-admin | canteen-admin | canteen-cashier | canteen-contractor | employee | finance |
|---|---|---|---|---|---|---|
| outlet:view | ● | ● | ◐(本outlet) | ◐(本承包方) | ○ | ● |
| outlet:create/update/status | ● | ● | ○ | ○ | ○ | ○ |
| category:view | ● | ● | ◐ | ○ | ○ | ○ |
| category:create/update/delete | ● | ● | ○ | ○ | ○ | ○ |
| dish:view | ● | ● | ● | ◐(只读) | ○ | ○ |
| dish:create/update/shelf/stock | ● | ● | ○ | ○ | ○ | ○ |
| order:view | ● | ● | ◐(本班/本outlet) | ◐(本承包方) | ○ | ● |
| order:create | ● | ● | ● | ○ | ○ | ○ |
| order:cancel | ● | ● | ◐(本班且paid前) | ○ | ○ | ○ |
| order:refund | ● | ● | ◐(发起转审) | ○ | ○ | ○ |
| order:audit | ● | ● | ○ | ○ | ○ | ◐(部分) |
| payment:view | ● | ● | ◐(本班) | ◐(本承包方) | ○ | ● |
| qrcode:view/manage | ● | ● | ○ | ○ | ○ | ○ |
| session:open | ● | ● | ● | ○ | ○ | ○ |
| session:close | ● | ● | ● | ○ | ○ | ○ |
| session:view | ● | ● | ◐(本人本班) | ○ | ○ | ○ |
| wallet:view | ● | ◐ | ○ | ○ | ●(仅本人) | ○ |
| wallet:lookup | ● | ● | ● | ○ | ○ | ○ |
| wallet:manage | ● | ● | ○ | ○ | ○ | ○ |
| subsidy:grant:view | ● | ● | ○ | ◐(本承包方消费汇总) | ●(本人) | ● |
| subsidy:grant:generate/expire | ● | ● | ○ | ○ | ○ | ○ |
| meal-record:view | ● | ● | ○ | ◐(本承包方) | ●(本人) | ● |
| refund:view | ● | ● | ◐(本班) | ○ | ○ | ● |
| settlement:view | ● | ● | ○ | ◐(本承包方) | ○ | ● |
| settlement:generate/submit | ● | ● | ○ | ◐(确认/发起) | ○ | ○ |
| settlement:reconcile | ● | ○ | ○ | ○ | ○ | ● |
| settlement:approve/settle | ● | ○ | ○ | ○ | ○ | ● |
| settlement:dispute | ● | ● | ○ | ●(提异议) | ○ | ● |
| report:view | ● | ● | ○ | ◐(本承包方) | ○ | ● |
| dashboard:view | ● | ● | ○ | ◐(本承包方) | ○ | ● |

## 4. data-scopes 数据范围矩阵

| 角色 | 数据范围 |
|---|---|
| platform-admin | 全部租户/园区/档口 |
| canteen-admin | 本园区/其管理的 outlet（可配置多档口） |
| canteen-cashier | 仅本 outlet 且本班次（session）数据；撤单/退款限本人本班且 paid 前 |
| canteen-contractor | 仅本 contractor_id 绑定的 outlet 数据（只读经营/销售/员工消费 + 对账确认） |
| employee | 仅本人（user_id = 当前登录人）的 wallet/txn/meal-record |
| finance | 本园区/租户全部 outlet 的结算与报表（公司级） |

> data-scope 在 Query/Repository 层注入 `tenant_id/park_id/outlet_id/contractor_id/employee_user_id` 过滤，与角色授权正交。

## 5. field-policies 字段策略

| 字段 | 对收银员 | 对承包方 | 说明 |
|---|---|---|---|
| 餐品成本/进货价 | 隐藏 | 隐藏 | 收银员仅见售价 |
| contractor 结算明细/管理费扣减规则 | 隐藏 | 部分可见（仅自身应付） | 内部口径不外泄 |
| 员工手机号/姓名 | 脱敏（张*） | 不可见 | 个人隐私 |
| 公司侧 company_payable 计算过程 | 隐藏 | 仅见自身应付结果 | 财务口径 |
| 支付买家 payer_id | 脱敏 | 脱敏 | 隐私保护 |

> field-policies 在序列化层按角色裁剪字段；前端隐藏不作为授权依据，API 端再过滤。

## 6. saas-modules 注册与默认授予

- 在 saas-modules 注册模块码 `canteen`（中文名「园区餐厅管理」），租户开通模块后才可见下属菜单与权限。
- 默认 permission-bundles 与默认角色授予：
  - `canteen-admin-bundle` → 默认授予角色 `canteen-admin`。
  - `canteen-cashier-bundle` → 默认授予角色 `canteen-cashier`（POS 终端设备账号挂此 bundle）。
  - `canteen-contractor-bundle` → 默认授予角色 `canteen-contractor`。
  - `canteen-finance-bundle` → 默认授予角色 `finance`。
  - `canteen-employee-bundle`（仅 `wallet:view`/`meal-record:view` 本人范围）→ 默认授予全体员工角色。
- platform-admin 由平台侧全量授予，不进业务 bundle。
- 模块授权灰度：通过 saas-modules 按租户/园区开通，可配合特性开关（见 milestones.md）。
