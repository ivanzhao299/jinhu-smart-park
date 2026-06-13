# JinHu Smart Park

JinHu Smart Park 是一个面向产业园区数字运营场景的 SaaS 平台，当前采用 `pnpm workspace` monorepo 组织，核心技术栈包括 `Next.js`、`NestJS`、`PostgreSQL`、`Docker Compose`。

当前阶段：首发基线已形成，仓库正在进行上线前质量加固与文档收口。  
首发范围聚焦系统管理、资产、租赁、工单、文件、认证、安全巡检与隐患整改核心菜单和基础运维能力。
`IoT`、能耗、视频、机器人等模块仍视为二期范围；安全“我的巡检”现场执行入口已完成权限适配并进入开放范围，应急、作业许可等安全扩展能力仍暂缓开放。

## 1. 快速入口

- 文档索引：[docs/index.md](docs/index.md)
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
- 生产或预发基线初始化请使用 `production seed` + `bootstrap-admin`
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
- `release-smoke`：CI 生产基线冒烟
- `s5a-safety-smoke`：安全巡检与隐患整改核心链路开放前冒烟
- `first-release regression runner`：首发核心自动化回归统一入口

运行 `first-release-regression` 前请先确保：

- API 已启动
- 数据库已完成 migration
- `production seed` 已执行
- `bootstrap-admin` 已完成
- 管理员账号可成功登录

测试运行入口见 [docs/testing/how-to-run-tests.md](docs/testing/how-to-run-tests.md)。

## 5. 发布与运维

仓库内正式发布与运维资料入口：

- [生产部署说明](docs/deployment/production.md)
- [生产上线 SOP](docs/release/production-release-sop.md)
- [生产回滚 SOP](docs/release/production-rollback-sop.md)
- [安全模块生产发布归档](docs/release/safety-module-production-release-record.md)
- [生产 Migration 执行策略](docs/release/production-migration-execution-policy.md)
- [Go-Live Checklist](docs/release/production-go-live-checklist.md)
- [生产就绪度检查](docs/release/production-go-live-readiness.md)
- [运维排障手册](docs/deployment/troubleshooting.md)

## 6. 首发范围与二期范围

当前首发范围以菜单白名单和已验收主链路为准，重点包括：

- 系统管理
- 资产管理
- 租赁核心链路
- 工单管理
- 文件中心
- 认证与健康检查

说明：

- 菜单白名单控制的是首发展示入口
- 隐藏菜单不等于代码已经删除
- 二期模块启用前仍需独立验收和回归
- 安全巡检与隐患整改核心菜单已进入生产开放验收范围，开放口径见 [安全模块上线整改计划](docs/release/safety-module-release-readiness-plan.md)
- 安全“我的巡检”现场执行入口已完成权限适配并进入开放范围；应急、作业许可等安全扩展能力仍暂缓开放

## 7. 重要约束

- 不使用 `dev seed` 初始化生产或共享环境
- migration 采用 history/checksum 管控，执行前仍需遵守生产 migration 策略
- 写接口默认需要关注幂等键要求
- 文件存储当前为单机本地存储方案，暂不等价于对象存储
- 不要提交真实密钥、真实密码或生产环境配置

## 8. 历史 Handover 资料说明

早期 handover、阶段性审查、上线签字模板等资料保存在仓库外项目交接目录中，用于追溯早期 `P0/P1/P2` 修复过程；本仓库内正式文档入口以本 README 和 [docs/index.md](docs/index.md) 为准。

## 9. 文档索引

完整文档导航见 [docs/index.md](docs/index.md)。
