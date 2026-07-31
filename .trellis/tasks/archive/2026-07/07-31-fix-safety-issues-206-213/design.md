# Design: 修复安全管理 Issues 206-213

## Root Causes

1. 多个安全业务页先分页加载 `/dict-types?page_size=100`，再把字典 code 转成 type id。系统字典类型超过一页或排序变化后，目标 code 不在首 100 条，页面便把它静默当成空字典。共享 `loadDictMapByCodes` 已提供按 `dict_code` 直查能力，但安全页尚未迁移。
2. 巡检执行表单把 API/字段策略边界数据直接当成 `string[]` 和合法数字字符串使用；非数组附件字段会在 `.join` 处抛异常，掩码 GPS 值也不适合作为 number input 的 value。
3. 超期隐患路由强制查询 `overdue_flag=true`，但共用新增表单仍以 `false` 初始化，成功新增的记录会被当前列表立即过滤。

## Architecture And Boundaries

- 字典：安全业务页只声明所需 codes，统一调用 `apps/web/lib/dict-client.ts`；API 通过 `dict_code` 在当前 tenant/park scope 解析类型。
- 巡检执行：在 route-local pure logic 文件中把 `unknown` 边界值归一化为表单字符串；组件不直接对未知附件值调用数组方法。
- 超期隐患：由页面上下文决定新建草稿的 `overdueFlag` 初值；普通隐患页保持 `false`，强制超期页为 `true`。
- 回归保护：Web package 的安全域单元测试扫描相关页面加载契约，并直接测试归一化函数和超期草稿逻辑。

## Compatibility

- 不改变字典 code、item value、API 路由或权限。
- 不修改历史迁移、种子或现有数据。
- 普通隐患页新增行为不变；仅强制超期路由调整默认值。
- 巡检表单对正常数组/数字响应保持原值，对无效边界数据降级为空字符串。

## Rollback

- 字典迁移可按页面恢复原 `loadDicts` 实现，但回退会重新引入分页依赖。
- 归一化和超期默认值均为局部前端变更，可独立回退。

## Break-Loop Analysis

### Root Cause Categories

- **C / Change Propagation Failure**：共享字典加载器已存在，但安全域 10 个调用点仍保留旧的 code-to-id 复制实现。
- **D / Test Coverage Gap**：没有测试约束安全业务页不得依赖字典类型分页，也没有覆盖脱敏/异常投影进入巡检执行表单。
- **E / Implicit Assumption**：旧实现假设业务字典永远位于 `/dict-types` 首 100 条；巡检表单假设 HTTP 运行时值必然符合 TypeScript 接口。
- **B / Cross-Layer Contract**：字段策略和历史/部分响应可能改变可选字段的运行时形态，UI 边界没有归一化。
- **B / State/Filter Contract**：超期列表的查询上下文没有传播到新增草稿默认值。

### Prevention Mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | 安全域字典统一调用 `loadDictMapByCodes` | DONE |
| P0 | Test | 递归扫描安全 TSX，禁止业务页调用 `/dict-types` | DONE |
| P0 | Boundary normalization | 附件/GPS 投影以 `unknown` 进入纯函数，再赋给表单 | DONE |
| P0 | State contract | 超期入口的新建草稿继承当前强制过滤语义 | DONE |
| P1 | Executable spec | 补充 permission-aware projection 到表单的 7 段式规范与跨层检查项 | DONE |
| P1 | CI reachability | 安全回归脚本接入根 `test:unit` | DONE |

### Systematic Expansion

- 扫描并迁移了 `apps/web/app/safety` 中全部旧字典加载点，不只处理截图对应页面。
- 字典契约测试覆盖整个安全路由目录，因此以后新增同类分页依赖会直接失败。
- 表单边界规则适用于其他字段策略、加密字段和旧数据投影；后续修改相同路径时应复用“先归一化、后调用类型方法”的做法。
