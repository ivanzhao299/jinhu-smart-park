# JinHu Smart Park

JinHu Smart Park 是一个面向产业园区数字运营场景的 SaaS 平台，当前采用 `pnpm workspace` monorepo 组织，核心技术栈包括 `Next.js`、`NestJS`、`PostgreSQL`、`Docker Compose`。

当前阶段：项目仍在持续开发、功能完善和 UAT 验收，尚未真实投入生产运营。当前最高级别部署环境使用生产相似配置，但其业务属性是 UAT。
当前已经设计开发的全部功能均属于计划上线范围；允许各模块分批完成 UAT、分批正式开放，菜单白名单、模块授权和角色权限只表达阶段性开放状态，不定义永久产品边界。

## 1. 快速入口

- 文档索引：[docs/index.md](docs/index.md)
- 当前产品范围：[docs/product/current-product-scope.md](docs/product/current-product-scope.md)
- 环境矩阵：[docs/deployment/environment-matrix.md](docs/deployment/environment-matrix.md)
- 全量产品 UAT 矩阵：[docs/uat/full-product-acceptance-matrix.md](docs/uat/full-product-acceptance-matrix.md)
- 本地开发与部署入口：[docs/deployment/production.md](docs/deployment/production.md)
- 测试与回归入口：[docs/testing/how-to-run-tests.md](docs/testing/how-to-run-tests.md)
- 首发回归设计：[docs/testing/first-release-regression-plan.md](docs/testing/first-release-regression-plan.md)
- 发布与回滚：
  - [生产上线 SOP](docs/release/production-release-sop.md)
  - [生产回滚 SOP](docs/release/production-rollback-sop.md)
  - [Go-Live Checklist](docs/release/production-go-live-checklist.md)
- 运维排障：[docs/deployment/troubleshooting.md](docs/deployment/troubleshooting.md)
- 历史 handover 说明：早期交接、审查和签字材料保存在仓库外项目交接目录中，本仓库不直接链接这些文件

## 2. 仓库结构

- `apps/api`：NestJS API 服务
- `apps/web`：Next.js Web 管理端
- `packages`：共享包与通用配置
- `database`：SQL migrations 与 seed
- `scripts`：数据库、部署、验证、回归脚本
- `infra/docker`：本地与生产 Docker Compose 配置
- `docs`：仓库内正式文档入口

## 3. 本地开发

最小本地启动流程：

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed:dev
pnpm dev:api
pnpm dev:web
```

补充说明：

- 本地开发默认使用 `.env.example`
- `dev seed` 仅用于本地开发和调试，不用于生产初始化
- 当前 UAT 或未来 Production 的基线初始化请使用 `production seed` + `bootstrap-admin`
- 数据库初始化、生产部署和基线检查细节见 [docs/deployment/production.md](docs/deployment/production.md)

## 4. 测试与质量门禁

当前常用门禁和回归入口：

```bash
pnpm lint
pnpm typecheck
pnpm build
node scripts/e2e/s5a-safety-smoke.mjs
node scripts/e2e/first-release-regression.mjs
```

当前质量口径：

- `lint`：静态质量检查
- `typecheck`：独立类型检查
- `build`：API 与 Web 构建验证
- `release-smoke`：CI 中的生产级初始化基线冒烟，不代表真实生产验收
- `s5a-safety-smoke`：安全巡检与隐患整改核心链路开放前冒烟
- `first-release regression runner`：历史命名的核心自动化回归入口，继续用于 UAT

运行 `first-release-regression` 前请先确保：

- API 已启动
- 数据库已完成 migration
- `production seed` 已执行
- `bootstrap-admin` 已完成
- 管理员账号可成功登录

测试运行入口见 [docs/testing/how-to-run-tests.md](docs/testing/how-to-run-tests.md)。

## 5. UAT、发布与运维

当前 `prod:*` 命令、生产 Compose 和 `Deploy Production` 工作流用于生产级配置下的 UAT 发布与未来正式生产部署。执行前必须根据 [环境矩阵](docs/deployment/environment-matrix.md) 确认实际目标；脚本名称本身不代表系统已真实投产。

仓库内正式发布与运维资料入口：

- [生产部署说明](docs/deployment/production.md)
- [生产上线 SOP](docs/release/production-release-sop.md)
- [生产回滚 SOP](docs/release/production-rollback-sop.md)
- [安全模块生产发布归档](docs/release/safety-module-production-release-record.md)
- [生产 Migration 执行策略](docs/release/production-migration-execution-policy.md)
- [Go-Live Checklist](docs/release/production-go-live-checklist.md)
- [生产就绪度检查](docs/release/production-go-live-readiness.md)
- [运维排障手册](docs/deployment/troubleshooting.md)

## 6. 产品范围与分批开放

当前全部已设计开发模块均属于目标产品范围，包括系统治理、资产、招商租赁、财务、工单、文件、安全、工程、IoT、能源、视频、机器人、驾驶舱、租户服务、移动终端和 AI 工作编排。

实施规则：

- 完整目标范围不删减，但允许分批 UAT、分批正式开放
- 每个模块独立记录开发、UAT、限制开放和阻塞状态
- 首次真实投产只开放已通过当前版本 UAT 且具备运维保障的模块
- 隐藏菜单或未授权模块仍属于目标范围
- 历史“首发/二期”与 production gate 文档保留其阶段性证据语义

当前权威范围见 [当前产品范围](docs/product/current-product-scope.md)，模块状态见 [全量产品 UAT 验收矩阵](docs/uat/full-product-acceptance-matrix.md)。

## 7. 重要约束

- 不使用 `dev seed` 初始化 UAT、未来 Production 或其它共享环境
- migration 采用 history/checksum 管控，执行前仍需遵守生产 migration 策略
- 写接口默认需要关注幂等键要求
- 文件存储当前为单机本地存储方案，暂不等价于对象存储
- 不要提交真实密钥、真实密码或生产环境配置
- 当前是 UAT 不意味着可以降低认证、权限、财务、数据和部署安全要求

## 8. 历史 Handover 资料说明

早期 handover、阶段性审查、上线签字模板等资料保存在仓库外项目交接目录中，用于追溯早期 `P0/P1/P2` 修复过程；本仓库内正式文档入口以本 README 和 [docs/index.md](docs/index.md) 为准。

## 9. 文档索引

完整文档导航见 [docs/index.md](docs/index.md)。
