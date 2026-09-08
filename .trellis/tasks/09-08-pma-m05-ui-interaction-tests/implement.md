# Implementation Plan: PMA M-05 UI 真实交互测试

## 1. Harness

- [x] 增加 Vitest/jsdom/Testing Library/user-event Web devDependencies 与 lockfile。
- [x] 增加 Vitest config、共享 setup/polyfill 与 `test:unit:interaction`。
- [x] 将 interaction suite 接入根 `test:unit:web` 聚合门禁。

## 2. Mounted interactions

- [x] ConsequenceDialog：click/Enter/reason/single-flight/failure/success/focus trap/focus restore。
- [x] S-03 接入抽查：真实确认触发正确 mutation，失败不误关。
- [x] RemoteEntityPicker：点击、键盘、clear、controlled rerender 回显。
- [x] HousingLeaseCreatePanel：unit/tenant option 选择并提交 ID payload。
- [x] useDirtyLeaveGuard：dirty/busy、beforeunload、链接确认、多实例注册与最终清理。

## 3. Mutation proof

- [x] Dialog：临时移除 `gate.tryEnter()`，`submits by keyboard once` 由预期 1 次变为 2 次，exit 1。
- [x] Picker：临时移除 `props.onChange(option)`，受控 host 保持 `none`，`selects with keyboard` exit 1。
- [x] Dirty guard：临时移除 `beforeunload` 注册，dispatch 由预期 `false` 变为 `true`，exit 1。
- [x] 三处均用 `apply_patch` 恢复；`git diff --exit-code -- <three product targets>` 返回 0，未提交 mutation。

## 4. Verification and closure

- [x] `pnpm --filter @jinhu/web test:unit:interaction`：4 files / 10 tests passed（隔离 modules-dir；命令脚本自身固定 `NODE_ENV=test`）。
- [x] 受影响既有测试：housing 33/33、homestay 18/18；property 聚合先通过 45 个后 Node 24/V8 fatal，聚焦复跑剩余文件 5/5 passed。
- [x] `pnpm --filter @jinhu/web lint`：passed。
- [ ] `pnpm --filter @jinhu/web typecheck`
- [ ] `pnpm --filter @jinhu/web build`
- [x] Trellis check 本地规格/diff/测试审查；标准依赖环境的 typecheck/build 等待 PR CI。
- [ ] 最多 3 轮 review。
- [ ] commit/push；PR `Closes #703`；PR CI；squash merge。
- [ ] containing-main CI+Deploy 双绿；Issue closed；归档、RBAC ff、删分支、prune。

## Risk files and rollback points

- `apps/web/package.json`、根 `package.json`、`pnpm-lock.yaml`：只新增测试依赖/命令。
- Test setup：polyfill 必须最小，避免全局 mock 隐藏真实行为。
- 产品组件：默认不改；只有测试暴露真实缺陷或需要无行为变化 seam 时才进入修改面。

## Cost Summary template

Task: PMA M-05 UI 真实交互测试
Status: in progress — local implementation and mutation proof complete
Files changed: Web/root package scripts, lockfile, Vitest config/setup, four mounted test files, task artifacts
Tests run: interaction 10/10; housing 33/33; homestay 18/18; property 45 assertions + focused 5/5; Web lint passed
Retries: runner/config root causes capped at two fixes; one property V8 crash followed by one focused pass
Approx model rounds: planning 1, implementation/verification 1
Repeated scans avoided: two one-round maps reused; exact target files only reread
Blocked issues: local root-owned stale node_modules prevented authoritative typecheck/build; clean PR CI is the gate
Next step: commit/push, review and CI closure
