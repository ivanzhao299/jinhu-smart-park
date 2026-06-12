# smart-park handover checklist drift report

## 1. 审计范围

- `新增补充` 本次只读审计对比对象为 `docs/handover/smart-park-handover-checklist.md` 与当前仓库工作区内容。
- `新增补充` 审计时间基于当前工作区命令结果；未连接生产服务器，未验证 `/opt/jinhu-smart-park` 的真实目录形态。
- `不建议自动修改` 原移交清单未被修改；本报告仅记录差异与建议。
- `需人工确认` `docs/handover/smart-park-handover-checklist.md` 当前在 Git 状态中显示为未跟踪文件，后续提交前需要确认是否应同时纳入版本管理。

## 2. 总体结论

- `需更新` 移交清单的当前基线已明显过期：当前分支、HEAD、最近提交、migration 数量、smoke/e2e 脚本数量、前端页面数量均与仓库当前状态不一致。
- `需更新` CI/CD 章节需要更新：当前已有 `.github/workflows/api-snapshot-numeric.yml`，`ci.yml` 也包含 `release-smoke` job。
- `需更新` 部署风险描述需要修正：`deploy-production.yml` 当前未使用远端 `git pull`，已经改为 GitHub Actions 端 `rsync -az --delete` 同步后在远端执行 `pnpm prod:deploy && pnpm prod:health`。
- `新增补充` 首版 readiness、target environment verification、API snapshot / numeric baseline / manual workflow 相关文档已新增，应纳入移交清单。
- `需人工确认` 生产目录 `/opt/jinhu-smart-park` 是否仍不是 git worktree，本次仅从移交清单旧描述与 workflow 当前实现推断，未做远端核验。

## 3. 已过期内容

- `需更新` 当前分支：
  - 清单：`main`
  - 当前：`docs/update-smart-park-handover-checklist`
- `需更新` 当前 HEAD：
  - 清单最近提交仍停留在 `fdf612c`、`ad3268e`、`3ea8453`、`8b17998`
  - 当前 HEAD：`9b5d18acbbc1348837f209019dee3b257562b2bb`
  - 当前最近提交包含 `9b5d18a Merge pull request #132 ...` 到 `b3386b9 docs: add first release readiness checklist`
- `一致` tag 列表：
  - 当前仍为 `v1-smartpark-s9f1-energy-adjustment`、`v1-smartpark-s9f-energy-billing`、`v1-smartpark-s9e-baseline-freeze`
  - 未发现新增 tag
- `需更新` migration 数量：
  - 清单：137
  - 当前：141
- `需更新` 最新 migration 描述：
  - 清单：连续到 `000137_s9f1_energy_billing_adjustment_reversal.sql`
  - 当前最新为 `000140_expand_audit_request_id.sql`
  - 新增尾部包括 `000138_robot_ezviz_device_sync_permission_patch.sql`、`000139_sys_schema_migration_history.sql`、`000140_expand_audit_request_id.sql`
- `需更新` smoke/e2e 脚本数量：
  - 清单：25
  - 当前：35
- `需更新` 前端 `page.tsx` 页面数量：
  - 清单：86
  - 当前：110
- `需更新` 部署风险：
  - 清单称 `deploy-production.yml` 默认远端执行 `git pull`
  - 当前 workflow 未出现 `git pull`，已使用 `rsync -az --delete`

## 4. 需要更新内容

- `需更新` 当前基线章节建议改为当前实际分支、HEAD、最近 10 条提交摘要，并保留 tag 列表为一致项。
- `需更新` migration 章节建议将数量更新为 141，并说明最新尾部 migration 至 `000140_expand_audit_request_id.sql`。
- `需更新` 测试脚本章节建议把数量更新为 35，并补充以下当前清单未覆盖的脚本类别：
  - `新增补充` API snapshot：`first-release-api-snapshots.mjs`、`bootstrap-api-snapshot-data.mjs`
  - `新增补充` first-release 回归入口：`first-release-regression.mjs` 及 auth/files/idempotency/users-assets/workorders/leasing/menu-whitelist 子脚本
  - `新增补充` S6/S8/S9 smoke 当前均在 `scripts/e2e` 顶层
- `需更新` 前端页面章节建议将页面数量更新为 110，并补充新增或容易遗漏的页面范围：
  - `新增补充` `/admin/energy/**` 与 `/energy/**`
  - `新增补充` `/admin/iot/**`、`/iot/metrics`、`/iot/overview`
  - `新增补充` `/admin/video-security/**`
  - `新增补充` `/robots/cleaning`、`/robots/overview`
  - `新增补充` `/finance/**` 与 leasing 财务页面别名/入口
- `一致` package scripts 中清单重点命令仍存在：
  - `db:migrate`
  - `db:seed:prod`
  - `db:check:init`
  - `db:bootstrap:admin`
  - `prod:deploy`
  - `prod:health`
  - `prod:cleanup`
  - `prod:up`
  - `prod:down`
- `新增补充` package scripts 未提供 API snapshot 专用 npm script；当前 API snapshot 主要通过 direct node 命令和 `.github/workflows/api-snapshot-numeric.yml` 执行，应在清单中说明。
- `需更新` CI/CD 章节应补充 `.github/workflows/api-snapshot-numeric.yml`。
- `需更新` CI 执行步骤应补充 `release-smoke` job：PostgreSQL、migration、production seed、bootstrap admin、baseline check、API health、login verification、日志 artifact。

## 5. 仍然有效内容

- `一致` 仓库 tag 集合仍与清单列出的三个重要 tag 一致。
- `一致` 生产脚本命令名称仍与清单一致：`pnpm prod:deploy`、`pnpm prod:health`、`pnpm prod:cleanup`、`pnpm prod:up`、`pnpm prod:down`。
- `一致` CI verify job 仍执行 install、lint、shared build、typecheck、build。
- `一致` 生产安全原则仍有效：不应在文档中保存明文密码、私钥、数据库密码、JWT 密钥或第三方 token。
- `一致` migration forward-only、生产 seed 与 dev seed 分离、bootstrap admin 不记录密码等原则仍应保留。
- `需人工确认` 生产服务器、域名、端口、密钥移交项属于外部状态，本次未连接生产环境，不能仅凭仓库确认是否仍完全准确。

## 6. 新增应纳入移交清单的内容

- `新增补充` release readiness 文档：
  - `docs/release/first-release-readiness-checklist.md`
  - `docs/release/first-release-readiness-gap-analysis.md`
- `新增补充` target environment verification 文档：
  - `docs/release/first-release-target-environment-verification-plan.md`
  - `docs/release/first-release-target-environment-verification-dry-run.md`
  - `docs/release/first-release-target-environment-verification-execution-record.md`
- `新增补充` API snapshot / release gate 文档：
  - `docs/testing/first-release-api-snapshot-release-gate-review.md`
  - `docs/testing/api-snapshot-workorders-stats-numeric-baseline-workflow-summary.md`
  - `docs/testing/api-snapshot-regression-plan.md`
  - `docs/testing/api-snapshot-baseline-policy.md`
- `新增补充` GitHub Actions manual workflow：
  - `.github/workflows/api-snapshot-numeric.yml`
  - workflow 名称：`API Snapshot Numeric`
  - 触发方式：`workflow_dispatch`
  - 主要步骤：安装依赖、构建 shared、启动 PostgreSQL、migration、dev seed、启动 API、bootstrap fixed snapshot data、fixed data gate、默认 schema snapshot、numeric snapshot、上传日志 artifact、清理服务
- `新增补充` 当前 release readiness 总结应说明：默认 API snapshot 与 workorders.stats numeric baseline 已拆分，numeric baseline 只在 fixed / isolated DB 数据集下专项运行，不进入普通 PR / push CI。

## 7. 建议更新章节

- `需更新` 第 1 节“当前基线”：更新分支、HEAD、最近提交、migration 数量、e2e 数量、页面数量。
- `需更新` 第 7 节“数据库权限移交”：将最新 migration 从 `000137...` 更新至 `000140_expand_audit_request_id.sql`，并保留 duplicated `000136_*` 历史风险提示。
- `需更新` 第 9 节“CI/CD 移交”：补充 `release-smoke` job、`api-snapshot-numeric.yml`、manual workflow 边界、日志 artifact。
- `需更新` 第 16 节“测试脚本清单”：补充 35 个顶层 e2e 文件的完整清单，或至少拆成 smoke、first-release regression、API snapshot 三组。
- `需更新` 第 17 节“已知技术债”：删除或改写“deploy-production.yml 默认远端执行 git pull”。
- `需人工确认` 第 17 节仍可保留“生产目录不是 git worktree”作为待核验项，但不应继续描述为与当前 workflow 的 `git pull` 直接冲突。
- `新增补充` 建议新增 release readiness / API snapshot handover 小节，集中链接第 6 节列出的新增文档。

## 8. 不建议修改的内容

- `不建议自动修改` 不建议本次自动修改原移交清单；应由接手/发布负责人确认哪些旧风险已关闭、哪些外部环境状态仍成立。
- `不建议自动修改` 不建议改动 `.github/workflows/**`、`scripts/**`、`database/**`、`apps/**`、`packages/**`、`package.json`、`pnpm-lock.yaml`、`scripts/e2e/snapshots/**`。
- `不建议自动修改` 不建议仅凭仓库文件删除生产目录风险；生产服务器目录是否为 git worktree、rsync 目标目录是否安全、远端 `.env.production` 是否保留，均需人工或远端只读核验。
- `不建议自动修改` 不建议把 API snapshot numeric workflow 加入普通 CI；当前文档明确其为 manual workflow 和专项 numeric gate。

## 9. 验证命令与结果

- `一致` 工作流使用说明：
  - 使用 `using-superpowers` 作为启动流程。
  - 使用 `code-review-and-quality` 做最终差异与只读范围复核。
- `需更新` Git 基线命令结果：
  - `git branch --show-current` -> `docs/update-smart-park-handover-checklist`
  - `git rev-parse HEAD` -> `9b5d18acbbc1348837f209019dee3b257562b2bb`
  - `git log --oneline --decorate -10` -> 最新为 `9b5d18a Merge pull request #132 from ivanzhao299/docs/first-release-target-env-verification-execution`
  - `git tag --list --sort=-creatordate | head -20` -> `v1-smartpark-s9f1-energy-adjustment`、`v1-smartpark-s9f-energy-billing`、`v1-smartpark-s9e-baseline-freeze`
- `需更新` migration 命令结果：
  - `find database/migrations -type f | sort | wc -l` -> `141`
  - 最新 10 个包括 `000132_robot_ezviz_cleaning_integration.sql` 至 `000140_expand_audit_request_id.sql`
- `需更新` smoke/e2e 命令结果：
  - `find scripts/e2e -maxdepth 1 -type f \( -name "*.mjs" -o -name "*.js" -o -name "*.sh" \) | sort | wc -l` -> `35`
  - 当前顶层脚本包含 API snapshot、first-release 回归、S1/S2/S3/S5/S6/S8/S9 smoke
- `需更新` 前端页面命令结果：
  - `find apps/web/app -name "page.tsx" | sort | wc -l` -> `110`
- `一致` package scripts 命令结果：
  - `node -e "const p=require('./package.json'); console.log(JSON.stringify(p.scripts,null,2))"` 已确认清单重点生产/DB 命令仍存在
  - `新增补充` 未发现 API snapshot 专用 package script
- `需更新` CI/CD 命令结果：
  - `ls .github/workflows` -> `api-snapshot-numeric.yml`、`ci.yml`、`deploy-production.yml`
  - `ci.yml` 包含 `verify` 与 `release-smoke`
  - `deploy-production.yml` 包含 `rsync -az --delete`，未发现 `git pull`
  - `api-snapshot-numeric.yml` 为 `workflow_dispatch` manual workflow
- `新增补充` release / deployment / testing 文档命令结果：
  - `ls docs/release`、`ls docs/deployment`、`ls docs/testing` 已确认第 6 节列出的 readiness 与 API snapshot 文档存在
- `需人工确认` 初始 `git status --short` 显示：
  - `?? docs/handover/`
  - 说明 `docs/handover/smart-park-handover-checklist.md` 当前未被 Git 跟踪
- `不建议自动修改` 建议 commit message：
  - `docs: audit smart park handover checklist drift`
