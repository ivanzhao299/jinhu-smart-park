# 现有 Production 发布闭环实施计划

## Phase 1 — 统一环境事实与部署合同

1. 更新环境矩阵：把 `park.cnjinhu.com` 标记为已启用 Production。
2. 更新生产部署文档：删除“当前最高环境只是 UAT”的过期判断。
3. 明确 Production UAT 是正式环境上的验收活动，不是独立环境。
4. 在 Smart Park Runner 发布文档中补充 Studio、状态仓库、工作树和业务
   `PROD_DEPLOY_PATH` 的不冲突边界。
5. 同步 Anksen Studio 已记录的 deployment route、Environment、domain 和 Compose namespace。

Gate 1：仓库与 Studio 对唯一 Production 身份没有矛盾描述。

## Phase 2 — 加固现有 workflow，不另建部署方式

1. 保持 `.github/workflows/deploy-production.yml`、Environment `production` 和现有触发策略。
2. 将正式公网地址收敛为单一配置合同；默认/实际值仍为 `https://park.cnjinhu.com`。
3. 保留现有 `PROD_SSH_*`、`PROD_DEPLOY_PATH` 和 Compose 部署方式，不迁移 Secret 值。
4. 增加路径/目标冲突检查，禁止业务部署路径落入 Studio、Runner runtime、managed state、
   managed worktrees 或 Phoenix 路径。
5. 保留 migration fail-fast、seed 决策、source snapshot 回滚、health 和强制 Docker 清理。
6. 把“Verify protected UAT accounts through public production”文案修正为 Production 上的受控
   UAT 验证，避免把生产环境误分类。

Gate 2：workflow contract test 证明只有一个 Production route，且现有部署目标未改变。

## Phase 3 — Studio 发布衔接验证

1. 复核 `install-smart-park-runner-systemd.sh` 与 Smart Park 项目发布文档的一致性。
2. 运行 Studio 的只读 doctor/项目命令，确认生产操作仍由 GitHub Actions 承担。
3. 验证 Runner 从 main 隔离工作树开始，只在 CI、部署和正式健康全部通过后写 RELEASED。
4. 验证 main 前进或路径冲突时进入 HOLD。
5. 不修改 Studio 的本地示例项目为可直接部署生产；示例仍保持 deploy forbidden。

Gate 3：Studio 不直接写 `PROD_DEPLOY_PATH`，也不与业务部署目录共用工作树。

## Phase 4 — 质量门禁

按实际改动运行：

```bash
pnpm --filter @jinhu/shared build
pnpm typecheck
pnpm lint
pnpm css:check
pnpm build
git diff --check
```

补充或更新 workflow/部署合同测试，重点断言：

- `park.cnjinhu.com` 是正式健康地址；
- Environment 仍为 `production`；
- 正式发布仍使用 `PROD_DEPLOY_PATH`；
- 不存在 `formal-production` 或第二套 Smart Park deploy workflow；
- Studio 与业务部署路径不会重叠；
- 部署后 Docker cleanup 不可静默跳过。

Gate 4：所有静态合同、构建和目标测试通过。

## Phase 5 — 复用现有方式发布

1. 从任务独占分支提交，经 CI 和审查合并 main。
2. 等待现有 `Deploy Production`，不触发其他部署入口。
3. 检查 migration、seed 决策、部署、健康、回滚快照清理和 Docker 清理证据。
4. 验证 `https://park.cnjinhu.com/api/v1/health`、Web 和 readiness。
5. 验证登录/RBAC及资产→房屋单元→公寓房源→能源关联的最小闭环。
6. 将 CI、deployment、production health 和业务 smoke 归档为 RELEASED 证据。

Gate 5：实际部署 SHA 与 main 目标 SHA 一致，正式健康和业务闭环通过，未产生第二套部署路径。

## 预计改动范围

- `docs/deployment/environment-matrix.md`
- `docs/deployment/production.md`
- `docs/deployment/smart-park-runner-release.md`
- `.github/workflows/deploy-production.yml`（仅必要的合同/文案/防冲突加固）
- 相关 workflow 或部署 contract tests
- 当前 Trellis 任务文件

不修改现有生产 Secret 值，不新建 Production Environment，不新增数据库 migration，除非实施
审计发现与本目标直接相关且无法通过现有 schema 完成的明确缺口。

## 停止条件

- 任何改动会改变 `PROD_SSH_HOST` 或 `PROD_DEPLOY_PATH` 实际目标：停止并复核。
- 发现 Studio 与业务部署路径实际重叠：停止部署，先消除冲突。
- migration、CI、正式部署、health/readiness 或 cleanup 失败：不得标记 RELEASED。
- 实际部署 SHA 与批准 main SHA 不一致：HOLD。

## 2026-08-20 执行状态

- [x] Phase 1：环境事实、Production UAT 语义和 Studio/业务部署边界已统一。
- [x] Phase 2：现有 workflow 已增加部署前路径守卫，未新增部署入口或改变 Secret 目标。
- [x] Phase 3：Studio 文档/安装合同与现有 GitHub Actions 发布职责已对齐。
- [x] Phase 4：路径合同、唯一路由合同、YAML、typecheck、lint、CSS 和生产 build 通过。
- [ ] Phase 5：待提交、CI、合并、现有 Deploy Production 和正式业务 smoke。

本地 `pnpm test` 在首个 S1 smoke 启动阶段停止，原因是工作区没有配置 `JWT_SECRET`，API
按安全合同拒绝启动；未进入业务断言。本任务未写入或生成测试密钥，实际 Release Smoke
由隔离 CI 环境执行。
