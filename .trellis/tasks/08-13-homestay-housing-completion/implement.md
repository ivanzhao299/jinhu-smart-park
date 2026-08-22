# 实施计划

## 0. 规划与去重

- [x] 读取参考任务与现有审计结论。
- [x] 核对历史/活跃 Trellis 任务、代码和 git commits。
- [x] 确认 Issue #251/#253/#260/#262、PR192、PR223、生产部署任务的复用边界。
- [x] 解决高风险前端动作范围：纳入本轮，并逐动作执行五项后端就绪门。
- [ ] 用户审阅 PRD、设计和实施计划。

## 1. GitHub Issue 与子任务

- [ ] 为数据库 owner/scope 加固创建 Issue 和 Trellis 子任务。
- [ ] 为权限字段策略与非超管矩阵创建 Issue 和 Trellis 子任务；依赖 PR #263。
- [ ] 为最小前端增量创建 Issue 和 Trellis 子任务。
- [ ] 为双模块 API E2E/release gate 创建 Issue 和 Trellis 子任务。
- [ ] 将 UAT/readiness 工作链接为 PR192 的领域补充，不重复创建状态机。
- [ ] 每个 Issue 写明现象、根因、非重复证据、跨层方案、验收和回归。

## 2. 实施顺序

- [ ] 从最新 `origin/main` 创建隔离 `codex/` 分支和 worktree，保留当前脏工作区不动。
- [ ] 数据库与权限子任务在独立分支实现、验证和 PR。
- [ ] 前端子任务在依赖合入后实现。
- [ ] 为每个候选高风险动作形成审批/权限/幂等/审计/终态 readiness matrix；只有全绿动作可开放 UI。
- [ ] 自动化门禁子任务消费冻结后的最终合同。
- [ ] 每个子任务执行 trellis-before-dev、实现、trellis-check、提交和 PR。

## 3. 质量门

- [ ] migration 空库/升级库、owner scope PG negative tests、Track-B reconcile。
- [ ] API/Web lint、typecheck、build、相关 unit/integration tests。
- [ ] 民宿/住房真实 API E2E，fixture cleanup residual=0。
- [ ] 非超管正向、缺权、跨园区、字段、文件、模块启停矩阵。
- [ ] Windows Chrome desktop/390px、上传、离线、冲突和错误状态。
- [ ] 文档矩阵绑定同一候选 commit 和环境。

## 4. PR 与发布闭环

- [ ] 每个 PR 最新 head CI 全绿，触发一次 Codex Review。
- [ ] 逐线程修复、中文回复，仅解决已验证项。
- [ ] mergeable=true、required checks/review 满足后自动合并。
- [ ] 监控 Deploy Production：verify、environment gate、migration、seed、deploy、health/ready、公开 UAT、Docker cleanup。
- [ ] 失败时停止后续阶段并执行现有回滚/修复流程。

## 5. 人工与生产门

- [ ] PR223 blocker 清零。
- [ ] PR192 规定的岗位样本、任务数量和具名签署完成。
- [ ] 备份/恢复、RPO/RTO、回滚演练、on-call、观察期完成。
- [ ] 全部 AND 条件满足后更新 `uat_passed` / `production_ready`；否则保持 pending。

## 建议验证命令

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @jinhu/api test:unit
pnpm --filter @jinhu/web test:unit:housing
pnpm --filter @jinhu/web test:unit:property
pnpm test:e2e:homestay-api
pnpm test:e2e:housing-rental-api
pnpm test:e2e:property-track-b-seed-reconcile
pnpm db:migrate
pnpm db:check:init
```

生产部署必须使用现有 workflow/runbook，并在健康检查后完成 Docker cleanup。
