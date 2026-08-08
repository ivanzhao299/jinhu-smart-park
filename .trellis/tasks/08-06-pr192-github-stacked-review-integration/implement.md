# PR192 GitHub 主干集成实施计划

## Phase 0：冻结与预检

- [x] 获取最新 `origin/main`，记录 SHA 与 divergence。
- [x] 启动本任务并提交只含本任务目录的 coordination SHA；核验其相对 `f19ab4d5`
  无业务/配置变化。
- [x] 核验 snapshot、cutpoints、commit ancestry 和远端 ref 不碰撞。
- [x] 生成 branch/ref manifest 与 SHA-256。
- [x] 核验工作树只含既有 `.codex/config.toml`、`NUL`；不得暂存。
- [x] 推送 immutable snapshot、coordination 与必要 compare refs，禁止 force。

Stop point：任何 ref 已存在且目标不同，立即停止，不覆盖。

## Phase 1：独立集成 worktree

- [x] 从最新 `origin/main` 创建 `codex/pr192-main-integration`。
- [x] 使用独立 worktree，不切换当前用户工作树。
- [x] 以 `--no-ff --no-commit` 合并 coordination SHA。
- [x] 输出冲突清单和逐文件裁决记录。
- [x] 先运行冲突相关 targeted tests，再创建 merge commit。

Stop point：权限、财务、Identity、Files、迁移或 seed 语义无法从现有 contract 判定时，
保持未提交 merge 并请求独立 reviewer，不猜测。

## Phase 2：主干差异与平行修复审计

- [x] 核验已合并 agent/refix 聚合分支不会重复进入。
- [x] 对单项 UAT 需求逐项检查最终 tree，而不是 merge 旧 tips。
- [x] 缺失修复只以基于 integration HEAD 的窄提交补齐。
- [x] 生成 `15b6e8f6..HEAD` closure diff 和风险分类。

## Phase 3：本地质量门

按风险由窄到宽：

```bash
pnpm --filter @jinhu/shared build
pnpm --filter @jinhu/api build
pnpm --filter @jinhu/web lint
pnpm typecheck
pnpm test:unit
pnpm build
git diff --check
```

- [x] Files/Identity/Property/offline/upload targeted tests PASS。
- [x] Migration/seed/production-init contract PASS。
- [x] 全量 verify 等价命令 PASS。
- [x] 失败必须修复或明确为与本任务无关的既有 baseline；P0/P1 不得跳过。

## Phase 4：GitHub Draft PR 与 CI

- [x] 推送 integration branch（无 force）。
- [x] 创建唯一 Draft PR 到 `main`。
- [x] PR body 含 Track 分层、冲突裁决、ancestor-only evidence 声明和 remaining gates。
- [x] GitHub verify PASS。
- [x] 添加 `run-release-smoke` label，release-smoke PASS。
- [x] 记录 PR head SHA；后续 Gate 全部绑定该 SHA。

## Phase 5：Final-SHA 正式验收

### 2026-08-07 main 前移后的重新封版

- [x] 合并最新 `origin/main@5f62efd56cc5e078fd5ab120dce699b7383464be`，保留 PR192 与
  `admin-issue-runner-repair` 双方 API、Web、shared 与 CI 行为。
- [x] 修复 `000190` 迁移编号冲突：已合入 main 的 admin issue 迁移保持不变，尚未合入的
  Property B compatibility migration 顺延到 `000200`，SQL 字节 SHA-256 保持
  `da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a`。
- [x] 重新签名 v13-v31 baseline/formal source manifests，并通过 v13-v31 全链规格。
- [x] 将已归档 authority 定位到 archive 路径；module-core exact tree 以明确白名单更新为
  17 total / 14 production / 3 specs，保持 fail-closed。
- [x] 修复 runner 激活工作流临时文件清理与密码 argv 暴露风险。
- [x] prerequisite 修复前的集成基线已通过本地 lint、typecheck、unit、build、diff-check；
  当时两项独立审查均 APPROVE，open P0/P1/P2=[]。后续 prerequisite 变更须重新跑当前树门禁。
- [x] final-SHA performance provisioning 发现 `000190_admin_issue_runner_repair.sql` 的
  park-scope role conflict target 与当前 tenant-wide role arbiter 不可推断；保持已合入历史
  migration 字节不变，通过 `database/migration-prerequisites/000190_admin_issue_runner_repair/`
  增加只含兼容索引的 production-safe prerequisite，并以真实 PostgreSQL 重放验证。
- [x] 后续 clean-db provisioning 发现 `000193_property_b_runtime_integrity_forward_fix.sql`
  断言的 `biz_property_runtime_checkpoint` 直到 `000200` 才创建；保持两个历史 migration
  字节不变，在 `000193` 前增加与 `000200` 完全兼容、无 DML 的 table prerequisite，
  并扩展 migration prerequisite contract。
- [x] 隔离库重放确认 `000193` 修复后继续暴露 `000194` 对 `sys_property_runtime_control`
  的同类后向定义依赖；增加第二个与 `000200` 精确一致、默认禁用且无 DML 的 table
  prerequisite，并将 `000194` 历史 SHA 纳入合同冻结。
- [x] `000200` 的 pre-existing catalog guard 要求前置对象已有 B0 definition-hash 签名；
  增加 `000200` prerequisite，先对两张表的 57 个 catalog 对象校验固定聚合 SHA-256，
  再写入与 `000200` 相同的签名注释，结构漂移时 fail closed。
- [x] 独立复核发现 fully-migrated 与 non-empty baseline 路径会按 migration-only manifest
  提前 fast-skip，绕过后来新增的 prerequisite；移除该全局快速退出，改为始终逐 migration
  核验 prerequisite、仅逐项跳过 checksum 匹配记录，并新增静态契约。
- [x] 三类隔离 PostgreSQL 回放通过：clean DB 200/200 + 6/6；fully-migrated 库移除两条
  prerequisite 历史和 runtime index 后，200 migration 全 skip、2 prerequisite 重建并重签；
  non-empty baseline 克隆库 200 migration baseline+skip、6 prerequisite 全执行。双历史差异均为 0，
  两个诊断库已删除且残留为 0。
- [x] 当前 prerequisite/runner 修复树重新通过 contract、Shell syntax、Trellis JSON/JSONL、
  diff-check、lint、typecheck 与 production build（158 个静态页面）。
- [x] 当前 prerequisite/runner 修复树通过最终独立审查；发现并修复 fully-migrated
  fast-skip、prerequisite 契约全集漏审和旧运维文档漂移后，open P0/P1/P2=[]。
- [x] `6ea4063b` formal rollback 在 7/19 后因 Web authority high port 52423 被占用而
  `EADDRINUSE` fail closed；cleanup residual=0。当前主机 ephemeral range 为 44620-48715，
  故证据只支持高端口冲突，不推断占用者。将确定性 API/Web listener 分别移至
  20000-24999 / 25000-29999，并增加低于默认 Linux ephemeral 下界的端口带契约；该旧
  run 只保留失败证据，必须在新 SHA 重新执行 19/19。
- [x] `5f46e7dc` 已取得 GitHub verify/release-smoke PASS 与 formal rollback 19/19 PASS；
  但 performance provisioning 前的独立只读计划审查发现清理错误未纳入 residual 的 P1，
  因此该 SHA 的 rollback/CI 依 evidence invalidation policy 降级为 ancestor-only。
- [x] 修复 performance cleanup fail-open：即使 Compose teardown 报错后资源枚举恰为 0，
  teardown error 仍贡献一个 residual 并使 gate 失败；README 与回归测试同步。
- [x] 澄清并强化 business clock 合同：它是数据集 cutoff/reference clock，不冒充冻结系统
  wall clock；值写入 seed manifest、注入全部四个实测容器，并在 load 前逐容器核验绑定。
- [x] 上述 performance evidence 修复通过第三轮独立代码审查，`open P0/P1/P2=[]`；本地
  performance tests 18/18、lint、typecheck、unit、production build 158 pages 与 diff-check PASS。
- [x] `ebdf77b5` 已取得 GitHub verify/release-smoke PASS 与 formal rollback 19/19 PASS；
  rollback evidence/cleanup/RTO-RPO 均经独立复审 APPROVE，残留为 0。performance
  provisioning 前的独立计划复核随后发现批准的数据集/外部镜像未与运行输入强绑定，
  因此该 SHA 的 CI/rollback 按 evidence invalidation policy 降级为 ancestor-only。
- [x] 修复 performance approval binding：显式绑定 approved commit、dataset SHA-256、
  PostgreSQL/browser image digest；executor 在 load 前复核文件、当前 SHA 与实际容器
  image reference；reviewer 与 execution owner 必须命名且不同，并将绑定写入正式证据。
- [ ] 提交并推送 approval-binding 修复，在新的 final SHA 重新取得 GitHub CI、rollback
  19/19 和 formal performance 30/30。
- [ ] prerequisite 修复提交后，重新取得 GitHub verify/release-smoke、rollback 19/19 与
  formal performance 30/30；修复前 `72406a14` 的证据仅保留为失败发现/ancestor 记录。
- [ ] 推送新的 merge commit，并在新 PR head 上重新取得 GitHub verify/release-smoke、
  rollback 19/19 与 formal performance 30/30 证据。

### 2026-08-07 origin/main@1788541f 冲突重封版

- [x] 合并 `origin/main@1788541f`，文本冲突仅涉及 Runner 激活工作流与 production seed README。
- [x] Runner 工作流采用 main 的 SSH agent、host trust、并发锁、TCP keepalive 及本地/远端清理，
  同时保留 stdin JSON 登录请求，避免生产密码进入 curl 参数列表。
- [x] 保持已进入 main 的 `000005_admin_issue_runner_baseline.sql` 路径不变；将尚未合入的 Track B
  reconciliation seed 顺延为 `000006_property_track_b_permission_reconcile.sql`，同步契约与 README，
  由 production seed runner 按字典序确定性执行。
- [x] 接受 main 将 Runner DML 从 `000190_admin_issue_runner_repair.sql` 移入 production seed 的
  新权威字节（SHA-256 `be32f4b806141df07cc4793ce87a1d2f7785c55b6ea848818700b0f2630f04a0`）；
  删除只服务旧 migration conflict target 的 `000190` prerequisite 及过时运维说明。
- [ ] 新 merge commit 重新通过本地 targeted/verify 等价门禁、GitHub verify/release-smoke 与 Codex review。
- [ ] `2302e0c0` 的 CI/rollback 证据降级为 ancestor-only；新 final SHA 重新确认 rollback。正式
  performance 30/30 继续按用户批准的豁免处理，不得改写为 PASS。
- [x] `03c7fddb` 的 GitHub verify PASS；Release Smoke 连续两次仅在 API Docker build 访问
  `registry.npmmirror.com` 时因 503/504/socket timeout 失败，迁移、production seed、bootstrap
  与 baseline 均已通过，判定为外部镜像故障而非产品回归。
- [x] 将 `release-smoke` job 的 `NPM_REGISTRY` 局部固定为 `https://registry.npmjs.org`，保留部署
  和 Compose 的既有默认值；YAML 解析、Compose build args 展开、diff-check 与独立审查通过。

- [ ] 在 final PR head 上完成 rollback 19/19。
- [ ] 在 final PR head 上完成 fresh 30-cell formal performance。
- [ ] formal evidence gate PASS，expected/observed=30/30。
- [ ] cleanup containers/networks/volumes/secrets residual=0。
- [ ] 独立 code/evidence/cleanup reviewers APPROVE，open P0/P1=[]。
- [ ] PR head 未变化；若变化，按 evidence invalidation policy 重跑。

## Phase 6：Ready 与交接

- [ ] 更新 PR body 为 final evidence SHA/链接。
- [ ] 从 Draft 改为 Ready for review。
- [ ] 请求领域、安全、数据库和发布 reviewer。
- [ ] 不启用 auto-merge；人工确认后再合入。
- [ ] 更新父 Trellis 路线图，但不冒充 human/production readiness。

## 回退点

- Phase 0：删除新建的同目标本地 ref；远端 ref 不强删，先确认无人消费。
- Phase 1–3：删除专用 worktree/本地 integration branch 后从记录的 main SHA 重建。
- Phase 4–6：关闭 Draft PR；保留 snapshot 和证据，集成分支不 force rewrite。

## Phase 7：PR diff 瘦身与只读审查投影（2026-08-08）

- [x] 记录 PR #223 瘦身前基线：约 63.6k 文件、12.1M 新增行；确认主要来源为归档
  `formal-source-snapshot/runtime-dependencies`、source maps 与重复 v22-v30 evidence。
- [x] 新增 archive-only ignore 规则；保留 task 摘要、manifest、authority、final report、index、summary。
- [x] 仅从 Git 索引移除生成快照、`.map`、`.tap`、`*.reservation.json` 和版本化原始 evidence；
  不删除 Windows UAT 证据目录，也不物理删除本地归档工作副本。
- [x] 生成 archive retention manifest，复核 v31 compact manifest/authority canonical evidence 仍被跟踪。
- [x] 重新统计 PR 文件/行数：933 files / +177252 / -8254，其中非归档 873、归档 60；
  `git diff --cached --check` 与 ignore contract 通过。
- [x] 提交并推送 `codex/pr192-main-integration`（archive prune `d2a342cc`）；PR #223 CI 已按新 HEAD 重启。
- [x] 建立 `review-root -> review-a -> review-b -> review-c` Draft 投影栈（#227/#228/#229）；每层排除 `.trellis`
  归档噪音，标题/正文标记“只读审查、禁止合并”，不得启用 auto-merge。
- [x] PR #223 正文改为汇总各层审查链接、canonical history、冲突裁决与 CI，不再要求 Codex
  一次性审查全部历史证据。
- [ ] 在瘦身后的 PR #223 新 HEAD 只触发一次 `@codex review`；后续按可操作反馈闭环。

## Phase 8：PR #223 Codex 可操作反馈闭环（2026-08-08）

- [x] 读取 latest-head review 的 8 条完整线程；区分迁移历史误报与 7 项产品/CI 缺口。
- [x] 恢复被 archive prune 误删、但仍由测试与 Track B reconcile 脚本引用的 6 个小型
  canonical contract/handoff；不恢复 14k 行原始运行 artifact。
- [x] 审批最终通过增加生产 execution worker；增加 lifecycle scheduler 顺序排空执行、
  outbox publication/replay 与通知 delivery。
- [x] 注册本地 durable event publisher 与 in-app notification channel；执行事件投影为请求人/
  提交人通知，并以 inbox + stable UUID 保持重放幂等。
- [x] Web 领域运行时增加批准、驳回、撤回操作；Identity 详情增加提交、领取、重新分派、
  核验决定和撤回操作。
- [x] Track B 已集成高风险动作从临时 block 切换为 available，同时继续要求精确 module/page/
  action permission 与 server-side approval。
- [x] 增加任务 authority 周期 reconcile：启动后按稳定游标扫描隔离 tenant/park authority，
  对缺失、软删除、孤儿或 authority 更新时间领先的 projection 以 SERIALIZABLE rebuild 修复。
- [x] IndexedDB `deleteDatabase().onblocked` 改为等待同一请求最终 success/error，并补 blocked
  后成功的回归测试。
- [x] 本地 targeted API 27/27、Web 18/18、API 全量 1052（1039 PASS、13 个无 PG
  环境 SKIP）、lint、typecheck、production build 160 pages 与 diff-check 全部通过。
- [x] 提交并推送新 HEAD `8f1b6b63`。
- [x] 逐线程回复并解决已修复项；迁移 `000183/000199` 以 pre-release 历史与现有合同证据说明
  无已应用 checksum 被改写，不修改 forward-only migration。
- [x] 新 HEAD 重新触发一次 `@codex review`，并取得 #227/#228/#229 三层 bounded Codex review。

## Phase 9：只读审查栈闭环（2026-08-08）

- [x] Track A #227 在 immutable head `c647bfdca37e7fbeff2da504df725db93d002b45`
  完成 Codex review：7 条发现全部在 canonical PR #223 修复；投影剩余可操作项 0。
- [x] Track B #228 在 immutable head `053032100c4b4145a818438d7eaa78a9d012d0d8`
  完成 Codex review：12 条发现中 3 条已由 `8f1b6b63` 修复，其余 9 条由
  `183ceefc` 修复；投影剩余可操作项 0。
- [x] Track C #229 在 immutable head `6665651c030ed075648537aa2c4a54adf7710600`
  完成 Codex review：9 条发现中 untracked build-context 已由 `8f1b6b63` 修复，
  其余 8 条由 `183ceefc` 修复；投影剩余可操作项 0。
- [x] canonical `183ceefc` 同时闭环 #223 最新审查的身份附件/状态/拒绝理由、审批候选
  饥饿、worker Compose env、通知 deepLink、availability 兼容、granular data scope 清理，
  以及 handover/repair 附件只读权限。
- [x] 所有 #227/#228/#229 与 #223 当前 review threads 已逐条回复并 resolved；不修改
  投影分支，不启用 auto-merge。
- [x] 修复树验证：API 全量 unit、API/Web lint/typecheck/build、Track C 18/18、
  A-base 21/21、seed/migration contract 与 `git diff --check` 全部 PASS。
- [x] 将本结论提交推送并同步 PR #223 正文；随后仅对该最终 docs/task HEAD 触发一次
  `@codex review`，等待 CI 与无新增可操作反馈。
- [x] 在 #227/#228/#229 留下完成总结并关闭只读 Draft（不合并、不转 Ready、不删分支）。

## Phase 10：canonical 最终复审闭环（2026-08-08）

- [x] `29c9f441` GitHub verify/release-smoke 全部 PASS；Codex 在该精确 HEAD 返回 5 条
  新的可操作反馈，故该 SHA 不作为最终可合并结论。
- [x] 任务 rebuild 仅为 `eligible` 的 derived authority 补建 open assignment；终态 authority
  继续锁定既有 closed/cancelled assignment，缺失时 fail closed。
- [x] Web 对 legacy availability 全量数组按 20 条本地切页并保留真实 total；审批工作队列
  增加可翻页查询、竞态保护、加载状态与移动端一致的分页控件。
- [x] 本地事件发布器将 claimed/reassigned 身份核验事件幂等投影给 assigned verifier；缺失或
  非法 submission/verifier UUID 继续 fail closed，revoked 等非分配事件不产生误通知。
- [x] 报修草稿恢复通过显式 `pending=true` 服务端查询排除已被 work order 绑定的旧附件；
  其他附件列表保持历史可见语义，提交侧 unbound 校验继续作为最终防线。
- [x] 当前修复通过目标回归（API 41/41、Web 12/12）、API 全量 unit
  （1050 PASS、13 个无 PostgreSQL 环境 SKIP）、API/Web lint/typecheck/build（160 pages）、
  diff-check 与三路独立复核；open P0/P1=[]。
- [x] 已提交推送 `bf35503f`，逐条回复并解决 5 个 latest-head 线程，并对该精确 HEAD
  触发一次 Codex review。
- [ ] 新 canonical HEAD 的 GitHub CI 全绿、Codex 无新增可操作反馈、threads 全部闭环、
  PR 可合并且 auto-merge 未启用；仅在此后通知人工合并。

## Phase 11：迁移文件名历史兼容（2026-08-08）

- [x] `bf35503f` Codex 复审再次指出 base 中 floor-layout migration 曾以
  `000183_floor_layout_deleted_file_backfill.sql` 发布；当前 runner 只按文件名跳过，外部库若已
  记录旧身份会再次执行 `000199`。已知 UAT/旧开发库无该记录，但 runner 契约缺口成立。
- [x] 保持当前 `000183_property_business_granular_rbac.sql` 与 `000199` SQL 字节不变；增加显式
  history alias manifest。仅当旧记录为 succeeded、checksum 等于当前 `000199` 精确 SHA-256、
  canonical 记录不存在时，才在单事务内重签双 history 表并追加 alias 审计行；其他状态 fail closed。
- [x] 修复同类迁移可靠性风险：runner 在 bootstrap 前通过 FIFO 长连接持有数据库级
  `pg_try_advisory_lock`，并以 FULL JOIN 审计双 history 表缺失/状态/checksum 差异；alias marker
  支持相同 checksum 的安全重放，漂移继续 fail closed。
- [x] 本地静态契约、shell syntax、CI YAML、floor-layout target 3/3、API full unit
  （1051 PASS、13 个无 PostgreSQL 环境 SKIP）、API lint/typecheck/build、diff-check 均通过；
  多轮独立复核最终 open P0/P1=[]。本机 Docker 未启动，真实 PostgreSQL alias replay 与并发锁等待
  已加入 GitHub Release Smoke，待新 HEAD CI 执行。
- [ ] 提交推送当前 migration history 修复，回复并解决最新线程，对新 HEAD 仅触发一次 Codex
  review，并等待 GitHub verify/release-smoke 全绿。

## Phase 12：canonical 业务边界复审闭环（2026-08-08）

- [x] 读取 `bf35503f` 同轮 Codex review 的 3 条 inline 线程并核对 canonical 最新树：
  guest candidate 缺 action-context/data-scope、Housing collection 响应乱序、采购日期使用 UTC 默认值。
- [x] Guest candidate 改为要求 `booking_id`、`HOMESTAY_BOOKING_READ + HOMESTAY_STAY_MANAGE`
  和当前 actor；查询以同 tenant/park 的未删除 booking 为 action context，并把 booking unit 约束到
  actor 的 allowed unit scope，空 scope 在查询前返回空页。Web loader 与 access manifest 同步。
- [x] Housing collection 为每次加载分配单调 request sequence（包括权限拒绝路径），旧成功/失败响应
  不再覆盖当前 result/state；effect 依赖 callback，覆盖 feature/action/endpoint/filter/page/user 变化。
- [x] 采购日期改用园区 `businessDate()`，并在客户端 effect 后写入受控 date input，避免 UTC 日期错误
  及服务端/客户端跨上海午夜 hydration 差异。
- [x] 新增 DTO、权限、scope SQL、空 scope、Web 静态契约回归；住房静态目标 8/8 与 diff-check PASS。
  当前 WSL shell 缺少 Node/pnpm，API/Web typecheck、build 与 API targeted tests 交由新 HEAD GitHub CI；
  Windows bundled Node 仅用于无需项目依赖的 CJS 静态目标。
- [x] 三路独立只读复核完成；修复 effect dependency 与 hydration 两项后，当前 open P0/P1/P2=[]。
- [ ] 提交并推送 Phase 12 修复；回复/resolve 3 条线程与迁移 review，更新 PR 正文，并仅对该新
  canonical HEAD 触发一次 `@codex review`；等待 verify/release-smoke 与无新增可操作反馈。

## Phase 13：latest-head 状态与财务安全闭环（2026-08-08）

- [x] `f2ea6b11` GitHub Lint/Typecheck/Build 与 Release Smoke 全部 PASS；Codex 对精确 HEAD
  返回 5 条新反馈（1 P1、4 P2），故该 SHA 仍不作为最终可合并结论。
- [x] Stay add-guest / issue-credential 的显示状态与服务端允许矩阵一致；终态不再显示必然 409
  的操作，draft 仅保留允许的 guest registration。
- [x] Housing collection 将缓存绑定到 endpoint/feature/action/page/filter query identity；跨查询
  先清旧结果，同查询 refresh 仍可保留 stale cache，request sequence 继续阻止乱序完成。
- [x] Lease sign 与 add-occupant 仅在 mutation API 成功后清选择；网络、并发或校验失败保留已上传
  signature，用户仍可重试或删除。
- [x] Finance actions 在 receivable 集合刷新后协调受控 entry kind 与 receivable id；已结清或已移除
  的目标不再残留到下一次提交。
- [x] confirmed booking 改期若产生价格下降，在 occupancy、night、booking、ledger 任何写入前
  fail closed；当前无原子 reschedule approval contract，因此保留 draft 降价及 confirmed 加价，
  不再直接创建 confirmed/unlinked waiver。
- [x] Windows bundled Node 运行无需项目依赖的住房静态目标 9/9、diff-check PASS；两路最终独立
  复核 `open P0/P1/P2=[]`。当前 WSL shell 无 Node/pnpm，完整门禁交由 GitHub CI。
- [ ] 提交推送后逐线程回复/resolve，仅对新 HEAD 触发一次 Codex review，并等待 GitHub CI
  全绿与零新增可操作反馈。

## Phase 14：latest-head 重试、查询与表单边界闭环（2026-08-08）

- [x] `59b91f0a` GitHub verify/release-smoke 全部 PASS；Codex 对该精确 HEAD 返回 6 条
  新反馈（3 P1、3 P2），故继续在 canonical 分支闭环，不修改只读投影。
- [x] 所有异步表单在 `await` 前同步捕获 form element；住房五个命中及 parties/leasing 同类
  风险一起修复，异步成功后不再读取 React event 的 `currentTarget`。
- [x] rejected/withdrawn 审批保持不可变历史，同时允许新 client key 在同 source version 创建
  独立哈希 attempt intent；同 client key 精确重放、active 冲突及 approved/expired 单调 fence 不变。
- [x] Homestay 列表缓存绑定 surface + API query identity，跨筛选/分页清旧结果，same-query refresh
  保留缓存且 request sequence 继续阻止旧请求覆盖。
- [x] 价格日历按后端半开区间请求 `from + 14 days`；精确 missing-configuration 404 转为可配置空态，
  仅显示基础价格 upsert，配置创建成功后才开放日期覆盖价。
- [x] 交割类型与后端租约生命周期一致：active 可入住/退租，expiring/checkout_pending 仅退租，
  其他状态不渲染提交表单。
- [x] Windows bundled Node 运行住房静态契约 10/10，`git diff --check` PASS；三路独立复核
  `open P0/P1/P2=[]`。WSL 无原生 pnpm，Windows UNC 依赖解析无法完成项目 typecheck，完整门禁交由 CI。
- [ ] 提交推送后逐线程回复/resolve，仅对新 HEAD 触发一次 Codex review，并等待 GitHub CI
  全绿与零新增可操作反馈。
