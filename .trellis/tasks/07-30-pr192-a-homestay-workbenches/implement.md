# PR192 A 民宿岗位工作台实施计划

## 1. 前置条件

- 父任务 Track A 合同冻结。
- route/page permission contract SHA、Track A permission/schema SHA 和早期
  `A-base-core` fixture handoff SHA 已冻结。
- `A-base-core` 只包含页面开发所需的确定性基础数据、精确角色/权限集、profile ID
  和 core checksum；它来自 automated-gates 的早期 fixture 阶段，不要求
  `A-route-evidence`、浏览器证据或 automated-gates 整体完成。
- `07-30-pr192-a-shared-web-foundation` 已在 Track A A0/A1 完成，并交付不依赖
  Track B identity 的 shared Web foundation SHA。
- 不要求 menu、landing 或 redirect handoff；它们是消费本任务输出的后置 A2
  交付，A1 不等待 A2。
- 运行 `trellis-before-dev` 并读取 Web、shared、upload/form、cross-layer 和 reuse spec。
- 工作区没有其他 owner 正在修改 `apps/web/app/homestay/**` 或
  `apps/web/features/homestay/**`。

## 2. Subagent 批次

根/协调 Agent 固定占一个槽；本任务任一时刻最多三个 subagent。

### H0：只读基线

并行：

- behavior researcher：列出万能页工作流、API、权限、状态和现有测试。
- UX mapper：把 UI block 映射到 canonical route 和状态矩阵。
- contract checker：核对 A-contract/manifest/共享组件 handoff。

输出 characterization map；本批次不写代码。

### H1：Feature extract

顺序执行，每次只给一个 worker 独占民宿路径：

1. dashboard/availability。
2. rates。
3. bookings。
4. stay/guest/credential。
5. turnover。
6. finance/tasks。

每个 worker 完成 characterization → extract → legacy 消费 → 删除原 block → targeted
tests。下一 worker 只从已验证 handoff SHA 开始。不同 worker 不并行改巨型客户端。

### H2：Canonical routes

Feature extract 全部通过后并行：

- route worker：创建薄 route/page shell 和详情路由。
- responsive/DS worker：只改民宿 CSS/组件响应式与共享 surface 使用。
- component-test worker：补状态、picker、focus、permission 组件测试。

文件相交时由 route worker 先 handoff，禁止并发写同文件。

### H3：领域验证

- permission/API-effect checker：验证未授权 block 不请求、高风险只读。
- browser checker：desktop、360/390/768、横竖屏、软键盘、deep-link/back。
- accessibility checker：axe、键盘、NVDA/等价、zoom/reflow、forced-colors。

Checker 只报告问题；修复回派原 owner。任何 P0/P1 必须由非修复者复审。

## 3. 实施步骤

1. 建立 characterization tests，记录现有 URL、payload、状态、文件和幂等语义。
2. 消费 shared response contracts，删除 route-local 重复 response interfaces。
3. 建立 feature API/query/mutation/permission adapters。
4. 逐工作流抽取并让 `/homestay` 继续调用同一 feature。
5. 建立 canonical list/detail routes；冻结固定 landing priority、page permission、
   module/scope/403 语义和 legacy alias 输入，但不实现 menu/legacy landing/redirect。
6. 接入共享 picker/task/upload/status components。
7. 将 manifest 标注的高风险动作渲染为只读并验证 API fail closed。
8. 完成 DS、移动和无障碍整改。
9. 生成 handoff：owned paths、base/handoff SHA、命令、证据、已知风险。
10. 将 canonical route SHA、route/page/action mapping 和浏览器入口反向 handoff
    给 automated-gates 的 `A-route-evidence` 阶段，由其完成最终角色 E2E 与证据；
    工作台不得等待该最终 evidence 才开始实现。
11. 输出 `homestay-route-landing-input SHA` 给后置 A2 `menu-projection-owner`，
    由其实现 menu、`/homestay` landing 和 redirect。

## 4. 验证

至少运行：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web build
pnpm typecheck
```

并运行本任务新增的组件/contract 测试、Track A 精确角色 Web E2E、相关
first-release regression。浏览器证据必须覆盖实际页面而非静态源码断言。

Machine Gate：

- route/page permission 一对一且 legacy permission 不扩权。
- 未授权 page 403；未授权 optional query 数为 0。
- module on/off、scope full/partial/empty、0/1/多 page permission 组合通过。
- 无 UUID 输入；picker 撤权后 selection/draft 失效。
- 低风险 mutation 状态与重试正确；高风险 mutation 请求数为 0/服务端拒绝。
- deep-link/refresh/return context 全通过。
- 状态矩阵、移动、WCAG/DS 和 complexity 门禁通过。
- 旧万能页不再拥有重复 UI/API/mutation 实现。

## 5. Handoff 与完成条件

- 只修改本任务独占路径。
- 所有验证结果和跳过项进入 evidence。
- page-local CSS 差异、共享组件使用和 protected file 权限组合有证据。
- 向 menu/RBAC、QA、Track B owners 提供 handoff SHA。
- A2 handoff 只发生在 canonical routes 完成后；本任务没有任何 A2 产物前置。
- 向 `A-route-evidence` 提供页面完成后的反向 handoff，顺序固定为
  `A-base-core → homestay implementation → A-route-evidence`。
- Open P0/P1 为零；否则任务保持 implementing。
