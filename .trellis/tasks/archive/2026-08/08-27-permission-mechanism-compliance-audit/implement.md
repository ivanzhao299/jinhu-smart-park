# 执行计划

1. 固定基线，收集当前 docs 结构、相关 spec、历史 PR/Issue/UAT 与迁移先例。
2. 并行探索 shared/seed 契约、API 权限与 scope、Web 菜单/路由、审批与文件/字段、三模块业务调用链；要求返回 `file:line`。
3. 主线程点验关键出处，归纳 MEC-* 及可检验判据。
4. 生成权限码三视角矩阵和模块 × MEC 矩阵，逐项裁定。
5. 编制分级问题、复现推理、候选方案、推荐方案、依赖和 UAT 清单。
6. 写报告并验证仅文档/Trellis 改动；运行 Markdown/链接、相关静态契约测试（不需要数据库或产品代码写入）。
7. 执行 Trellis quality check；提交并推送报告分支，创建 PR，请求一轮 `@codex review`，处理报告问题。
8. 等待 PR CI 绿色后 squash merge；等待 main CI 与 Deploy 绿色；归档 Trellis 任务并终报。
9. 追加核查 API 菜单构建、Web normalize/first href、session/park switch、role template/bundle 与 module assignment/seed 双重表示，形成条件矩阵。
10. 把 PAM-004+ 与 PAM-001/002/003 合并为统一裁定；对 review 证实的误报记录核销并移出修复队列，再形成决策门、并行组和 UAT 清单；只改报告/Trellis 工件。
11. 更新既有 #431，完成 review findings 修正，等待最新 PR CI、squash merge 与 main CI/Deploy 双绿。
12. §15 父任务收口轮 `20260828-112051`：完成 Phase 0 三工件、隔离 migrate/seed/bootstrap/strict baseline、curl/Chrome 预检、产品 API fixture、8 个真实 Chrome 子 Case、专项 API/Web 契约测试、Network/DB/hash/teardown 证据链。结果见 `docs/uat/pam-audit-s15-regression-uat-20260828-112051.md`。终局按权威组级口径为 G1 PASS、G4 浏览器+契约证据闭合；G2 完整普通/super/`*` 矩阵、G3 产品 API drift/orphan-parent、G5 module/relogin、G6 asset-local/page-state/API scope、G7 完整文件/审批安全链仍 BLOCKED，因此父任务不得归档。

## s15-progress

- 上轮 `20260828-112051`：G1/G4 PASS，8 个 Chrome 子 Case PASS，无产品 FAIL；G2/G3/G5/G6/G7 因覆盖不足 BLOCKED。权威证据：`docs/uat/pam-audit-s15-regression-uat-20260828-112051.md`。
- 补完轮 `20260828-122122`：在一次性 API+PostgreSQL Compose、独立 PostgreSQL/文件卷和本地 Web/专用 Chrome profile 上完成剩余五项。G2 normal/super/wildcard、模块组合、future/expired 与负向 API PASS；G3 三种产品 API 漂移与 test-only orphan-parent PASS；G5 module toggle + logout/relogin PASS；G6 asset page-local switch/page-state/scoped API PASS；G7 未修改官方 property API safety gate 两 suite PASS，G7 四个浏览器页、Network、DB maker-checker/file/field evidence PASS。
- 证据索引：`docs/uat/pam-audit-s15-regression-uat-20260828-122122.md`；临时根 `/tmp/jinhu-pam-s15-closure-uat-20260828-122122/`；最终 teardown 为 project containers/volumes/network 0 且端口释放。
- 最终组级状态：G1–G7 全 PASS，无产品 FAIL，无新增 Issue。下一起点：运行 Trellis quality check，提交/推送证据分支，PR review ≤3、CI、squash merge、main CI/Deploy 双绿后归档父任务。
- PR #452 review round 1 的五项 finding 全部点验为有效。以两个额外 fresh-volume lifecycle 补跑 G2 Cartesian、G5 module two-tab/refresh、G6 Park-B-specific body、G7 Homestay dependency/cross-scope/field/file；均 PASS。审计报告与 `decision-record.md` 的旧 BLOCKED 权威状态在同一 PR 同步。review-fix 证据继续归入 `/tmp/jinhu-pam-s15-closure-uat-20260828-122122/`，最终 project containers/volumes/network 与五端口均归零。
- PR #452 review round 2 的七项 finding 全部点验为有效并在最终 fresh-volume lifecycle 关闭：28 个 Homestay endpoint asset-off=403/恢复；五种受保护 biz type 各自 list/detail/upload/download/delete protection；booking identity 与 credential 响应安全、housing finance/credential hidden/masked 合约；restricted-unit 403；maker-checker CAS/idempotency/concurrency/retry/trusted-proof/immutable；G5 action add/remove 双 tab+刷新+重登；G6 A/B 不同 role links/module assignments/Sidebar 与 page-local switch。官方 gate 两 suite PASS；专项测试 79 项中 72 PASS、7 项按显式 PG 环境 guard SKIP、0 FAIL；DB 12/12 separated+approved+executed；186 个最终证据校验和条目、28 张截图；teardown containers/volumes/networks/listeners 全 0。
- PR #452 review round 3 的一项 finding 有效：原 test-only orphan 使用 fallback 未知 synthetic code，属于 tautological green。替换为 fallback-known `park:read` 后先红，证明真实静态 fallback 重建缺口；`UsersService.buildPermissionMenuTree` 已最小改为“只要存在 seeded menu 定义，就以 seeded tree（包括权威空树）为准，仅在完全没有 seeded 定义时兼容 fallback”。专项 menu test 13/13 PASS。三轮上限已用尽，不再触发第四轮 review。

## 验证与停止条件

- `git diff --check`
- 报告内引用路径/行号抽样或脚本校验
- shared 权限/role-template/manifest 相关现有测试（以仓库脚本为准）
- PR 与 main GitHub checks 必须绿色；失败时仅诊断本分支相关问题，不改产品代码。
- 若审计发现 P0，也只报告并提出方案，不开 Issue、不实施修复。
