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

任何缺失、超时、冲突、CI 失败、部署失败或生产探针失败均进入 `HOLD`，不得伪造完成。

## Phoenix 踩坑规避

- 不使用脏的常驻代码目录；每个问题从最新 `origin/main` 创建隔离工作树。
- 不把任务消费和发布开关耦合；安装后默认 `SMART_PARK_AUTO_RELEASE=false`。
- 不重复消费失败任务；Smart Park API 使用租约和过期领取恢复。
- 不仅检查进程存活；同时检查 CI、部署工作流、生产健康地址与回写证据。
- 不把运行凭据写入仓库或日志；配置文件权限为 `0600`。
- 不与 Phoenix 共用服务账号、Unix 用户、Deploy Key 或工作目录。
- 不在迁移失败后继续部署；Release Smoke 和生产迁移均 fail-fast。
- 部署前保留应用源码快照；部署失败恢复旧源码并重新构建、健康检查。数据库迁移为 forward-only，涉及破坏性 schema 的变更仍必须人工 HOLD。

## 启用顺序

1. 修复 204 SSH Key 探针。
2. 安装服务但保持自动发布关闭。
3. 配置 Smart Park 专用服务账号并仅授予 `admin_issue:runner`。
4. 执行 Doctor 和只读 API/仓库探针。
5. 运行一个无业务影响的受控问题修复探针。
6. 确认提交、PR、CI、部署、健康检查和结果回写一致后启用自动发布。
