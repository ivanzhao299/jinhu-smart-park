# 确认并加固现有正式 Production 发布闭环

## 权威确认

- 用户已确认 `https://park.cnjinhu.com` 是正式 Production。
- GitHub Environment `production`、`.github/workflows/deploy-production.yml`、
  `infra/docker/docker-compose.prod.yml` 与现有 `PROD_*` Secrets 是该正式环境的唯一发布链路。
- 不新建第二套 `formal-production`，不迁移或改写现有生产目标，不制造互相竞争的部署入口。

## Anksen Studio 部署路径审计

Studio 与业务 Production 是相互衔接但职责不同的两层：

| 用途 | 路径/合同 |
|---|---|
| Studio 程序 | `/srv/agent-studio` |
| Studio Runtime | `/srv/agent-studio-runtime` |
| Smart Park 状态仓库 | `/srv/managed-projects/jinhu-smart-park/state` |
| Smart Park 隔离工作树 | `/srv/managed-projects/jinhu-smart-park/worktrees` |
| Runner 配置 | `/etc/anksen-runner/smart-park-runner.env` |
| Runner 服务 | `anksen-smart-park-runner.service` |
| 业务应用部署路径 | GitHub Secret `PROD_DEPLOY_PATH`，不得在文档或代码中推测实际值 |
| 正式域名 | `https://park.cnjinhu.com` |
| 正式发布入口 | GitHub Actions `Deploy Production` |

Anksen Studio 的项目独立性记录也把 Smart Park 生产目标定义为：
`github-actions:jinhu-smart-park:deploy-production`、Environment `production`、
`PROD_SSH_HOST`、`PROD_DEPLOY_PATH` 和 Compose namespace `jinhu-smart-park-prod`。

因此 Studio 不直接 rsync 或 Compose 部署业务应用。它从 `origin/main` 创建隔离工作树，
完成开发/验证/审查，原子 fast-forward 合并 main，然后等待唯一的 `Deploy Production`
成功并验证正式健康地址。这一边界必须保留。

## Goal

在不改变正式域名、主机和部署路径的前提下，消除仓库中把正式环境误写为 UAT 的文档和
流程矛盾；复用现有 GitHub Actions + Anksen Studio 发布方式，把公寓资产能源闭环持续、
可追溯地部署到现有正式 Production。

## Requirements

### R1. 唯一生产目标

- `park.cnjinhu.com` 是正式 Production 的唯一公网身份。
- 所有生产部署继续通过 `Deploy Production` 和 `PROD_DEPLOY_PATH`；禁止另建平行 workflow、
  平行部署目录或第二个 Production Environment。
- Studio 路径、Runner 状态仓库/工作树与业务应用部署路径严格分离。

### R2. Studio 与 GitHub Actions 协作

- Studio 负责隔离开发、验证、审查、提交、推送、main 快进合并和发布证据编排。
- GitHub Actions 负责正式主机部署、migration、production-safe seed 决策、健康检查、
  回滚和 Docker 清理。
- Studio 不绕过 GitHub Actions 直接操作生产数据库、Compose 或 `PROD_DEPLOY_PATH`。
- main 前进、CI 失败、部署失败或正式健康失败时，Runner 必须 HOLD，不得伪造 RELEASED。

### R3. 正式发布安全

- 保持 forward-only migration；migration 失败后不得继续 seed、bootstrap 或部署。
- Production 禁止 dev seed、固定短信码、可见验证码和微信 mock。
- 部署完成必须执行 health/readiness 与 Docker 清理；清理跳过或失败必须明确报告。
- 不读取、展示或复制生产 Secrets 的值。

### R4. 文档一致性

- 修订环境矩阵和生产部署文档中“当前只是 UAT/Production 尚未启用”的过期判断。
- 保留 UAT 测试脚本、测试账号和验收证据的用途说明，但不能因此把运行环境定义成 UAT。
- 把“UAT 验收活动”和“Production 运行环境”明确拆开：测试性质不改变环境身份。
- Anksen Studio、Runner 和 GitHub Actions 的发布边界必须在部署文档中一致。

### R5. 公寓资产能源发布闭环

- 正式版本继续通过资产统一楼栋/楼层/房屋单元，公寓从资产单元选择并形成运营映射，
  能源通过共享资产身份关联。
- 正式发布证据至少包含 CI、Deploy Production、正式健康地址和目标业务最小验证。
- 不因本任务重构既有公寓/资产/能源业务模型。

## Acceptance Criteria

- [x] 仓库与 Studio 均只指向一个 Smart Park Production：`park.cnjinhu.com` + `production` Environment + `PROD_DEPLOY_PATH`。
- [x] 未创建平行 Production workflow、Environment、域名或部署目录。
- [x] Studio 状态路径/工作树与业务应用部署路径的边界已写入文档并有静态检查。
- [x] 环境矩阵不再声称 Production 尚未启用，且能区分 UAT 活动与 Production 环境身份。
- [x] Studio 合并 main 后仍只等待现有 Deploy Production，并以正式健康地址作为 RELEASED 门禁。
- [x] 正式部署继续满足 migration fail-fast、生产安全配置、回滚、健康检查和 Docker 清理要求。
- [ ] 公寓资产能源闭环的 CI、部署、健康和最小业务验证证据完整。
- [x] 没有 Secrets 值写入 Git、日志、任务文档或测试产物。

## Out of Scope

- 新建第二套正式环境、域名、主机、数据库或文件存储。
- 更改 `PROD_DEPLOY_PATH` 的实际 Secret 值。
- 让 Anksen Studio 直接替代 GitHub Actions 部署业务应用。
- 把生产数据复制到其他环境，或在 Production 运行 dev seed。

## Open Questions

无阻断性的产品问题。用户已明确唯一正式 Production 身份和复用现有部署方式。
