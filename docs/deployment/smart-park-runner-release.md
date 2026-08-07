# Smart Park 问题修复 Runner 发布链路

## 运行边界

- Studio：`/srv/agent-studio`
- Smart Park 状态仓库：`/srv/managed-projects/jinhu-smart-park/state`
- 每个问题的隔离工作树：`/srv/managed-projects/jinhu-smart-park/worktrees`
- Runner 配置：`/etc/anksen-runner/smart-park-runner.env`
- systemd：`anksen-smart-park-runner.service`
- Phoenix 保持在 `/opt/phoenix-runner`，不得共享用户、仓库、环境文件、工作树、日志和 API 凭据。

## 自动发布门禁

1. Smart Park 管理员填写验收标准并批准。
2. Studio 从 `origin/main` 创建任务独占工作树。
3. Planner、Implementer、Validator、Reviewer 全部完成，允许路径和测试证据通过。
4. Release Controller 自动提交并推送到 `runner/<issue-no>`，禁止直接在长期 main 工作区开发。
5. `runner/**` 分支强制执行 `CI` 的 `Lint, Typecheck, Build` 与 `Release Smoke`。
6. 仅当 `origin/main` 仍是任务提交的祖先时，使用原子 fast-forward 推送完成自动合并；主线前进则进入 HOLD，禁止覆盖。
7. 等待 main 的 `Deploy Production` 成功。
8. 验证 `https://park.cnjinhu.com/api/v1/health` 后才回写 `RELEASED`。

Runner 领取后必须在租约过期前调用 `POST /api/v1/admin-issues/:issueNo/runner/renew`，请求同时携带
`runner_id` 与 `lease_token`。建议每 5 分钟续期一次；续期被拒绝时立即进入 HOLD，禁止继续写回。
结果回写也必须携带同一 `runner_id` 与 `lease_token`。

`SUCCEEDED` 的 `release_evidence` 必须显式包含三个门禁，且每项 `status` 均为 `PASS`：

```json
{
  "ci": { "status": "PASS", "url": "https://github.com/.../actions/runs/..." },
  "deployment": { "status": "PASS", "url": "https://github.com/.../actions/runs/..." },
  "production_health": { "status": "PASS", "url": "https://park.cnjinhu.com/api/v1/health" }
}
```

任何缺失、超时、冲突、CI 失败、部署失败或生产探针失败均进入 `HOLD`，不得伪造完成。

## Phoenix 踩坑规避

- 不使用脏的常驻代码目录；每个问题从最新 `origin/main` 创建隔离工作树。
- 不把任务消费和发布开关耦合；安装后默认 `SMART_PARK_AUTO_RELEASE=false`。
- 不重复消费失败任务；Smart Park API 使用租约和过期领取恢复。
- 不仅检查进程存活；同时检查 CI、部署工作流、生产健康地址与回写证据。
- 不把运行凭据写入仓库或日志；配置文件权限为 `0600`。
- 不与 Phoenix 共用服务账号、Unix 用户、Deploy Key 或工作目录。
- 不在迁移失败后继续部署；Release Smoke 和生产迁移均 fail-fast。
- migration 只负责 schema；Runner 权限、角色、禁用机器身份与关系由 production-safe seed 幂等收敛。
- 部署范围包含顶层 production core seed、`database/seeds/production/` 变更或无法识别上一 release 时，生产工作流才设置 `RUN_PRODUCTION_SEED=yes`；此时 `web/fast-css` 模式强制升级为 `full`。其他部署保持 `no`，回滚旧源码时也不重复运行新 seed。
- 触及 migration、production seed、生产部署/健康/清理脚本或相关 workflow 的 PR 会自动执行 Release Smoke，不依赖人工标签。
- 部署前保留应用源码快照；部署失败恢复旧源码并重新构建、健康检查。数据库迁移为 forward-only，涉及破坏性 schema 的变更仍必须人工 HOLD。
- 部署或回滚成功后删除源码快照；回滚失败时保留快照并输出精确路径供人工恢复。

## 启用顺序

1. 修复 204 SSH Key 探针。
2. 安装服务但保持自动发布关闭。
3. 配置 Smart Park 专用服务账号并仅授予 `admin_issue:runner`。
4. 执行 Doctor 和只读 API/仓库探针。
5. 运行一个无业务影响的受控问题修复探针。
6. 确认提交、PR、CI、部署、健康检查和结果回写一致后启用自动发布。

账号激活 workflow 在上传前注册远端清理尝试，并在远端 shell 内再次注册清理 trap；不得把临时
password hash 或激活脚本复制到 `tmp/` 后依赖后续部署清理。
