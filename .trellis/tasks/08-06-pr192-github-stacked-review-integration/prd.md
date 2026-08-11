# PR192 GitHub 分层审查与主干集成

## 1. 目标

在不改写 PR192 已验收历史、不混入平行 UAT 分支、不伪造 final-SHA 证据的前提下，
将 `codex/pr192-property-productization-remediation` 安全集成到最新 `main`，先通过不作为
合并来源的 Track A/B/C 只读审查投影缩小审查面，再由唯一可合并的最终集成 PR 汇总审查
结论、运行 GitHub CI，并完成 final-SHA 技术门禁。

## 2. 已确认事实

- 已验收 snapshot：`f19ab4d509595579d40d2906628df409cdfd92aa`。
- 正式性能绑定的代码 SHA：`15b6e8f6edd12759dc35b1675f851c9a0bc52c0c`。
- 初始 `origin/main`：`3608608ad1cb9c1b53c1829f8cd0f9fb33b6f098`。
- merge-base：`696873aa854ef2eed0bc6ab8edfa4043917bdb29`。
- 初始分叉：main-only 68 commits，snapshot-only 88 commits。
- 预测冲突至少涉及 Files API/spec、SaaS modules、`FileUploader.tsx`、Trellis journal
  与一个 homestay spec modify/delete。
- GitHub `main` 未观察到 protection/ruleset；CI 对 PR 运行 verify，release-smoke 仅在
  `run-release-smoke` label 或手动 dispatch 时运行。
- `agent/fix-*` 与 `agent/refix-*` 聚合分支已是 `origin/main` 祖先，不得再次合并。
- 单项 `fix/uat-*` 与聚合历史使用不同 commit identity；不得按分支列表逐个重复合并。
- 旧 formal performance evidence 的 `commitSha` 是 `15b6e8f6...`；现有 gate 不会自动
  比较 evidence commit 与当前 HEAD。

## 3. 要求

### 3.1 历史与分支

- `f19ab4d5` 保持不可变；禁止 rebase、squash、filter、cherry-pick 重建该 snapshot。
- 新任务规划/启动记录必须先形成一个只增加本任务 Trellis 文件的 immutable coordination
  SHA；集成 merge 该 SHA，使任务记录进入最终分支，同时保持 `f19ab4d5` 和
  `15b6e8f6` 原对象为祖先。
- 可以推送 immutable snapshot/ref 作为备份和 compare 输入，但不得为每个 ref 创建可误
  合并的 GitHub PR。
- 只允许一个最终集成分支：`codex/pr192-main-integration`。
- 最终分支必须从执行时最新 `origin/main` 创建，并以 merge coordination SHA 保留
  snapshot commit identity。
- 集成必须在独立 worktree 完成，不能覆盖当前工作树中的用户改动
  `.codex/config.toml` 与 `NUL`。

### 3.2 审查模型

- Track A/B/C 使用从 immutable cutpoint 生成的**审查投影分支**；投影只保留可审查代码差异，
  排除 `.trellis` 归档快照、运行时依赖复制件和瞬态测试输出。
- 审查投影 PR 必须保持 Draft，标题和正文标记“只读审查、禁止合并”，base 指向前一层投影
  或专用 review root；它们只承载 Codex/人工审查，不是生产合并来源。
- 唯一可合并 PR 仍为 `codex/pr192-main-integration -> main`（#223）。它负责汇总各层审查、
  main 冲突裁决、跨 Track Gate、CI/release-smoke 与最终交接，不再要求 Codex 一次性覆盖
  全部历史证据。
- PR #223 的归档只保留 task 摘要、manifest、最终报告和必要索引；生成快照与旧重复 evidence
  必须从最终 diff 移除，并由根 `.gitignore` 防止再次纳入。
- 不依赖当前不存在的 branch protection；所有审查 PR 不得启用 auto-merge，最终 PR 只能由
  用户人工合并。

### 3.3 平行分支

- 已进入 `origin/main` 的 agent/refix 聚合分支不再集成。
- 单项 UAT 分支默认不再合并；先以最终 merged tree 做行为/文件审计。
- 只有出现可证明的功能缺口时，才为单项修复建立新的、基于集成分支的窄提交；不得
  直接 merge 旧分支 tip。

### 3.4 证据

- 旧 rollback/performance 证据只能描述 `15b6e8f6`，不能描述新的集成 HEAD。
- 集成过程中必须验证 `15b6e8f6` 仍为祖先，并记录从该 SHA 到最终 HEAD 的相关 diff。
- 最终集成 SHA 必须重新确认 rollback；formal performance 30/30 按用户批准的豁免保持
  “已跳过”，不得声明 PASS。
- 新证据必须包含 commit SHA、profile/dataset/environment digest、artifact SHA、失败日志
  和 cleanup residual=0。

### 3.5 GitHub CI 与发布门禁

- PR verify 必须通过：frozen install、lint、shared build、typecheck、unit tests、build。
- 最终 PR 必须添加 `run-release-smoke` 并通过 release-smoke。
- 本地先运行与冲突文件相关的 targeted tests，再运行全量 gate。
- 所有 CI/正式证据必须绑定最终 PR head SHA；任何后续代码提交都会使相应 Gate 重新待验。

## 4. 验收标准

- [ ] immutable snapshot/ref 已核验并安全推送，远端不存在碰撞或强推。
- [ ] coordination SHA 仅包含本任务 Trellis 计划/启动记录，并已冻结。
- [ ] review cutpoint manifest 已生成；只创建明确标记“禁止合并”的 A/B/C 审查投影 PR。
- [ ] 独立 worktree 从当时最新 `origin/main` 创建。
- [ ] coordination SHA 以 merge 方式进入集成分支，snapshot 与技术 SHA 仍为祖先。
- [ ] 所有冲突逐文件裁决并记录来源、测试与风险。
- [ ] 平行 agent/UAT 分支没有重复合入；缺口审计有可复查结论。
- [ ] targeted tests、CI verify 与 release-smoke 全部通过。
- [ ] final-SHA rollback 19/19 PASS、cleanup residual=0。
- [ ] formal performance 30/30 在 PR 正文中明确记录为用户批准的“已跳过”，不冒充 PASS。
- [ ] 独立代码/证据/清理 reviewer 均无开放 P0/P1。
- [ ] 唯一可合并 final integration PR 已创建；审查投影 PR 保持 Draft 且禁止合并。
- [ ] `.codex/config.toml`、`NUL`、秘密和本地大型 artifacts 未进入提交或 push。

## 5. Out of Scope

- 不重跑或重写 Track B Chrome UAT。
- 不关闭 `C-P1-CHROME-HOST-ENVIRONMENT`，除非 Chrome 宿主环境真实变化并原样补跑。
- 不代替真人业务、财务、安全或生产发布签署。
- 不在本任务中修改 GitHub 仓库 protection/ruleset；仅记录缺失并采用流程性保护。
- 不清理或删除其他团队的历史远端分支。
