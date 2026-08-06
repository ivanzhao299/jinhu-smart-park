# B-2a C0 合同与数据库纠偏方案签署证据

## 1. 门禁结论

- 签署日期：2026-08-01（Asia/Singapore）
- 门禁阶段：B-2a / C0（方案复审门禁）
- 结论：`PASS`
- `C0_open_P0_P1=[]`
- `implementation_release=C1-only`
- 三方最终只读复审均为：`P0=0 / P1=0 / P2=0 / PASS`

C0 仅证明合同与数据库纠偏方案已达到进入 C1 冻结、重签和共享合同校正的条件。C0 不授权提前实施 C2、C3 或 C4；C1 独立门禁通过前，不得编写或执行数据库迁移，不得修改 B1 运行时，不得实现 B-2a 任务运行时。

## 2. 签署输入

唯一签署输入为第十二版纠偏方案：

- 文件：`.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-contract-schema-correction-plan.md`
- 原始行数：`2071`
- 原始文件 SHA-256：`b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da`
- 文本约束：LF、文件末尾保留换行

上述行数与 SHA-256 是本次三方签署共同使用的版本锚点。输入文件任一字节发生变化后，本签署自动失效，必须重新执行 C0 三方只读复审并生成新的签署证据。

## 3. 三方独立复审签署

### 3.1 Architecture / Database

- Reviewer：`/root/b2a_schema_arch_gate`
- 结论：`P0=0 / P1=0 / P2=0 / PASS`
- 核心 disposition：物理投影权威、稳定来源复合键、当前代际约束、延迟触发器、严格来源版本 fencing、重建审计、前向迁移编号与幂等/漂移失败策略已形成闭合合同；方案如实限定了同一数据库 principal 下的边界，不把应用支持路径误报为独立数据库 principal 隔离；C2 前置条件与锁顺序明确，无未处置的架构或数据库阻断项。

### 3.2 Test / Security

- Reviewer：`/root/b2a_test_gate`
- 结论：`P0=0 / P1=0 / P2=0 / PASS`
- 核心 disposition：新鲜安装、重复执行、旧值迁移、混合/未知/配置漂移失败、回滚与恢复验证均有可执行验收口径；来源注册表默认 fail-closed，生产图与测试 fixture 隔离；错误详情、恢复动作、深链、blocked reason 和来源详情均有白名单与泄露负例；静态直写阻断、HTTP/单测、并发和版本冲突场景覆盖，无未处置的测试或安全阻断项。

### 3.3 Product / RBAC / Interaction

- Reviewer：`/root/b2a_plan_product_review`
- 结论：`P0=0 / P1=0 / P2=0 / PASS`
- 核心 disposition：任务状态流转、关闭/取消语义、认领与主管替代授权、完整 `property.task.*` allowedActions、身份占用参数、任务与领域深链边界已统一；B-2a 保持来源中立，真实民宿/住房领域接入留到 B-2c；实际桌面与 390px 交互验收明确归属 B-3，不以静态 fixture 替代真实页面验收，无未处置的产品、权限或交互阻断项。

## 4. 本次证据的边界

本次 C0 签署期间：

- 未修改业务代码、共享合同、现有冻结文件或数据库迁移；
- 未启动数据库，未执行 PostgreSQL 安装、迁移、回滚或故障恢复门禁；
- 未启动 API 或 Web 服务；
- 未运行浏览器、Playwright、桌面视口或 390px 视口验收；
- 未执行生产环境验证或真实用户验收。

因此，本文件不等于 B-2a 实现通过，不等于 Track B 总体验收通过，不等于 UAT 通过，也不等于 production PASS。

## 5. 下一步执行与 owner/path 隔离

C0 通过后仅释放 C1。所有 owner 均须知晓代码库中还有其他工作者，不得回退或覆盖他人改动；出现路径重叠时必须停止写入并先协调。

1. `freeze-contract-owner`
   - 仅负责四份冻结合同、派生清单以及与重签直接相关的任务证据文件。
   - 必须先计算并记录四份冻结输入的新 raw SHA，再按既定语法派生新的 B-contract hash。
   - 不得修改 `packages/shared/**`、API 运行时代码、Web 代码或迁移文件。
2. `shared-contract-owner`
   - 仅负责 `packages/shared/src/property-business/**`、必要的共享包根导出与对应共享合同测试。
   - 只能在冻结合同 owner 完成输入重签后开始写入。
   - 不得修改数据库迁移、B1/B-2a 运行时或 Web 页面。
3. `property-error-filter-owner`
   - 仅负责 `apps/api/src/shared/filters/api-exception.filter.ts` 及其直接测试。
   - 必须在共享错误合同冻结后顺序执行，不得与共享合同 owner 并发修改同一合同。
4. `c1-independent-reviewers`
   - Architecture/Database、Test/Security、Product/RBAC/Interaction 分别只读复核 C1 冻结产物、hash 链、导出面、错误白名单及路径隔离。
   - 只有 C1 再次达到 `P0=0 / P1=0` 并留下独立签署证据，才可释放 C2。

C2 迁移 owner、C3 B1/receipt-port owner 与 C4 task-runtime owner 在 C1 签署前均保持未释放状态。C2、C3、C4 仍须按各自独立质量门禁顺序推进，不得并发跨门禁实施。
