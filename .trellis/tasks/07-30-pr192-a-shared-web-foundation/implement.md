# PR192 A 共享 Web 基础实施计划

## 1. 前置条件

- A-contract SHA、access manifest 和 response contracts 已冻结。
- 已运行 `trellis-before-dev`，读取 Web/shared/UI、upload/form、reuse 和 cross-layer
  specs。
- `apps/web/features/property-shared/**` 没有其他 active owner。
- 本任务作为 Track A A0/A1 执行，不等待 Track B。

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
- mobile/DS/accessibility checker。
- dependency-boundary checker。

Checker 不直接修复；P0/P1 回派原 owner并独立复验。

### S3：A Handoff

冻结 `A-shared-web-foundation SHA`，分别交给 homestay/housing workbench。Handoff
后两个领域才能建立依赖这些组件的 canonical route。

## 3. 实施步骤

1. 搜索并决定 reuse/extend/new，记录不复用原因。
2. 建 capability adapter 与 invalidation contract。
3. 建 RemoteEntityPicker。
4. 建 CanonicalDetailShell、return context 和 ConsequenceDialog。
5. 建 PageState/LiveRegion 与 TaskPresentation。
6. 组合现有 DS surface，不修改领域页面。
7. 完成组件、effect、navigation、mobile 和 accessibility tests。
8. 输出 API 文档和双工作台 handoff。

## 4. 验证

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/web lint
pnpm --filter @jinhu/web typecheck
pnpm --filter @jinhu/web build
pnpm typecheck
```

另运行 shared component tests、browser keyboard/screen-reader checks 和静态 import/
DS surface checks。

Machine Gate：

- 无 Track B/领域 API/schema/runtime import。
- 无 permission/response/upload policy 分叉。
- picker/detail/dialog/task/state 全部行为与 effect 测试通过。
- unauthorized loader/callback 调用数为零。
- 320/360/390/768/desktop、WCAG 2.2 AA 和 DS 证据通过。
- complexity 通过，open P0/P1 为零。

## 5. 完成

- 只修改独占 property-shared 路径。
- 记录 contract/base/handoff SHA、命令、结果、artifact 和已知限制。
- 两个工作台确认可从同一 SHA 消费组件 API。
- 不把人工 UAT 或 Track B 能力误报为本任务完成。
