# PR192 A 住房岗位工作台实施计划

## 1. 前置条件

- 父任务和 A-contract 已冻结。
- route/page permission contract SHA、Track A permission/schema SHA、API-only
  `A-api-menu-projection SHA` 和早期 `A-base-core` fixture handoff SHA 均已冻结。
- `A-base-core` 只要求确定性基础数据、精确角色/权限集、profile ID 和 core
  checksum；它来自 automated-gates 的早期 fixture 阶段，不等待
  `A-route-evidence`、浏览器证据或 automated-gates 整体完成。
- `07-30-pr192-a-shared-web-foundation` 已提供不依赖 identity schema 或 approval
  runtime 的 integration-ready SHA（静态/单测、lint/typecheck/build 已通过）；
  final UI Gate 等待首个 domain route SHA 的真实浏览器证据。
- 不要求 menu、landing 或 legacy redirect handoff；这些是消费本任务输出的后置
  A2 交付，A1 不等待 A2。
- 已运行 `trellis-before-dev`，读取 Web/shared、upload/form、cross-layer、reuse、
  module 和 property-business specs。
- 住房 Web 独占路径没有其他 active owner。

## 2. Subagent 批次

根/协调 Agent 占一槽；最多三个 subagent 并行。

### W0：只读基线

- behavior researcher：现有工作流/API/状态/金额/附件/测试。
- UX mapper：canonical route、状态矩阵、移动任务流。
- contract/security mapper：manifest、Party/file/finance capability lattice。

输出 characterization 和差异表，不写代码。

### W1：串行 Extract

按 dashboard → tenant/Party → lease → billing → finance → handover/repair →
purchase → tasks 顺序分配 owner。每个 owner 独占巨型客户端，完成抽取、删除旧
block、targeted test 和 handoff 后退出。禁止并行改同一文件。

### W2：Canonical pages

在 feature SHA 冻结后并行：

- route/detail worker。
- responsive/DS/form worker。
- component/permission-state test worker。

存在路径重叠时先串行 handoff。

### W3：独立检查

- finance/permission checker。
- browser/mobile navigation checker。
- accessibility/DS checker。

Checker 不直接修复；P0/P1 回派原 owner 并由另一个 checker 复验。
若本任务先输出 Track A 的首个 canonical domain route SHA，browser/mobile 与
accessibility checkers 同时采集 shared foundation 的 desktop/mobile/keyboard/
focus/zoom/ARIA 集成证据；shared owner 修复组件问题并签收 final UI Gate，QA
归档证据。

## 3. 实施步骤

1. 补 characterization，冻结既有 API/金额/日期/状态/附件语义。
2. 消费 shared response contracts，删除重复接口。
3. 建 feature API/query/mutation/permission adapters。
4. legacy `/housing` 逐闭包消费 feature 并删除原 block。
5. 建 canonical list/detail routes 与 route guards；冻结固定 landing priority、
   module/scope/403 与 Party alias contract 输入，但此时不实现 menu、legacy
   `/housing` landing 或 tenant alias redirect。
6. 接入 shared picker/task/upload/status surfaces。
7. 仅启用 manifest 无 approvalPolicy 的低风险 mutation。
8. 将所有高风险 slot 保持只读并验证服务端拒绝。
9. 完成移动、DS、WCAG 和 handoff 证据；若为首个 domain route SHA，同时关闭
   shared foundation 延后的真实浏览器 evidence。
10. 将 canonical route SHA、route/page/action mapping 和浏览器入口反向 handoff
    给 automated-gates 的 `A-route-evidence` 阶段，由其完成最终角色 E2E 与证据；
    住房实现不得等待该最终 evidence 作为前置。
11. 输出 `housing-route-landing-input SHA` 给后置 A2；menu owner 消费它实现 menu、
    `/housing` landing 和 unknown deep-link fail-closed，housing owner 在自己的 app
    route 独占范围内实现 tenant alias redirect/guard，并输出 alias handoff SHA。

## 4. 验证

至少运行：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web build
pnpm typecheck
```

另运行住房组件/contract tests、精确角色 Web/API E2E、相关 first-release housing/
files/idempotency regression。财务、附件、Party、module 和 scope 负向测试不得省略。
浏览器证据必须来自真实住房 route；不得为 shared foundation 创建 preview/生产 route。

Machine Gate：

- Canonical route eligibility/priority 与 Party alias contract input；运行时
  menu/legacy landing/tenant alias redirect 由后置 A2 验收。
- route/page/API/data/field/file exact-set。
- no UUID、picker revoke、pending/persisted attachment recovery。
- decimal/date/input/idempotency/state guards。
- 高风险 read-only 与 API fail-closed。
- 三类 empty、403、failure、409、upload、deep-link/back context。
- 360/390/768/desktop、软键盘、WCAG/DS。
- 无 dual implementation、无局部 mutation 广泛刷新、complexity 通过。

## 5. 完成与交接

- 变更仅在独占住房路径。
- 验证命令、结果、跳过原因和 artifact hash 写入 evidence。
- 向 menu/RBAC、QA、identity、approval、Track C owners 提供 handoff SHA。
- A2 handoff 只发生在 canonical routes 完成后；本任务没有任何 A2 产物前置。
- 向 `A-route-evidence` 提供页面完成后的反向 handoff，顺序固定为
  `A-base-core → housing implementation → A-route-evidence`。
- Open P0/P1 为零；否则不得标记 technical pass。
