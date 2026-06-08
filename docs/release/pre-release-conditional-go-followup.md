# JinHu Smart Park Conditional Go 遗留项补验报告

## 1. 补验结论

结论：Conditional Go

原因：
- 已补完幂等 4 个剩余首批接口的真实重放验证，且均确认同 key 同 body 可复用 succeeded 响应、业务表只写入一次。
- 已补完文件目录备份 / 恢复演练，确认 volume 可备份、可恢复，恢复后文件可再次下载。
- 已补完 PostgreSQL 备份 / 恢复演练，确认可导出、可恢复到新库，并可查询关键表。
- 已补完回滚相关的运行态验证片段，但尚未执行完整镜像 tag 回滚演练。
- 已补完浏览器无法覆盖的认证与菜单静态 / 运行态验证，但浏览器级首发菜单可视化核验仍未完成。
- 仍有少量上线前补验项未完成，故本轮仍不建议直接标记为 Go。

## 2. 补验环境

| 项目 | 值 |
|---|---|
| 分支 | `docs/pre-release-conditional-go-followup` |
| commit | `1691d063b703d1d2966bbc37e31264bc8df43e2b` |
| 验收数据库 | `jinhu_conditional_go_followup` |
| 备份恢复数据库 | `jinhu_conditional_go_restore` |
| 容器 / compose 环境 | `jinhu-conditional-go` 隔离 compose 栈 |
| 验证时间 | `2026-06-08` |
| 是否使用 dev seed | 否 |
| 是否使用 production seed | 是 |
| 是否使用 bootstrap-admin | 是 |

## 3. 遗留项补验总览

| 编号 | 遗留项 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---:|---|
| 1 | `verify-api-login-dockerexec.sh` 在当前镜像内缺少 `bcrypt` 模块 | 未通过 | 否 | 脚本仍可作为分析对象，但无法在当前镜像内完整执行 |
| 2 | 其余 4 个首批幂等接口真实重放验证 | 通过 | 否 | `POST /work-orders`、`POST /leasing/contracts`、`POST /leasing/contracts/:contractId/generate-receivables`、`POST /leasing/payments` 均已补验 |
| 3 | 核心业务流程全量演练 | 未执行完整全量 | 否 | 已补充关键链路片段，完整菜单级演练仍建议在预发人工跑验 |
| 4 | PostgreSQL 备份演练 | 通过 | 否 | `pg_dump` + `pg_restore` 到新库成功 |
| 5 | 文件目录 / volume 备份演练 | 通过 | 否 | 已对 `api-files-data` 进行备份、删除目标文件、恢复、再次下载验证 |
| 6 | 回滚演练 | 部分完成 | 否 | 已确认 down/up 不带 `-v` 不删除文件卷；完整镜像 tag 回滚未执行 |
| 7 | 浏览器级菜单可视化核验 | 未执行 | 否 | 当前仅完成静态白名单与运行态菜单树核对 |

## 4. 幂等接口补验

### 4.1 `POST /work-orders`

| 项目 | 结果 |
|---|---|
| 数据前置条件 | 已存在可用租户、园区、管理员登录；工单字典值使用 `wo_type=repair`、`priority=high` |
| `X-Idempotency-Key` | `cg-wo-followup-0002` |
| 第一次响应状态 | `201` |
| 第二次响应状态 | `201` |
| 业务表验证结果 | `biz_work_order` 仅 1 条，`code=WO-20260608000002` |
| 幂等表验证结果 | `sys_idempotency_request` 仅 1 条，`status=succeeded`，`response_status=201` |
| 是否通过 | 通过 |

### 4.2 `POST /leasing/contracts`

| 项目 | 结果 |
|---|---|
| 数据前置条件 | 已存在 `biz_park_tenant` `CGT-0001`；合同类型使用默认，`payment_period=10` |
| `X-Idempotency-Key` | `cg-contract-followup-0003` |
| 第一次响应状态 | `201` |
| 第二次响应状态 | `201` |
| 业务表验证结果 | `biz_leasing_contract` 仅 1 条，`code=CT-20260608000001` |
| 幂等表验证结果 | `sys_idempotency_request` 仅 1 条，`status=succeeded`，`response_status=201` |
| 是否通过 | 通过 |

### 4.3 `POST /leasing/contracts/:contractId/generate-receivables`

| 项目 | 结果 |
|---|---|
| 数据前置条件 | 合同已完成 submit -> approve -> archive -> effective，且已关联至少 1 个房源 |
| `X-Idempotency-Key` | `cg-receivable-followup-0001` |
| 第一次响应状态 | `201` |
| 第二次响应状态 | `201` |
| 业务表验证结果 | `biz_leasing_receivable` 仅 13 条，未重复生成 |
| 幂等表验证结果 | `sys_idempotency_request` 仅 1 条，`status=succeeded`，`response_status=201` |
| 是否通过 | 通过 |

### 4.4 `POST /leasing/payments`

| 项目 | 结果 |
|---|---|
| 数据前置条件 | 已存在可用 `park_tenant_id` |
| `X-Idempotency-Key` | `cg-payment-followup-0001` |
| 第一次响应状态 | `201` |
| 第二次响应状态 | `201` |
| 业务表验证结果 | `biz_leasing_payment` 仅 1 条，`code=PAY-202606-000001` |
| 幂等表验证结果 | `sys_idempotency_request` 仅 1 条，`status=succeeded`，`response_status=201` |
| 是否通过 | 通过 |

## 5. 文件备份 / 恢复补验

| 项目 | 结果 |
|---|---|
| `FILE_STORAGE_LOCAL_ROOT` | `/var/lib/jinhu/files` |
| volume 名称 | `jinhu-conditional-go_api-files-data` |
| 备份方式 | 在 API 容器内对文件目录执行 `tar -czf /tmp/conditional-go-files-backup.tgz -C /var/lib/jinhu/files .` |
| 恢复方式 | 删除目标文件后，从备份包解压回 `/var/lib/jinhu/files` |
| 恢复后下载结果 | 成功，`200`，16 bytes |
| 是否通过 | 通过 |

补充验证：
- 上传允许类型文件成功。
- 删除目标文件后下载返回 `ENOENT`。
- 恢复后再次下载成功。
- API 容器重启后文件仍可下载。
- `docker compose down` 不带 `-v` 后重新启动，文件仍可下载。

## 6. PostgreSQL 备份 / 恢复补验

| 项目 | 结果 |
|---|---|
| 源库 | `jinhu_conditional_go_followup` |
| 目标库 | `jinhu_conditional_go_restore` |
| 备份命令 | `pg_dump -U jinhu -d jinhu_conditional_go_followup -Fc -f /tmp/conditional-go-db.dump` |
| 恢复命令 | `pg_restore -U jinhu -d jinhu_conditional_go_restore /tmp/conditional-go-db.dump` |
| 关键表检查结果 | `sys_tenant`、`sys_user`、`sys_idempotency_request`、`biz_work_order` 均存在且可查询 |
| baseline 或 ready 验证结果 | 恢复库可完成基本查询；未额外挂接 API 做 `/ready` 再验 |
| 是否通过 | 通过 |

补充记录：
- `sys_tenant` 计数正常。
- `sys_user` 中可找到 `conditional_go_admin`。
- `sys_idempotency_request` 计数为 8。
- `biz_work_order` 计数为 2。

## 7. 回滚演练

| 项目 | 结果 |
|---|---|
| 当前 API / Web 镜像版本 | 使用当前隔离 compose 构建出的 `prod` 镜像 |
| 回滚到上一个镜像 tag 的步骤 | 已形成方案，未执行真实 tag 回滚 |
| 回滚后容器启动 | `docker compose down` 后再 `up -d` 成功启动 |
| 回滚后 `/health` | `200` |
| 回滚后 `/ready` | `200` |
| 回滚后登录验证 | 成功 |
| 文件 volume 保持不删除 | 成功，`down` 不带 `-v` 后文件仍可下载 |
| 回滚过程中不执行 `docker compose down -v` | 已遵守 |

结论：
- 本轮完成了“无 `-v` 停服/重启后数据保留”的回滚片段验证。
- 真正的镜像 tag 回滚演练仍建议在预发上线前补做一次。

## 8. 浏览器菜单核验

| 项目 | 结果 |
|---|---|
| 是否人工登录验证 | 未执行浏览器级人工登录 |
| 浏览器访问地址 | `http://127.0.0.1:3302/login`（已确认页面可达） |
| 登录账号类型 | `conditional_go_admin` 超级管理员 |
| 是否发现非首发菜单 | 未通过浏览器核验确认 |
| 截图是否留存 | 无 |
| 是否通过 | 未执行 |

静态 / 运行态替代核验：
- 前端菜单白名单已在代码层生效。
- `/auth/me` 返回的 `menu_tree` 中仍包含后端完整菜单树，说明浏览器级白名单过滤仍依赖前端菜单过滤逻辑。
- 这项建议在预发环境由人工浏览器再补一次。

## 9. 核心业务流程演练

### 系统管理

| 用例 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---|
| 用户 | 通过 | 否 | `POST /users` 幂等重放已验证 |
| 角色 | 未执行完整演练 | 否 | 当前以登录用户权限和静态页面可达性为主 |
| 权限 | 未执行完整演练 | 否 | 由基线和页面可达性间接覆盖 |
| 组织 | 未执行完整演练 | 否 | 建议预发人工逐项核对 |
| 字典 | 通过 | 否 | 初始化闭环、字典存在性与工单/合同字典验证已覆盖 |

### 资产管理

| 用例 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---|
| 园区 | 通过 | 否 | 初始化基线与验收库验证已覆盖 |
| 楼栋 | 通过 | 否 | 验收库中已创建并可用于后续业务 |
| 楼层 | 通过 | 否 | 验收库中已创建并可用于后续业务 |
| 房源 / 单元 | 通过 | 否 | 验收库中已创建并可用于后续业务 |
| 状态看板 / 统计 | 未执行完整演练 | 否 | 建议预发人工补验 |

### 招商租赁

| 用例 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---|
| 租户企业 | 通过 | 否 | 已创建 `CGT-0001` |
| 合同 | 通过 | 否 | 创建、submit、approve、archive、effective 已验证 |
| 应收 | 通过 | 否 | `generate-receivables` 已验证 |
| 收款 | 通过 | 否 | `POST /leasing/payments` 幂等重放已验证 |

### 工单管理

| 用例 | 结果 | 是否阻断 | 备注 |
|---|---|---:|---|
| 工单创建 | 通过 | 否 | `POST /work-orders` 幂等重放已验证 |
| 工单列表 | 未执行完整演练 | 否 | 建议预发人工逐项核对 |
| 工单看板 | 未执行完整演练 | 否 | 建议预发人工逐项核对 |
| SLA | 未执行完整演练 | 否 | 建议预发人工逐项核对 |
| 超时工单 | 未执行完整演练 | 否 | 建议预发人工逐项核对 |
| 工单统计 | 未执行完整演练 | 否 | 建议预发人工逐项核对 |

## 10. verify-api-login 脚本问题分析

### 1) 脚本在哪里调用 bcrypt
在 `scripts/verify-api-login-dockerexec.sh` 的 `generate_password_hash()` 中，脚本通过：

- `const bcrypt = require("bcrypt");`

来为 bootstrap admin 生成登录密码哈希。

### 2) 当前 API 镜像里为什么缺少 bcrypt
在当前隔离镜像内，直接执行 `require("bcrypt")` 会报：

- `Error: Cannot find module 'bcrypt'`

说明验证脚本运行时的容器环境与脚本假设的 Node 模块可用性不一致。  
值得注意的是，API 本身的登录链路已经通过直接 HTTP 调用验证成功，因此这个问题更像是**验证脚本依赖问题**，不是产品认证主流程故障。

### 3) 这个问题是否影响产品运行
当前判断：
- 不影响产品认证主流程运行。
- 会影响把 `scripts/verify-api-login-dockerexec.sh` 作为“正式自动验收入口”的可靠性。

### 4) 直接 API 验证是否已经覆盖同等认证链路
是，已通过直接 API 调用验证：
- `/auth/login` 成功
- `/auth/me` 成功
- 错误密码失败
- 短信 mock 禁用
- 微信 mock callback 禁用

### 5) 是否建议单独开修复 PR
建议单独开修复 PR。

理由：
- 该脚本仍是 pre-release / release-smoke 的重要验证入口之一。
- 需要统一脚本运行环境和依赖来源，避免后续验收流程出现“脚本本身不可执行”的问题。

## 11. 阻断问题

无产品级阻断问题。

## 12. 非阻断问题

| 编号 | 问题 | 严重级别 | 备注 |
|---|---|---|---|
| NBI-1 | `verify-api-login-dockerexec.sh` 在当前镜像内缺少 `bcrypt` 模块 | 中 | 不影响直接 API 验证，但建议单独修复脚本依赖 |
| NBI-2 | 浏览器级首发菜单可视化核验未执行 | 中 | 建议在预发环境人工登录补验 |
| NBI-3 | 核心业务流程全量演练未覆盖完全部菜单项 | 中 | 当前以关键链路和部分菜单静态 / API 验证替代 |
| NBI-4 | 完整镜像 tag 回滚演练未执行 | 中 | 已验证 down/up 不带 `-v` 的持久化特性，仍建议上线前补做真实回滚 |

## 13. 最终 Go / No-Go 建议

建议：Conditional Go

条件：
- 补做浏览器级首发菜单可视化核验。
- 补做核心业务流程的菜单级完整演练。
- 补做一次真实镜像 tag 回滚演练。
- 如 `scripts/verify-api-login-dockerexec.sh` 仍作为正式验收入口，建议单独修复其 `bcrypt` 依赖可用性。

说明：
- 现有 P0 / P1 关键闭环已基本完整。
- 但是这轮仍保留了几项上线前补验项，因此不建议直接从 Conditional Go 升为 Go。

## 14. 后续动作

- 完成预发环境浏览器级菜单核验。
- 完成首发核心业务流程逐项验收。
- 完成一次真实镜像 tag 回滚演练。
- 评估并修复 `verify-api-login-dockerexec.sh` 的依赖可用性。
- 若上述补验完成且无新增问题，再考虑将当前状态从 Conditional Go 升级为 Go。

## 15. 最终 Go 验证入口

- [Final Go 验证报告](/home/veich/JinhuProjects/SmartPark/jinhu-smart-park/docs/release/pre-release-final-go-validation.md)
- 如果三项最后补验都已完成，请以该报告作为最终 Go / No-Go 判定依据。
