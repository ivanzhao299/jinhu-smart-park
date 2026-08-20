# 环境矩阵

> 状态日期：2026-08-20
> `https://park.cnjinhu.com` 已确认为正式 Production。仓库中的 `production`、`prod:*`、Compose 和 GitHub Environment 均指向这一唯一正式环境；Production 上的受控 UAT 是验收活动，不是另一套运行环境。

## 1. 环境定义

| 环境 | 当前状态 | 主要用途 | 数据要求 | 发布与验证要求 |
|---|---|---|---|---|
| Local | 已使用 | 单人开发、调试、快速验证 | 本地 dev seed，可重建；不得混入共享环境 | 目标模块检查，不代表 UAT |
| Integration/Test | 已使用 | CI、迁移、单元/集成/E2E、release-smoke | 隔离且可清理的自动化测试数据 | lint、typecheck、build、unit、目标 smoke |
| UAT 活动 | 在 Production 上受控执行 | 角色验收、部署后回归和业务验证 | 受保护验收账号、明确标识且可清理的数据 | 不改变 Production 环境身份；写入测试必须受控 |
| Production | 已启用 | 正式业务运行与受控发布后验证 | 正式业务数据、正式账号和审计记录 | Go/No-Go、备份恢复、回滚、监控和值班 |

## 2. 仓库配置映射

| 仓库入口 | 当前用途 | 说明 |
|---|---|---|
| `.env.example` | Local | 本地开发模板 |
| `infra/docker/docker-compose.yml` | Local/Integration | PostgreSQL 本地或测试环境；宿主机端口仅绑定 `127.0.0.1`，避免暴露到局域网；容器启动不自动执行迁移，建库后必须显式运行 `pnpm db:migrate` |
| `.env.production.example` | Production | 生产级安全配置模板，不包含真实密钥 |
| `infra/docker/docker-compose.prod.yml` | Production | 正式 API、Web 与 PostgreSQL Compose 部署基础 |
| `pnpm prod:deploy` | Production | 在 `PROD_DEPLOY_PATH` 内执行正式部署 |
| `Deploy Production` workflow | Production | 唯一正式发布入口，绑定 GitHub Environment `production` |
| `release-smoke` | Integration/Test | 验证生产初始化基线，不代表真实业务验收 |
| `first-release-regression` | UAT 核心回归 | 历史命名，仍作为核心链路回归入口 |

## 3. Production 上的受控 UAT 规则

- 受控 UAT 使用 Production 认证约束：固定短信码为空、短信验证码不可见、微信 mock 关闭。
- UAT 使用 production-safe seed；不得运行 dev seed。
- UAT migration 继续执行 history/checksum、备份、失败即停和审计要求。
- UAT 财务数据必须使用明确测试标识，并在测试计划中声明清理方式。
- UAT 文件、日志和数据库备份用于验收与恢复演练，不等同于正式生产备份证明。
- 验收账号和凭据不得进入 Git、镜像、报告或截图。
- Production 部署后必须执行健康检查和 Docker 清理。

## 4. Production 持续运行条件

正式生产环境持续运行至少需要：

- 明确服务器、域名、HTTPS、网络、存储和监控拓扑。
- 正式密钥、正式账号与受控验收凭据必须分离管理。
- 完成 PostgreSQL 与文件存储备份恢复演练。
- 固化版本、镜像、migration 批次和回滚目标。
- 完成全量目标模块的分批开放决策和首批开放矩阵。
- 完成真实 Production Go/No-Go 审批。
- 建立值班、告警、故障升级和数据事件响应流程。

UAT PASS 是模块开放和发布判断的输入证据之一，不能自动代表所有模块均已正式开放。

## 5. 数据分类

| 数据类型 | Local | Integration/Test | UAT | Production |
|---|---|---|---|---|
| dev seed | 允许 | 按脚本需要 | 禁止 | 禁止 |
| production-safe seed | 可选 | release-smoke 使用 | 必须按基线使用 | 必须按基线使用 |
| 自动化测试数据 | 允许 | 允许 | 受控、标识、可清理 | 原则禁止，特殊情况需审批 |
| 真实业务数据 | 禁止 | 禁止 | 当前禁止作为正式业务运行 | 未来允许 |
| 密钥/密码 | 本地私有 | CI Secret | 受保护 Secret | 独立受保护 Secret |

## 6. 操作前确认

任何名称包含 `prod` 或 `production` 的命令执行前，操作者必须确认：

1. 实际目标必须是 `park.cnjinhu.com` 对应的唯一 Production，不得仅凭命令名称推测其他目标。
2. 当前环境文件、主机、端口和数据库名称是否正确。
3. 是否允许 migration、seed、写入测试数据和清理。
4. 是否具备备份、回滚和证据归档。

不得仅依据脚本名称推断目标环境。

## 7. 关联文档

- [当前产品范围](../product/current-product-scope.md)
- [全量产品 UAT 验收矩阵](../uat/full-product-acceptance-matrix.md)
- [Production-grade 部署说明](./production.md)
- [测试运行手册](../testing/how-to-run-tests.md)
- [生产 migration 策略](../release/production-migration-execution-policy.md)
