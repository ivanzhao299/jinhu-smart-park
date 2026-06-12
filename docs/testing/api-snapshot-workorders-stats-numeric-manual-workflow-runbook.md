# JinHu Smart Park workorders.stats numeric manual workflow 运行手册

## 1. 目的

`API Snapshot Numeric` workflow 用于 release candidate 前人工触发 `workorders.stats.numeric` snapshot 专项检查。

该 workflow 只检查，不更新 baseline，不接入普通 PR CI，不接入 push CI。

## 2. workflow 入口

入口：

- GitHub Actions
- Workflow 名称：`API Snapshot Numeric`
- Job 名称：`Workorders Stats Numeric Snapshot`
- 触发方式：`Run workflow`
- 推荐分支：`main`

该 workflow 仅支持 `workflow_dispatch`。

## 3. 本次试运行结果

ST-2C-1C 手动试运行结果：

- Run：`#1`
- Result：`succeeded`
- Duration：`2m 48s`
- 触发方式：`workflow_dispatch`
- 是否生成日志：是，job 日志可查看。
- orphan processes cleanup：存在，但 job 为 `succeeded`，判断为 GitHub Actions 对后台 API / Node 进程的正常清理，不作为失败项。

## 4. 执行内容

workflow 执行链路：

1. checkout。
2. setup pnpm / node。
3. `pnpm install --frozen-lockfile`。
4. `pnpm --filter @jinhu/shared build`。
5. 启动 PostgreSQL。
6. 执行 migration。
7. 执行 dev seed。
8. 启动 API on `3002`。
9. 等待 health / readiness。
10. 执行 snapshot bootstrap。
11. SQL gate 检查固定样本、`WO-% = 0`、固定关联链路。
12. 默认 schema snapshot。
13. numeric snapshot。
14. 上传日志 artifact。
15. teardown / cleanup。

## 5. 安全边界

安全边界：

- 仅 `workflow_dispatch`。
- 不接入 `pull_request`。
- 不接入 `push`。
- 不接入 `schedule`。
- 不允许 `UPDATE_SNAPSHOTS=true`。
- 不更新 baseline。
- 不运行 `node scripts/e2e/first-release-workorders.mjs`。
- 不运行写入型工单 e2e。
- 不连接生产库或共享污染库。
- 不依赖外部 API。

## 6. 失败排查顺序

失败时建议按以下顺序排查：

1. dependency install。
2. shared build。
3. PostgreSQL startup。
4. migration。
5. seed。
6. API startup。
7. readiness。
8. bootstrap。
9. SQL gate。
10. default schema snapshot。
11. numeric snapshot。
12. artifact upload。

失败后不应直接更新 baseline。应先判断是环境问题、数据门禁失败、schema 回归还是 stats numeric 口径回归。

## 7. 收口结论

ST-2C-1C 手动试运行通过。

`API Snapshot Numeric` workflow 可保留为 release candidate 前人工专项检查入口。

不建议进入普通 PR CI，不建议进入 push CI。numeric baseline 更新仍需单独 PR 和人工审查。
