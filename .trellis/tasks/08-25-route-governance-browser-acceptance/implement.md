# Implementation Plan

- [x] 建立验收分支，核验工作区、端口、Docker 资源和 Chrome CDP 专用实例。
- [x] 启动独立 PostgreSQL，执行迁移、production seed、两阶段 baseline check 与 bootstrap admin。
- [x] 启动 API/Web，确认 health/ready 200；记录服务日志要点。
- [x] 通过正式 API/最小隔离 DB fixture 创建带统一前缀的租户、首管、后建管理员、工程、窄权限和双园区账号，并核验 `contact_user_id`。
- [x] 连接真实 Chrome，逐项执行桌面 #344/#346/#359/#353/#350/#355 验收并截图。
- [x] 请求 390px 窗口（实际最小 500px）记录超管落点，并验证工程账号 `/engineering/terminal`。
- [x] 汇总矩阵；#355 产品 FAIL 只记录现象与疑似根因。
- [x] 登出并导航 `about:blank`；删除隔离数据库卷/fixture、查询 residual=0，停止服务并 down 独立 compose，确认端口释放。
- [x] 编写 `docs/uat/` 报告并链接 artifacts。
- [x] 四个全 PASS 的 Trellis 修复任务更新并归档；#355 对应任务保持 in_progress。
- [ ] 运行文档/链接/Trellis 状态及 git diff 检查，确认无产品代码改动。
- [ ] 提交并仅推送 `codex/route-governance-browser-acceptance`，创建 PR，完成 `@codex review`、CI、squash merge、main CI+Deploy 观察和本地分支收尾。

## Validation commands

- `docker compose -p <isolated-project> -f infra/docker/docker-compose.yml ps`
- `curl -fsS http://127.0.0.1:3101/api/v1/health`
- `curl -fsS http://127.0.0.1:3101/api/v1/health/ready`
- Chrome CDP navigate/evaluate/screenshot assertions for every case
- SQL prefix/file residual queries and `ss -ltnp` port checks
- `git diff --check`; verify changed paths are Trellis/docs/artifacts only

## Risk gates

- Do not run commands if resolved `DATABASE_URL` is not the isolated localhost port/database.
- Do not expose credentials in commands that will enter committed artifacts.
- Do not archive any source task until its mapped browser cases all PASS.
- Do not merge until branch CI is green; do not report closure until main CI and Deploy reach terminal success or a documented external blocker.
