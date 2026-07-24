# 环境矩阵

> 状态日期：2026-07-24
> 当前尚未启用承载真实业务的 Production 环境。仓库中的 `production` 命名表示生产级配置和未来部署能力，当前实际承载的是 UAT 验收。

## 1. 环境定义

| 环境 | 当前状态 | 主要用途 | 数据要求 | 发布与验证要求 |
|---|---|---|---|---|
| Local | 已使用 | 单人开发、调试、快速验证 | 本地 dev seed，可重建；不得混入共享环境 | 目标模块检查，不代表 UAT |
| Integration/Test | 已使用 | CI、迁移、单元/集成/E2E、release-smoke | 隔离且可清理的自动化测试数据 | lint、typecheck、build、unit、目标 smoke |
| UAT | 当前最高环境 | 生产相似配置下的业务验收、角色验证、部署和回滚演练 | 受控 UAT 账号、明确标识且可清理的数据 | 生产级安全配置、版本追溯、模块 UAT 证据 |
| Production | 尚未启用 | 未来真实业务运行 | 正式业务数据、正式账号和审计记录 | 独立 Go/No-Go、备份恢复、回滚、监控和值班 |

## 2. 仓库配置映射

| 仓库入口 | 当前用途 | 说明 |
|---|---|---|
| `.env.example` | Local | 本地开发模板 |
| `infra/docker/docker-compose.yml` | Local/Integration | PostgreSQL 本地或测试环境 |
| `.env.production.example` | UAT/未来 Production | 生产级安全配置模板，不包含真实密钥 |
| `infra/docker/docker-compose.prod.yml` | 当前 UAT/未来 Production | 当前用于生产相似 UAT；未来可作为正式生产部署基础 |
| `pnpm prod:deploy` | 当前 UAT/未来 Production | 技术命名保留，执行目标必须由操作者确认 |
| `Deploy Production` workflow | 当前 UAT 发布/未来 Production | GitHub Environment 名称不能代替实际环境确认 |
| `release-smoke` | Integration/Test | 验证生产初始化基线，不代表真实业务验收 |
| `first-release-regression` | UAT 核心回归 | 历史命名，仍作为核心链路回归入口 |

## 3. 当前 UAT 规则

- UAT 使用生产级认证约束：固定短信码为空、短信验证码不可见、微信 mock 关闭。
- UAT 使用 production-safe seed；不得运行 dev seed。
- UAT migration 继续执行 history/checksum、备份、失败即停和审计要求。
- UAT 财务数据必须使用明确测试标识，并在测试计划中声明清理方式。
- UAT 文件、日志和数据库备份用于验收与恢复演练，不等同于正式生产备份证明。
- UAT 账号和凭据不得进入 Git、镜像、报告或截图。
- UAT 部署后仍执行健康检查和 Docker 清理。

## 4. 未来 Production 启用条件

正式生产环境启用前至少需要：

- 明确服务器、域名、HTTPS、网络、存储和监控拓扑。
- 建立独立正式密钥和账号，不能直接沿用 UAT 凭据。
- 完成 PostgreSQL 与文件存储备份恢复演练。
- 固化版本、镜像、migration 批次和回滚目标。
- 完成全量目标模块的分批开放决策和首批开放矩阵。
- 完成真实 Production Go/No-Go 审批。
- 建立值班、告警、故障升级和数据事件响应流程。

UAT PASS 只是正式投产的输入证据之一，不能自动转换为 `production_enabled`。

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

1. 实际目标是当前 UAT 还是未来 Production。
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
