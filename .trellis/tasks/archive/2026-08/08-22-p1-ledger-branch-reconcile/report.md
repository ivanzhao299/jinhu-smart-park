# P1 Trellis 账本与待终审分支联合对账报告

日期：2026-08-22

基线：`origin/main` / `ac011419bb617edb4add537cd7cd3722212e91ec`

工作分支：`codex/p1-trellis-ledger-reconcile`

远程操作：无；本轮禁止 push 和远程删除。

## 摘要

- 任务 A：17 项中拟归档 14 项，保持 `in_progress` 3 项，待人工确认 0 项。
- 任务 B：48 支中拟删除 46 支，保留 2 支。证据等级分布：L1=0、L2=0、L3=0、L4=32、L5=14、L6=2。
- 已解除 20 个 clean worktree 的 Git 注册；18 个目录完整移除，2 个因 root-owned 构建/依赖残留未能删除物理目录。保留 `codex/issue-306-property-control-plane-uat-clean` 与 `codex/issue-308-park-dict-param-types` 的 worktree。
- 本报告在任何 task archive、worktree removal 或 branch deletion 之前写入。

## 任务 A：Trellis 账本

### 拟归档（14）

| Trellis 任务 | Issue / PR / main commit | 验收与判定证据 |
|---|---|---|
| `08-12-user-role-management` | #260 / PR #261 / `dad3a11a` | 用户角色读取、候选过滤、事务替换、幂等审计与 Web 新增/编辑/清空均在 main；任务记录的 API/E2E/desktop/390px 门禁通过。 |
| `08-13-08-13-fix-issue-267-asset-code-autogeneration` | #267 / PR #268 / `b9c5ed92` | building/floor/unit 创建态不再 `required`，编辑态仍 required；静态合同存在。PR 已合并，主干后续生产部署全绿。 |
| `08-13-fix-issue-266-tenant-admin-create-park` | #266/#308 / PR #269/#275/#291/#292/#309 / `532c6384`、`3d363b93`、`9fc99926`、`8cd6e511`、`fbefb584` | 独立 park scope、原子 provisioning、生命周期、跨园区楼栋显式目标鉴权、字典参数类型均已在 main；后续 PR review/CI 已闭环，`ac011419` 的生产部署成功覆盖最终 main。 |
| `08-13-issue-277-asset-park-building-chain` | #277 / PR #278 / `5720871a` | 园区选择、列表/详情园区展示、不可编辑迁园、000211 scope 完整性已落地；跨园区创建方式后来由 #266 follow-up 演进为服务端显式 `parkId` 重新鉴权，功能与隔离目标仍满足。 |
| `08-13-production-canonical-source-reconcile` | #264 / PR #265 / `11dcd4c8` | 000207 deterministic survivor、不可变审计、fail-closed、迁移后双门禁与 cleanup 合同进入 main；CI/Release Smoke 及后续 production deploy 成功。 |
| `08-14-08-14-fix-building-save-login-redirect` | 实际 #287 / PR #288 / `f5df4fe7` | `switchParkContext` 在新 token 前失败保留 session，legacy body refresh token fallback 与表单错误路径有回归和 browser UAT；原任务 branch 中的 `#284` 标识是账本误记。 |
| `08-14-fix-tenant-asset-code-park-picker` | #282 / PR #283 / `7c5db355` | 动态 code-rule provisioning、000213 migration、有界 home fallback、创建园区后 `/users/me` 刷新均落地；跨园区楼栋创建随后演进为服务端显式目标鉴权。 |
| `08-17-08-17-leasing-user-picker-fields` | PR #300 / `138823d1` | leads/lead-pool/funnel 的跟进人、接待人、分配目标已改严格 selector，ID payload 与派生名称保持兼容；任务记录真实 API + desktop/390px 验证。 |
| `08-17-role-management-assignable-field-policy-closure` | #297 / PR #298/#301/#302/#303/#304 / `c14a37ad`、`d5b475bd`、`2ced7c96`、`594eba0f`、`f22b012e` | assignability、候选分页、权限绑定一致性、dataScopeConfig、旧字段权限前向收敛均在 main；各阶段 CI/review 完成。 |
| `08-18-park-context-switch-closure` | #310 / PR #311 / `a6349580` | 全局/移动园区切换、floor 切换、失败保留 session 与 context-switch E2E 已落地；building 后续采用受保护显式目标园区 API，是已审查的演进实现而非能力缺失。 |
| `08-18-role-template-instantiation-closure` | PR #305 / `227f7e1d` | shared 模板成为权威来源、metadata 漂移 fail-closed、受保护角色不可改、Web 实例化 CTA/表单及空候选引导均落地；CI/review 完成。 |
| `08-19-08-19-unit-park-switch-closure` | #312 / PR #313 / `6cfff97d` | unit 创建前 auth context switch、候选清理、body 不含 `parkId`、刷新失败提示和静态合同进入 main；PRD 允许明确记录浏览器工具不可用，PR 已记录该限制。 |
| `08-19-production-park-switch-origin-style` | #314 / PR #315 / `e52b215a` | same-origin/forwarded host/referer fallback 与 hostile origin 拒绝测试、select option 颜色、desktop/390px UAT 均有证据。 |
| `08-20-08-20-asset-park-context-pages` | #323 / PR #324 / `ea6ca754` | 5 个目标页面复用共享园区上下文 selector，契约测试、Chrome desktop/390px、main CI 与 Deploy Production 均成功。 |

归档命令统一使用 `python3 .trellis/scripts/task.py archive --no-commit <task>`，避免中间自动提交。

### 保持 `in_progress`（3）

| Trellis 任务 | 已落地部分 | 确认缺口 |
|---|---|---|
| `08-13-issue-271-property-high-risk-actions` | #271 / PR #276 / `073bbb3e`；字段策略、高风险审批、幂等/审计和 UI 已进入 main，CI/Release Smoke 成功。 | `implement.md` 的“desktop/390px 与真实非超管浏览器回归”未完成；#273/PR #281 明确不冒充该真人/目标环境 gate。 |
| `08-16-apartment-ui-unification` | 直接 main commit `9ccc0275` 完成 DS surface、层级、栏目选中态和移动布局。 | PRD 唯一未勾选项为“部署后的桌面和 390px 视觉验收”；未找到该任务专属浏览器证据。PR #320 是公寓资产能源业务闭环，不能代替该视觉验收。 |
| `08-19-formal-production-enablement` | PR #335 / `18dee9ae`；唯一 Production 路由、路径防冲突、health/cleanup 合同及 Deploy Production 已完成。 | PRD R5 明确要求公寓→资产→能源的正式环境最小业务验证；PR #320 提供实现/CI/Release Smoke，但没有找到 production 业务 smoke 证据。 |

### 待人工确认（0）

无。三项保留均有明确、可执行的缺口，不属于证据歧义。

## 任务 B：本地分支

### 统一核验方法

- L1：`git merge-base --is-ancestor <tip> origin/main`（等价于安全判断 `git branch -d` 能否基于 main 删除）。
- L2：对全部本地 `archive/*` 执行 tip containment。
- L3：取 `merge-base(origin/main, branch)`，遍历 `git diff --name-only <merge-base>..<tip>` 的每个文件，逐个比较 `origin/main:<path>` 与 `<branch>:<path>` blob；两侧缺失也视为一致。
- L4：`origin/<branch>` 存在且本地 tip 是远端 tip 的祖先或相等。
- L5：GitHub merged PR 的 `headRefName` 精确匹配；本地 tip 等于该 PR 最后一个 commit；merge commit 是 `origin/main` 祖先；抽查 PR 核心文件在 main 保留或被后续演进替代。
- L6：以上均不满足，保留。

统一重算结果：48/48 均不满足 L1/L2；48/48 均不满足严格 L3（这纠正了把 `git cherry -` 误当作文件内容完全一致的初步结论）。

### 拟删除：L4 远程镜像（32）

以下每支均验证存在 `refs/remotes/origin/<branch>`，且本地 tip 是远端 tip 的祖先或与之相等，因此本地引用可删除、内容仍由远端保全：

| 分支 | tip | 分支 | tip |
|---|---|---|---|
| `codex/fix-issues-242-244` | `cff3611972` | `codex/fix-production-seed-permission-visibility` | `a8206785ff` |
| `codex/issue-248-org-hierarchy` | `ba3a8efeb1` | `codex/issue-262-property-role-productization` | `be6ffc6028` |
| `codex/issue-266-building-origin-followup` | `e86bc98588` | `codex/issue-266-migration-number-hotfix` | `4fb5b1b12d` |
| `codex/issue-267-asset-code-autogeneration` | `9928857772` | `codex/issue-271-property-high-risk-actions` | `66e2cd2102` |
| `codex/issue-272-property-api-e2e` | `864329f159` | `codex/issue-277-asset-park-building-chain` | `3d16ebdc6e` |
| `codex/issue-282-tenant-code-rule-park-picker` | `78e1c8cee4` | `codex/issue-284-building-save-login-redirect` | `71dcf931aa` |
| `codex/issue-297-permission-binding-consistency` | `830bf7ceff` | `codex/issue-297-role-assignability` | `cfdf723b10` |
| `codex/issue-297-role-candidate-pagination` | `3c8c9813ad` | `codex/issue-297-role-management-closure` | `5d058e36ed` |
| `codex/issue-unit-park-switch-closure` | `13e740edc3` | `codex/pr192-human-uat-templates` | `5d40a48b9c` |
| `codex/pr192-postmerge-evidence` | `1fddb2608c` | `codex/pr192-review-a` | `c647bfdca3` |
| `codex/pr192-review-b` | `053032100c` | `codex/pr192-review-c` | `6665651c03` |
| `codex/pr223-uat002-file-delete-fix` | `de92ad70fd` | `fix/uat-building-delete-feedback` | `2cf6a30725` |
| `fix/uat-contract-change-dicts` | `7b67934415` | `fix/uat-contract-unit-link` | `871f08c710` |
| `fix/uat-energy-adjustment-billing-item-picker` | `b83629a10c` | `fix/uat-floor-delete-feedback` | `022aa6a7d2` |
| `fix/uat-floor-edit-existing-plan` | `9734616251` | `fix/uat-floor-plan-delete-state` | `1786f52b92` |
| `fix/uat-iot-alert-rule-device-crash` | `09fd54d884` | `fix/uat-upload-filename-encoding` | `a573a6c25a` |

说明：L4 是用户明确授权的本地删除证据；远程未删除，也不会在本轮 push。

### 拟删除：L5 squash-merge 落地（14）

| 本地分支 | tip = PR 最后提交 | merged PR / main merge | 核心抽查 |
|---|---|---|---|
| `codex/fix-000194-retired-owner-scope` | `ecd0f76b0f` | #293 / `25e64804` | `scripts/repair-000194-retired-runtime-owner.sh` 与 main blob 一致；park/runtime-owner 约束保留。 |
| `codex/fix-building-create-list-new-park` | `950d8f237a` | #294 / `e15ba899` | buildings service/query 与 Web selected-park list 能力在 main 保留。 |
| `codex/fix-deploy-31288737741` | `078e6c347a` | #235 / `de7c4821` | db migration replacement、runtime-control diagnostics 与 CI/deploy gates 在 main 后续演进。 |
| `codex/fix-production-seed-env-precedence` | `ff1db949a6` | #236 / `329fb878` | `prod-deploy.sh` 与 seed precedence contract 在 main 保留。 |
| `codex/fix-production-seed-multi-park-scope` | `e8a95e94c8` | #238 / `40b378aa` | production seed multi-park preflight/reconcile 合同在 main 保留。 |
| `codex/fix-property-park-context-pages` | `4ba209b14b` | #324 / `ea6ca754` | shared selector、5 页接入和 asset park context contract 在 main 保留。 |
| `codex/fix-uat-leasing-role-alias` | `6c9625227f` | #241 / `bb98e094` | leasing role alias seed repair 与回归合同在 main 保留。 |
| `codex/issue-250-tenant-admin-403` | `5facfce4c5` | #252 / `e530ed21` | `apps/web/lib/post-login-route.ts` 与 main blob 一致。 |
| `codex/issue-266-park-lifecycle-followup` | `c557422067` | #291 / `9fc99926` | parks lifecycle/assignment 保护在 main 被 #292/#293 等后续修复演进并保留。 |
| `codex/issue-295-tenant-dictionary-baseline` | `a2e5bc18b7` | #296 / `f172b112` | 000214、tenant dictionary provisioning 与 Web dictionary loading 仍在 main。 |
| `codex/issue-336-housing-rental-closure` | `60f2b6e8c1` | #337 / `ed8cfd24` | housing controller、collection UI、pagination 与技术 UAT 证据进入 main，后续 #338/#339 同步账本。 |
| `codex/issue-336-trellis-final-sync` | `9316fc5f08` | #338 / `0bb5429c` | housing closure task/audit matrix 与 main 一致或由 #339 追加 provenance。 |
| `codex/issue-park-context-switch-closure` | `4f0d876376` | #311 / `a6349580` | UserMenu/MobileTerminalHeader/floor switch/E2E 在 main 保留；building 路径后续安全演进。 |
| `codex/replay-runtime-control-production-seed` | `aaa0152f4e` | #237 / `1a1d7b37` | production `000008` replay 逻辑在 main 被后续 runtime-control 修复演进。 |

### 保留：L6（2）

| 分支 | tip / worktree | 保留原因 |
|---|---|---|
| `codex/issue-306-property-control-plane-uat-clean` | `44257d4429` / `/tmp/jinhu-issue-306-clean-1787031932` | 无同名 remote；没有 `headRefName` 精确匹配的 merged PR（PR #307 的 head 是不带 `-clean` 的另一分支）；相对 main 仍有 32 个改动文件、7 个 blob 不同。 |
| `codex/issue-308-park-dict-param-types` | `e3f17bda08` / `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-308-park-dict-param-types` | 无同名 remote；PR #309 的 head 是 `codex/issue-308-park-dict-param-types-clean`，不能证明当前本地 tip 被保全；相对 main 43 个改动文件、29 个 blob 不同。 |

### worktree 执行结果（20 个 Git 注册已移除）

这些 worktree 对应的分支已在上表获得 L4/L5 删除证据；执行前逐一复核为 clean。18 个目录由 `git worktree remove` 完整移除；以下清单中的 `issue-271-high-risk` 与 `property-role-productization` 已解除 Git worktree 注册，但 root-owned `node_modules`/构建产物导致物理目录残留，本轮按无 sudo 约束停止处理：

- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-asset-park-regression`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-deploy-312887-fix`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-267`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-271-high-risk`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-272-e2e`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-277`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-284-building-save-login`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-295-dicts`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-pr192-human-uat-templates`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-pr223-uat-28d5e517`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-property-role-productization`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-seed-env-fix`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-seed-multi-park-fix`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-seed-permission-fix`
- `/home/jinhuit/JinHuCodebase/jinhu-smart-park-seed-replay`
- `/tmp/jinhu-building-create-list-followup`
- `/tmp/jinhu-issue-336-housing-rental-closure`
- `/tmp/jinhu-park-context-switch-closure`
- `/tmp/jinhu-property-park-context-pages`
- `/tmp/jinhu-unit-park-switch-closure`

不触碰 root-owned `/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-270-owner-scope/`。

### 分支删除执行结果

- 已删除 46 个报告内列明的本地分支：L4 32 支、L5 14 支。
- 保留 2 支 L6 分支及其 worktree：`codex/issue-306-property-control-plane-uat-clean`、`codex/issue-308-park-dict-param-types`。
- `main`、`codex/main-baseline-20260821`、8 个 `archive/*` 与所有远程 refs 未改动。

## 验证与限制

- 已执行只读 Git topology/blob/ref/worktree 检查、`gh issue view`、`gh pr list/view` 和 `git log origin/main` 证据查询。
- 未运行 `pnpm install`、构建或测试套件，遵守用户约束；本任务不修改产品代码。
- GitHub/历史 Trellis 中记录的浏览器、CI、Release Smoke 和 Deploy 结果作为审计证据，本轮没有重跑。
- 删除后的本地 tip 可从已记录 SHA、远端镜像、merged PR 或 Git reflog 恢复；本轮不删除任何远程引用。

## 更正附注（2026-08-22，PR review 跟进）

本报告初版经 Codex Review（PR #341 inline）指出两处完成度误判，现更正如下，原表不改动以保留审计轨迹：

1. **`08-18-park-context-switch-closure` 恢复 `in_progress`**：初版以「E2E 脚本在树」为由归档，但其 implement.md 的 `real HTTP context-switch E2E against local API/DB` 等项从未实际运行通过；该运行时门禁未闭环，不应归档。
2. **`08-18-role-template-instantiation-closure` 恢复 `in_progress`**：implement.md 明确记录桌面/移动浏览器检查因环境不可用而跳过，仅凭实现与 CI 证据不满足 AGENTS.md 浏览器验收要求。
3. 同轮修正：`08-14-fix-tenant-asset-code-park-picker` task.json notes 与 completed 状态矛盾（notes 已更新为记录 PR #283 闭环事实）；journal/index 中瞬态 hash `4f48ad9e`（squash 后不可达）替换为持久引用 `c808eb71`（PR #341）。

更正后任务 A 终态：12 已归档 / 5 保持 in_progress（原 3 + 本附注恢复 2）/ 0 待人工。
