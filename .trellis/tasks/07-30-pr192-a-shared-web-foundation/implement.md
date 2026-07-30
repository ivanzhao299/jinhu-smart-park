# PR192 A 共享 Web 基础实施计划

## 1. 前置条件

- A-contract/server-safety SHA、A-C2 schema/exact-test SHA 与 API-only
  `/users/me` property projection SHA 已冻结；Web menu 仍不可见。
- 已运行 `trellis-before-dev`，读取 Web/shared/UI、upload/form、reuse 和 cross-layer
  specs。
- `apps/web/features/property-shared/**` 没有其他 active owner。
- 本任务作为 Track A Web foundation 执行，晚于 schema/API projection、早于
  homestay/housing routes，不等待 Track B。

## 2. Subagent 批次

根/协调 Agent 占一槽，最多三个 subagent。

### S0：只读复用调查

并行：

- component researcher：搜索现有 picker/detail/dialog/task/status 组件。
- DS/accessibility researcher：确认 surface/token 和 WCAG evidence 路径。
- contract mapper：把 A manifest 能力映射为 adapter 输入。

输出 reuse decision；禁止先复制组件。

### S1：无重叠实现

并行且独占子目录：

- picker/access worker：`picker/**`、`access/**`。
- detail/dialog/state worker：`detail/**`、`dialog/**`、`states/**`。
- task/DS worker：`tasks/**`、`ds/**`。

公共 index/export 由最后一个 integration owner 在三者 handoff 后一次修改。

### S2：独立检查

- component/effect checker。
- static DS/accessibility contract checker。
- dependency-boundary checker。

Checker 不直接修复；P0/P1 回派原 owner并独立复验。

### S3：A Handoff

冻结 `A-shared-web-foundation SHA`，分别交给 homestay/housing workbench。Handoff
后两个领域才能建立依赖这些组件的 canonical route。该 SHA 是 integration-ready
handoff，不等于 final UI Gate；首个 domain route owner 在真实 route 上补浏览器
证据后，由 shared owner 与 QA 关闭 final UI Gate。

执行记录（2026-07-30）：integration-ready SHA 已冻结为
`d2a015f9ba931b2024e6360570697c77b74ea3fb`
（`feat(property): add shared workbench foundation`）。三路 S2 final review
**PASS**，`open_P0_P1=[]`；14 specs、boundary 5/5、ESLint、workspace typecheck、
shared build、Web build 全部通过。该记录只关闭 integration-ready handoff Gate；
child 保持 `in_progress`，final UI Gate 仍
`awaiting_first_canonical_route`。

Handoff 附带 stop-ship：A-base 后必须取得 `A-2.5-contract-closure SHA` 才允许领域
Web 开始。Foundation owner 不创建 route-local response interface、不以组件 adapter
掩盖 N+1，也不扩 permission bundle。

## 3. 实施步骤

1. 搜索并决定 reuse/extend/new，记录不复用原因。
2. 建 capability adapter 与 invalidation contract。
3. 建 RemoteEntityPicker。
4. 建 CanonicalDetailShell、return context 和 ConsequenceDialog。
5. 建 PageState/LiveRegion 与 TaskPresentation。
6. 组合现有 DS surface，不修改领域页面。
7. 完成纯函数/组件静态检查、组件/effect/navigation 单测以及 lint/typecheck/build。
8. 输出 API 文档和双工作台 handoff。

不得在本批次创建 canonical domain route、修改 `apps/web/lib/menu.ts`，或用
catch-all placeholder 充当 route 完成证据。

## 4. 验证

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web build
pnpm typecheck
```

另运行 shared component tests 与静态 import/DS/accessibility contract checks。
此阶段不运行依赖真实页面的 browser keyboard/screen-reader/viewport 验收；这些在
首个 domain canonical route SHA 上执行。

Machine Gate：

- 无 Track B/领域 API/schema/runtime import。
- 无 permission/response/upload policy 分叉。
- picker/detail/dialog/task/state 全部行为与 effect 测试通过。
- unauthorized loader/callback 调用数为零。
- 静态 DS/accessibility contracts 通过；真实 desktop/mobile/keyboard/focus/zoom/
  ARIA 证据登记为首个 domain route SHA 的强制 follow-up。
- complexity 通过，open P0/P1 为零。

## 5. 完成

- 只修改独占 property-shared 路径。
- 记录 contract/server-safety、A-schema、A-api-menu-projection、foundation handoff
  SHA、命令、结果、artifact 和已知限制。
- 两个工作台确认可从同一 SHA 消费组件 API。
- 未取得首个 domain route 浏览器证据前，只能称 `foundation handoff ready`，不得称
  `foundation final UI gate passed`。
- 不创建 preview route 或临时生产 route。
- 不把人工 UAT 或 Track B 能力误报为本任务完成。

## 8. 2026-07-31 执行结果

Foundation 与双域集成机器验证通过：最终 API full unit 91/91、Web default
`tsc`/lint/build 154、独立多轮 Gate `open_P0_P1=[]`。唯一跳过项是 Chrome
connector `sandboxCwd` 基础设施导致真实 desktop/390 visual、keyboard/focus、
zoom/reflow 未验；任务不标记 final UI/release-ready。
