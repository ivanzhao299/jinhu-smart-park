# PAM-004 + PAM-005 修复复测 UAT

## 结论

- RUN_ID：`20260827-193922`
- 被测 revision：`d41407b5fe066adf70ca3f4ae5e613999ed44db6`
- 执行日期：2026-08-27（Asia/Singapore）
- 执行者：`emvia`（Codex CLI）
- 执行窗口：`2026-08-27 19:39:48` 至 `19:55:11`（Asia/Singapore；分别取 compose 工件与 cleanup 快照 mtime）
- API / Web 启动 PID：`1236399 / 1236400`；两者在 cleanup 身份核验时已退出，故 `/proc/<pid>/fd` 不再可用。本轮仅据端口归零和无残留进程陈述 cleanup，不声称保存了退出前 fd 链证据。
- 浏览器请求 viewport：`1440 × 960`。实际 viewport 未采集：两次均在首个 login selector 出现前超时，未进入 Case 的 `evaluate` 阶段；不得把请求值冒充实测值。
- 结论：**BLOCKED（浏览器 harness）/ 不归档**。
- PAM-004 与 PAM-005 的代码、单测、PR CI、main CI 和 Deploy 均已通过；本报告不把这些自动门禁冒充真实浏览器 UAT。
- 两次独立 Chrome 执行均在首个登录表单 DOM 定位前超时，没有账号成功登录、没有业务断言、没有截图。依照“同题失败不超过 2 次”停止重试，因此本轮不能给出菜单/首跳场景 PASS。

## 修复交付状态

| 项目 | Issue / PR | Squash commit | Review / CI | main CI / Deploy |
| --- | --- | --- | --- | --- |
| PAM-004 | [#432](https://github.com/ivanzhao299/jinhu-smart-park/issues/432) / [#434](https://github.com/ivanzhao299/jinhu-smart-park/pull/434) | `087582378e7d603d5ee5f388b312258c29784abf` | Codex 第 2 轮无重大问题；PR CI 全绿 | CI [33061820608](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/33061820608) success；Deploy [33061820640](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/33061820640) success |
| PAM-005 | [#433](https://github.com/ivanzhao299/jinhu-smart-park/issues/433) / [#435](https://github.com/ivanzhao299/jinhu-smart-park/pull/435) | `d41407b5fe066adf70ca3f4ae5e613999ed44db6` | Codex 第 1 轮两项 P2 均修复；第 2 轮无重大问题；PR CI [33065683981](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/33065683981) success | CI [33066658926](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/33066658926) success；Deploy [33066658940](https://github.com/ivanzhao299/jinhu-smart-park/actions/runs/33066658940) success |

PAM-005 的 Deploy 工作流完成 `Validate full release`、实际 `Deploy` 和受保护验收账号检查；部署命令保留既定 Docker post-deploy cleanup 契约。本轮没有直接操作生产。

## 隔离环境与初始化

- compose project：`jinhu-pam-fix-uat-20260827-193922`
- 手写 compose：`/tmp/jinhu-pam-fix-20260827-193922/compose.yml`（local-only）
- PostgreSQL / API / Web / Chrome CDP：`55527 / 3151 / 3152 / 9461`
- 数据库：`jinhu_pam_fix_uat_20260827_193922`
- 256/256 migrations、8/8 prerequisites、27 个 production-safe seed 全部成功。
- bootstrap 前 baseline 只有预期的 `no bootstrap admin found`；bootstrap 后 baseline 全 PASS。
- frozen env 权限为 `0600`，密码、JWT 和数据库 secret 均未进入报告；teardown 后 frozen env 与临时 hash/SQL 已删除。
- fixture：3 个普通 park role 与 3 个用户；page/action/Track-B 权限数分别为 `3 / 2 / 12`。初始 `asset=enabled`、`housing_rental=disabled`。

## 计划矩阵与实际状态

本轮没有在启动 Chrome 前形成 SOP 要求的“设计依据清单、设计→实现闭环审计表、角色 × 流程链矩阵”。下面矩阵来自执行请求与修复 PR 的直接测试目标，只能视为未执行计划，不能替代第 0 阶段工件。浏览器执行在第 0 阶段缺失时已经开始，这是本轮除 login selector 超时之外的另一项流程 blocker；下轮必须先补齐并审阅第 0 阶段工件，才能启动任何浏览器 Case。

| Case | 预期 | 实际 | 结果 |
| --- | --- | --- | --- |
| PAM-004-DISABLED | 模块禁用后 `/users/me` 空树；Web 不显示静态 fallback；直达 `/housing` 为 403 | 浏览器未到达登录表单交互，未产生 UI/API 断言 | BLOCKED |
| PAM-005-ENABLED-LANDING | 模块启用且授 page 后菜单出现；登录首跳 href 存在于 Sidebar | 未执行 | BLOCKED |
| ACTION-ONLY | 仅 action、无 page 时无业务菜单 | 未执行 | BLOCKED |
| TRACK-B-TASK-DESK-ONLY | `HOUSING_OPERATOR` 派生普通角色只显示 `/housing/tasks` | 未执行 | BLOCKED |
| AUTH-AFTER-REFRESH | 登录态新增 page 授权时当前视图不即时变化；刷新后出现菜单 | 未执行 | BLOCKED |
| PAM-005-PARK-SWITCH | current/previous user 的园区切换以 normalized tree 判定；legacy/placeholder 旧路径回落到新园区 Sidebar 可见首跳 | 未执行 | BLOCKED |

上述 BLOCKED 不等于产品 FAIL，也不构成 UAT PASS。PAM-004/PAM-005 子任务以及审计父任务必须保持未归档，直到新的 RUN_ID 完成真实浏览器矩阵。

## 浏览器尝试与证据

- Chrome：Windows Chrome 151，`--headless=new`、独立 profile `pam-fix-20260827-193922`、CDP `9461`；未连接或关闭主 Chrome。
- MCP version：`N/A`。本轮没有可用的 chrome-devtools MCP，使用 local-only Node 24 原生 WebSocket raw-CDP harness；harness 未发布独立版本号，脚本路径为 `/tmp/jinhu-pam-fix-20260827-193922/pam-uat.mjs`。
- local-only 根：`/tmp/jinhu-pam-fix-20260827-193922/`。
- 第 1 次：target attach 后未显式重新导航，首个 login selector 在 15 秒内未出现；profile 的 WSL 删除权限不足，但 `Browser.close` 已释放 CDP。
- 第 2 次：增加显式 `/login` 导航并改用 Windows 精确 profile cleanup；login selector 仍在 15 秒内未出现。
- 日志：`browser-run.log`、`browser-run-2.log`、`browser-failure.txt`、`web.log`、`api.log`（local-only）。
- 截图：`0`。因为没有 Case 完成，不创建或伪造截图/manifest。
- 两次失败均发生在账号登录之前；没有旧会话需要 UI logout。专用 Chrome 最终由 `Browser.close` 关闭，CDP 端口与 profile 均归零。

## 清理与 residual

- 精确 fixture before：`sys_user=3`、`sys_role=3`、`rel_user_role=3`、`rel_user_park=3`、`rel_role_perm=17`。
- 按本轮 remark/用户名精确删除后，上述五表全部为 `0`；未使用宽谓词、`TRUNCATE`、trigger 绕过或 `session_replication_role`。
- API/Web 启动进程已随受控执行会话停止；3151/3152 无监听。
- 使用与 `up` 完全相同的 `-p`、`-f`、`--env-file` 执行 `down -v --remove-orphans`。
- compose project 的 container、volume、network 均为 `0`；55527/3151/3152/9461 四端口监听均为 `0`。
- 独占文件根 `/tmp/jinhu-pam-fix-20260827-193922/files` 经精确路径校验后删除。
- `phoenix-v3-db`、`yuzhou-mssql`、`jinhu-smart-park-postgres` 的名称与状态在清理后保持原状，未触碰他人资源。

## 后续门禁

1. 从最新 main 使用新 RUN_ID 重建隔离环境；不得复用本轮 fixture 或浏览器 profile。
2. Chrome 前先完成设计依据清单、设计→实现闭环审计表、角色 × 流程链矩阵，并证明 Case 覆盖 PAM-004/PAM-005 PRD、园区切换和父审计第十五节；缺一项则禁止启动浏览器。
3. 使用 SOP 规定的 chrome-devtools MCP 路径并记录 MCP 版本；若该工具不可用，必须在执行前取得并记录“等价工具例外”批准，不能由执行者自行把 raw CDP 视为等价。
4. 在正式 Case 前增加 login 页 title/body/input selector 的预检截图、实际 viewport 与 CDP target URL 证据；预检失败即停止，不消耗业务 Case 重试。
5. PAM-005 必须包含园区切换用例：previous user 位于会被 normalize 剔除的 legacy/placeholder 路径，切换后必须回落到 current user Sidebar 中存在的 normalized 首跳。
6. 完成六项矩阵、逐步截图、SHA-256 manifest 和标准 MCP/获批等价工具证据后，才可将 PAM-004/PAM-005 两个子任务标记复测 PASS并归档。
7. 审计父任务还必须完整执行审计报告第十五节七组回归（包含四象限、模块时间窗、畸形元数据、双 tab/删权/重登、双园区 scope 以及原安全回归）；六项修复矩阵不能替代父任务的完整归档门禁。
