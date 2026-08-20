# 现有 Production 与 Anksen Studio 统一架构

## 1. 单一发布架构

```text
Anksen Studio: /srv/agent-studio
  -> Smart Park state: /srv/managed-projects/jinhu-smart-park/state
  -> isolated worktree: /srv/managed-projects/jinhu-smart-park/worktrees/<task>
  -> CI / review / atomic fast-forward to origin/main
  -> wait for GitHub Actions: Deploy Production
       -> SSH target from PROD_SSH_HOST
       -> business app path from PROD_DEPLOY_PATH
       -> docker compose project jinhu-smart-park-prod
       -> migration / seed decision / deploy / health / cleanup
  -> verify https://park.cnjinhu.com/api/v1/health
  -> write RELEASED evidence
```

这是一条串联链路，不是两种可选部署方式。Studio 是交付控制面，GitHub Actions 是正式部署
执行面，`PROD_DEPLOY_PATH` 是业务应用运行路径。任何一层都不得占用另一层的路径或职责。

## 2. 路径不冲突约束

- `/srv/agent-studio`：Studio 源码，只由 Studio 安装/升级流程维护。
- `/srv/agent-studio-runtime`：Runner 可写运行状态和启动包装。
- `/srv/managed-projects/jinhu-smart-park/state`：干净的项目状态仓库。
- `/srv/managed-projects/jinhu-smart-park/worktrees`：每任务隔离开发目录。
- `PROD_DEPLOY_PATH`：正式业务应用目录，只由 Deploy Production 使用。
- `/opt/phoenix-runner`：Phoenix 独立边界，不共享用户、密钥、环境文件、工作树或日志。

部署前静态/运行时门禁应验证上述路径没有相等、父子覆盖或误用；检查只比较安全的路径标识，
不输出主机、私钥或数据库密码。

## 3. 发布权威与状态机

```text
planned -> isolated_worktree -> validated -> reviewed -> merged_main
-> ci_passed -> deploy_production_passed -> production_health_passed
-> business_smoke_passed -> RELEASED

conflict / main advanced / CI fail / deploy fail / health fail -> HOLD
```

- main 是发布源权威；Runner 分支不能覆盖已前进的 main。
- GitHub Actions run 与 `.release.json` 是部署版本权威。
- migration history 是数据库变更权威。
- `park.cnjinhu.com/api/v1/health` 是正式公网健康权威。
- 公寓业务表与资产 ID 是房源/空间/能源关联的业务权威。

## 4. 环境语义修正

仓库此前把“存在 UAT 账号和 UAT 验收活动”错误推导成“运行环境是 UAT”。修正后：

- Production：实际运行环境，域名 `park.cnjinhu.com`。
- Production UAT：在正式环境上执行的受控验收活动及受保护测试账号，不是另一套环境。
- Local/Integration：开发和 CI 隔离环境。

长期建议逐步减少 Production 上的 UAT 造数测试，并保留只读/最小写入的生产 smoke；但本任务
不另建环境，也不立即删除已有受保护账号，以避免破坏现行部署验证。

## 5. 兼容与风险

- 保持现有 workflow 名称、GitHub Environment 和 Secrets 名称，避免 Studio 等待逻辑失配。
- `PROD_BASE_URL` 在 Studio 记忆中存在引用，而当前 workflow 固定域名；实施时应统一为一个
  有默认值且 fail-closed 的公网地址合同，但不得改变实际域名。
- 环境保护规则可以加固，但不得在未验证 Runner/人工发布授权链前造成自动发布死锁。
- Production UAT 账号验证仍可保留为独立步骤；其失败阻止 RELEASED，但文案必须说明它是
  生产上的受控验收，不是环境分类。
- 部署路径只引用 Secret 名称，不把实际值写进仓库。

## 6. 回滚

- 文档与静态合同修改可随应用版本回滚。
- workflow 变更先以只读诊断或 contract test 验证，不在验证前改动 Secret 值。
- 应用部署失败继续复用现有 source snapshot 回退、重建、健康检查和 Docker 清理。
- 数据库 migration 保持 forward-only，不执行破坏性 down migration。
