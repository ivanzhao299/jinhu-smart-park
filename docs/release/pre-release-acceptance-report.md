# JinHu Smart Park 预发环境验收报告

## 1. 验收结论

结论：带条件通过

原因：
- 关键基线已经成立：初始化闭环、`/health`、`/ready`、认证链路、文件存储持久化、首发菜单白名单、第一版幂等控制均已完成验证。
- 预发隔离环境中，`migration -> production seed -> check-init-baseline -> bootstrap-admin -> check-init-baseline` 已形成闭环，且 `bootstrap-admin` 前后态符合预期。
- 容器内运行态验证通过：`/api/v1/health` 返回 `200`，`/api/v1/ready` 返回 `200`，Web `/login` 返回 `200`。
- 认证链路已通过直接 API 验证；但 `scripts/verify-api-login-dockerexec.sh` 在容器内执行时因缺少 `bcrypt` 模块失败，属于验收脚本/镜像完整性问题，不是产品认证链路本身阻断。
- 文件存储、幂等、健康检查、CI 阻断门禁均已具备预发验收所需能力，但本次未把所有核心业务流程、备份恢复和回滚都完整演练一遍，因此结论为“带条件通过”而不是“通过”。

## 2. 验收环境

| 项目 | 值 |
|---|---|
| 分支 | `docs/pre-release-acceptance-report` |
| commit | `06abc92` |
| 是否基于最新 main | 是，`HEAD == origin/main == main` |
| 验收数据库 | `jinhu_pre_release_acceptance` |
| 验收方式 | 独立隔离的 production-like Docker Compose 环境 + 容器内直连验证 + 静态检查 |
| 是否使用 dev seed | 否 |
| 是否使用 production seed | 是 |
| 是否使用 bootstrap-admin | 是 |
| 验收时间 | `2026-06-08 11:07:53 CST` |

## 3. 验收结果总览

| 验收项 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---|
| Git 基线 | 通过 | 否 | 分支正确，基于最新 `main`，工作区干净 |
| lint | 通过 | 否 | 一次通过 |
| typecheck | 通过 | 否 | 首次 workspace 并行执行有一次 `apps/web` 瞬时失败，后续单独复跑通过 |
| build | 通过 | 否 | 一次通过 |
| release-smoke CI | 通过 | 否 | Workflow 结构静态核对通过，沿用已合并的阻断型门禁 |
| compose config | 通过 | 否 | `docker compose -f infra/docker/docker-compose.prod.yml config` 通过 |
| migration | 通过 | 否 | 独立预发库迁移成功 |
| production seed | 通过 | 否 | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` 成功 |
| bootstrap-admin | 通过 | 否 | 首管创建成功 |
| check-init-baseline | 通过 | 否 | bootstrap 前失败、bootstrap 后 PASS，且无 dev seed 污染 |
| /health | 通过 | 否 | 容器内返回 `200` |
| /ready | 通过 | 否 | 容器内返回 `200`，checks 全部 `ok` |
| verify-api-login | 部分通过 | 否 | 直接 API 验证通过，但 `scripts/verify-api-login-dockerexec.sh` 因缺少 `bcrypt` 模块失败 |
| 首发菜单 | 通过 | 否 | 静态确认首发白名单过滤生效，未做浏览器级人工菜单核验 |
| 文件存储 | 通过 | 否 | 上传、下载、删除、重启后下载、`docker compose down` 不带 `-v` 后下载均通过 |
| 幂等 | 通过 | 否 | `POST /users` 同 key 重放验证通过，幂等表记录 `succeeded` |
| 核心业务流程 | 未完全执行 | 否 | 仅完成基础链路与关键模块验证，未逐项覆盖全部菜单下的业务场景 |
| 备份恢复 | 未执行 | 否 | 本次未做完整恢复演练 |
| 回滚 | 未执行 | 否 | 本次未做完整回滚演练 |

## 4. 详细验收记录

### 4.1 Git / 版本基线

- 命令：
  - `git branch --show-current`
  - `git status --short`
  - `git log --oneline --decorate -n 10`
- 结果：
  - 当前分支：`docs/pre-release-acceptance-report`
  - 工作区干净
  - 当前 commit：`06abc92`
  - 基于最新 `main`
- 关键日志摘要：
  - `06abc92 (HEAD -> docs/pre-release-acceptance-report, origin/main, origin/HEAD, main) Merge pull request #9 from ivanzhao299/docs/pre-release-acceptance-checklist`
- 问题：
  - 无

### 4.2 静态质量检查

- 命令：
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- 结果：
  - `lint`：通过
  - `typecheck`：通过
  - `build`：通过
- 关键日志摘要：
  - `typecheck` 首次 workspace 并行执行时，`apps/web` 出现一次瞬时失败，随后 `pnpm --dir apps/web typecheck`、`pnpm --dir apps/api typecheck` 和 workspace 复跑均通过
- 问题：
  - 该瞬时失败记录为非阻断项，建议后续观察是否为并行执行抖动

### 4.3 生产 compose 配置检查

- 命令：
  - `POSTGRES_PASSWORD=placeholder JWT_SECRET=placeholder WEB_ORIGIN=http://127.0.0.1:3202 docker compose -f infra/docker/docker-compose.prod.yml config`
- 结果：
  - 通过
- 关键日志摘要：
  - API 挂载 `api-files-data:/var/lib/jinhu/files`
  - `FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files`
  - `healthcheck` 继续使用 `/api/v1/health`
- 问题：
  - 无

### 4.4 初始化闭环验收

- 验证数据库：
  - `jinhu_pre_release_acceptance`
- 环境说明：
  - 使用独立隔离的 production-like compose stack
  - 未使用 dev seed
  - 使用 production seed
- 执行步骤与结果：

| 步骤 | 命令 / 方法 | 预期结果 | 实际结果 | 是否通过 |
|---|---|---|---|---:|
| migration | `pnpm db:migrate` | 成功执行全部迁移 | 成功 | 是 |
| production seed | `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod` | 成功写入 production seed | 成功 | 是 |
| baseline #1 | `pnpm db:check:init` | 缺 admin 时失败 | 失败，提示 `no bootstrap admin found` | 是 |
| bootstrap-admin | `pnpm db:bootstrap:admin` | 创建首管 | 成功创建 `baseline_admin` | 是 |
| baseline #2 | `pnpm db:check:init` | PASS | `INIT BASELINE RESULT: PASS` | 是 |
| dev seed 污染 | `pnpm db:check:init` 输出 | 不应出现 dev seed 污染 | 未检测到污染 | 是 |

- 关键日志摘要：
  - bootstrap 前：`[FAIL] no bootstrap admin found`
  - bootstrap 后：`[PASS] bootstrap admin exists`
  - 最终：`INIT BASELINE RESULT: PASS`

### 4.5 运行态健康检查验收

- 容器内验证命令：
  - `fetch('http://127.0.0.1:3001/api/v1/health')`
  - `fetch('http://127.0.0.1:3001/api/v1/ready')`
  - `fetch('http://127.0.0.1:3000/login')`
- 结果：
  - `/api/v1/health`：`200`
  - `/api/v1/ready`：`200`
  - Web `/login`：`200`
- `prod-healthcheck.sh` 核对：
  - 支持 `MODE=liveness`
  - 支持 `MODE=readiness`
  - 支持 `MODE=full`
  - 默认 `MODE=liveness`
- 关键日志摘要：
  - `/ready` checks 全部为 `ok`
  - Web `/login` 返回标准 HTML 页面
- 问题：
  - 宿主机侧直连隔离环境端口受 WSL 网络限制，因此采用容器内请求作为等价验证

### 4.6 认证链路验收

- 参考脚本：
  - `scripts/verify-api-login-dockerexec.sh`
- 脚本执行结果：
  - 在容器内执行时失败，原因是 API 容器缺少 `bcrypt` 模块
- 直接 API 验证结果：
  - `/auth/login` 成功
  - `/auth/me` 成功
  - 错误密码失败
  - 短信 mock 被禁用
  - 微信 mock callback 被禁用
- 关键日志摘要：
  - 登录成功返回 `accessToken` / `refreshToken`
  - `/auth/me` 返回当前用户上下文
  - 错误密码返回 `401 Invalid username or password`
  - 短信返回 `短信验证码登录未启用`
  - 微信返回 `微信扫码登录未启用`
- 问题：
  - `scripts/verify-api-login-dockerexec.sh` 在当前镜像中受 `bcrypt` 缺失影响，属于验证脚本/镜像完整性问题

### 4.7 首发菜单验收

- 静态确认：
  - `getDashboardMenus()` 最终返回值经过首发白名单过滤
  - 非首发菜单默认隐藏
  - 菜单隐藏不代表页面代码删除
  - 后端权限未修改
- 运行态确认：
  - Web `/login` 可达，说明前端容器运行正常
- 人工菜单可视化检查：
  - 未执行浏览器级人工逐项点击核验
- 结果：
  - 首发菜单口径与代码和文档一致

### 4.8 文件存储验收

| 用例 | 步骤 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 上传允许类型文件 | 通过 `POST /api/v1/files` 上传 PDF，携带 `X-Idempotency-Key` | 成功创建文件记录 | 成功，返回 `201` | 通过 |
| 下载文件 | 带 token 访问 `/api/v1/files/:id/download` | 返回文件内容 | 返回 `200`，48 bytes，PDF 头部正确 | 通过 |
| 删除文件 | 带 token 和 idempotency key 删除 | 成功软删 | 成功，随后详情 `404` | 通过 |
| API 重启后下载 | `docker restart jinhu-smart-park-prod-api` 后再次下载 | 仍可下载 | 成功 | 通过 |
| `docker compose down` 不带 `-v` | 停服后重新 `up -d` | 文件仍保留 | 成功 | 通过 |
| 持久化目录 | 静态检查 `FILE_STORAGE_LOCAL_ROOT` 与 volume | 指向持久化目录 | `FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files`，`api-files-data` 存在 | 通过 |

- 关键日志摘要：
  - 上传成功后得到文件 URL：`/api/v1/files/<id>/download`
  - 重启前后下载均返回 PDF 数据
  - `docker compose down` 不带 `-v` 后重启仍可下载
- 遗留风险：
  - 生产环境仍需明确备份路径和运维不可误删 volume 的 SOP

### 4.9 幂等控制验收

- 首批接口：
  - `POST /users`
  - `POST /work-orders`
  - `POST /leasing/contracts`
  - `POST /leasing/contracts/:contractId/generate-receivables`
  - `POST /leasing/payments`
- 本次真实重复提交验证：
  - 已执行 `POST /users` 同 key 同 body 两次
  - 第一次返回 `201`
  - 第二次返回相同成功响应
  - 业务表仅存在 1 条用户记录
  - 幂等表最终状态为 `succeeded`
- 关键日志摘要：
  - `FIRST_STATUS 201`
  - `SECOND_STATUS 201`
  - `sys_user` 计数为 `1`
  - `sys_idempotency_request.status = succeeded`
- 未执行项：
  - `POST /work-orders`
  - `POST /leasing/contracts`
  - `POST /leasing/contracts/:contractId/generate-receivables`
  - `POST /leasing/payments`
  - 原因：该轮未继续扩展到更多高风险接口，避免引入额外测试数据依赖

### 4.10 首发核心业务流程验收

| 模块 | 项目 | 结果 | 是否阻断 | 备注 |
|---|---|---|---:|---|
| 系统管理 | 用户 | 通过 | 否 | 结合登录与 `POST /users` 幂等验证，基础链路可用 |
| 系统管理 | 角色 | 未执行 | 否 | 本次未逐项做 UI/接口演练 |
| 系统管理 | 权限 | 未执行 | 否 | 本次未逐项做 UI/接口演练 |
| 系统管理 | 组织 | 未执行 | 否 | 本次未逐项做 UI/接口演练 |
| 系统管理 | 字典 | 未执行 | 否 | 仅做初始化闭环与静态确认 |
| 资产管理 | 园区 | 未执行 | 否 | 未逐项做业务流程演练 |
| 资产管理 | 楼栋 | 未执行 | 否 | 未逐项做业务流程演练 |
| 资产管理 | 楼层 | 未执行 | 否 | 未逐项做业务流程演练 |
| 资产管理 | 房源 / 单元 | 未执行 | 否 | 未逐项做业务流程演练 |
| 资产管理 | 状态看板 / 统计 | 未执行 | 否 | 未逐项做业务流程演练 |
| 招商租赁 | 租户企业 | 未执行 | 否 | 未逐项做业务流程演练 |
| 招商租赁 | 合同 | 未执行 | 否 | 未逐项做业务流程演练 |
| 招商租赁 | 应收 | 未执行 | 否 | 未逐项做业务流程演练 |
| 招商租赁 | 收款 | 未执行 | 否 | 未逐项做业务流程演练 |
| 工单管理 | 工单创建 | 未执行 | 否 | 本次仅做幂等接口静态接入确认 |
| 工单管理 | 工单列表 | 未执行 | 否 | 未做 UI 逐项演练 |
| 工单管理 | 工单看板 | 未执行 | 否 | 未做 UI 逐项演练 |
| 工单管理 | SLA | 未执行 | 否 | 未做 UI 逐项演练 |
| 工单管理 | 超时工单 | 未执行 | 否 | 未做 UI 逐项演练 |
| 工单管理 | 工单统计 | 未执行 | 否 | 未做 UI 逐项演练 |

### 4.11 备份与恢复验收

- PostgreSQL 备份：
  - 未执行完整备份演练
- 文件 volume / 目录备份：
  - 未执行完整备份演练
- 恢复数据库：
  - 未执行
- 恢复文件目录：
  - 未执行
- 恢复后抽样登录和下载：
  - 未执行
- 结论：
  - 上线前必须补齐完整备份 / 恢复演练，至少确认数据库与文件目录在同一时间窗口内可恢复

### 4.12 回滚验收

- 应用镜像回滚方案：
  - 已有 Compose / 镜像回滚路径，但本次未演练
- 配置回滚方案：
  - 需要在上线 SOP 中明确
- migration 回滚策略：
  - 当前仍需单独治理
- 文件 volume：
  - 应保留，不能在回滚中误删
- 回滚后检查项：
  - `/health`
  - `/ready`
  - login
  - file download
- 结论：
  - 回滚路径需要在上线前形成书面 SOP 并演练

## 5. 阻断问题

当前未发现必须阻断本次“预发环境验收报告”结论的产品级 P0 阻断问题。

| 编号 | 模块 | 问题 | 影响 | 建议处理 | 负责人 | 状态 |
|---|---|---|---|---|---|---|
| 无 | 无 | 无产品阻断问题 | 无 | 无 | 无 | 无 |

## 6. 非阻断问题

| 编号 | 模块 | 问题 | 影响 | 建议处理 | 负责人 | 状态 |
|---|---|---|---|---|---|---|
| NBI-1 | 认证验证脚本 | `scripts/verify-api-login-dockerexec.sh` 在当前镜像内因缺少 `bcrypt` 模块失败 | 导致脚本无法直接完整跑通 | 补齐验证镜像依赖或调整脚本执行环境 | 待定 | 待处理 |
| NBI-2 | 静态检查 | `pnpm typecheck` 首次 workspace 并行执行时出现一次 `apps/web` 瞬时失败 | 不影响最终结论，但建议观察稳定性 | 后续持续观察是否为并行抖动 | 待定 | 待观察 |
| NBI-3 | 宿主机网络 | WSL 宿主机侧直连隔离 compose 端口受限 | 运行态验证需改为容器内请求 | 预发或 CI 侧尽量统一验证入口 | 待定 | 待处理 |

## 7. 未执行项

| 未执行项 | 原因 | 是否上线前必须补齐 | 建议补验方式 |
|---|---|---:|---|
| 核心业务流程全量演练 | 本轮聚焦基线与关键闭环，未逐项展开所有首发菜单的业务页面与接口 | 是 | 预发环境按菜单逐项跑验收清单 |
| PostgreSQL 备份演练 | 时间成本较高，且需明确备份窗口 | 是 | 在预发或备份环境做一次完整导出与恢复 |
| 文件目录 / volume 备份演练 | 未做完整恢复链路 | 是 | 备份 volume 后恢复抽样下载验证 |
| 回滚演练 | 需在上线 SOP 里统一执行 | 是 | 模拟应用镜像与配置回滚后复验 `/health`、`/ready`、login、文件下载 |
| 浏览器级菜单可视化核验 | 当前以静态白名单确认和容器内 `/login` 可达性为主 | 否 | 预发环境用人工登录核对菜单展示 |
| `POST /work-orders` 等其余幂等接口重复请求 | 仅验证了 `POST /users` 的真实重放；其余 4 个接口保留为后续补验项 | 否 | 按相同模式逐个补测 |

## 8. Go / No-Go 建议

建议：Conditional Go

依据：
- Go 的关键前提已满足：
  - 初始化闭环通过
  - `/ready` 通过
  - 登录通过
  - 文件存储持久化验证通过
  - 幂等关键接口验证通过
  - release-smoke CI 门禁已具备
- 但本次仍有需要在上线前补齐的事项：
  - `verify-api-login-dockerexec.sh` 的 `bcrypt` 依赖问题
  - 完整备份 / 恢复演练
  - 回滚演练
  - 核心业务流程全量逐项验收

## 9. 后续动作

- 需要修复的问题：
  - 修复或替换 `scripts/verify-api-login-dockerexec.sh` 的执行依赖，确保验证脚本可在目标镜像内直接运行
- 需要人工确认的问题：
  - 生产环境变量真实值
  - 预发 / 生产文件备份路径
  - 是否使用 named volume 还是 bind mount
  - 生产首管真实创建流程
  - 上线前回滚责任人与值守安排
- 需要上线前补验的问题：
  - PostgreSQL 与文件目录的备份 / 恢复演练
  - 回滚演练
  - 核心业务流程逐项验收
- 下一阶段建议：
  - 收口预发验收报告后，输出上线 SOP / 回滚 SOP
  - 单独推进 migration 机制治理
  - 补齐幂等其余 4 个首批接口的真实重复请求验证

## 10. 后续补验引用

- [Conditional Go 遗留项补验报告](/home/veich/JinhuProjects/SmartPark/jinhu-smart-park/docs/release/pre-release-conditional-go-followup.md)
- 该报告用于承接本次预发验收报告中未完成的遗留项补验记录。
