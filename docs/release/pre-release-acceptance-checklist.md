# JinHu Smart Park 预发环境完整验收清单

## 1. 验收目标

本清单用于验证当前 `main` 是否具备进入生产上线准备的条件。

目标不是继续开发新功能，而是基于已经冻结的可验收基线，对预发环境做一轮完整、可执行、可记录、可追溯的验收。

验收结论应回答以下问题：

- 当前预发部署是否完成初始化闭环
- 当前运行态是否健康并可接流量
- 首发认证链路是否可用且危险 mock 已关闭
- 首发菜单、文件存储、幂等能力是否符合既定边界
- 首发核心业务流程是否具备上线准备条件
- 备份、恢复、回滚是否具备最小可执行能力

## 2. 验收范围

本次预发验收必须覆盖以下范围：

- 环境变量
- 初始化闭环
- 健康检查
- 认证链路
- 首发菜单
- 文件存储
- 幂等控制
- 首发核心业务流程
- 备份恢复
- 回滚
- 验收结论

本次预发验收明确不覆盖以下范围：

- 非首发模块
- 对象存储
- IoT / 能耗 / 视频 / 机器人 / 安全管理
- 全量状态流转
- 全量幂等覆盖

## 3. 验收前置条件

执行本清单前，必须确认以下前置条件已满足：

- 使用最新 `main` 构建镜像
- 使用独立预发数据库
- 不使用 dev seed
- 使用 production seed
- 已准备强密码 `bootstrap admin`
- 已准备正式或预发域名
- 已准备文件存储持久化路径
- 已准备数据库和文件备份路径

建议额外记录：

- 当前镜像 tag
- 当前 commit SHA
- 当前预发部署时间
- 当前执行人

## 4. 环境变量验收

| 检查项 | 变量名 | 预期 | 验收方式 | 结果 |
|---|---|---|---|---|
| 运行环境 | `NODE_ENV` | `production` | 查看 `.env.production` 或容器环境 | 待填写 |
| 应用环境 | `APP_ENV` | `pre-release` / `staging` / `production-like`，不得为 `development` | 查看 `.env.production` 或容器环境 | 待填写 |
| 数据库地址 | `POSTGRES_HOST` | 指向独立预发数据库 | 查看 `.env.production`、compose 环境 | 待填写 |
| 数据库端口 | `POSTGRES_PORT` | 与预发 PostgreSQL 一致 | 查看 `.env.production`、compose 环境 | 待填写 |
| 数据库名 | `POSTGRES_DB` | 预发独立库名 | 查看 `.env.production`、compose 环境 | 待填写 |
| 数据库用户 | `POSTGRES_USER` | 预发专用用户 | 查看 `.env.production`、compose 环境 | 待填写 |
| 数据库密码 | `POSTGRES_PASSWORD` | 已设置强密码且未使用默认值 | 人工核对，不在日志中明文输出 | 待填写 |
| JWT 密钥 | `JWT_SECRET` | 已设置长随机值 | 人工核对，不在日志中明文输出 | 待填写 |
| 前端来源 | `WEB_ORIGIN` | 指向预发域名或预发前端地址 | 查看 `.env.production` 与浏览器访问域名 | 待填写 |
| 文件根路径 | `FILE_STORAGE_LOCAL_ROOT` | `/var/lib/jinhu/files` | 查看 `.env.production`、容器环境、compose 挂载 | 待填写 |
| 短信 mock 固定码 | `AUTH_SMS_FIXED_CODE` | 必须为空 | 查看 `.env.production` 或容器环境 | 待填写 |
| 短信 mock 可见性 | `AUTH_SMS_CODE_VISIBLE` | 必须为 `false` | 查看 `.env.production` 或容器环境 | 待填写 |
| 微信 mock 开关 | `AUTH_WECHAT_MOCK_ENABLED` | 必须为 `false` | 查看 `.env.production` 或容器环境 | 待填写 |

## 5. 初始化闭环验收

推荐在独立预发数据库上按以下顺序执行。

### 5.1 migration

- 命令：

```bash
pnpm db:migrate
```

- 预期结果：
  - migration 成功执行
  - 无重复执行异常
  - 数据库结构准备完成
- 实际结果：待填写
- 是否通过：待填写

### 5.2 production seed

- 命令：

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
```

- 预期结果：
  - production seed 成功执行
  - 不引入 dev seed 数据
- 实际结果：待填写
- 是否通过：待填写

### 5.3 check-init-baseline，预期缺 admin 时失败

- 命令：

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

- 预期结果：
  - 返回 `FAIL`
  - 失败原因应指向 `no bootstrap admin found`
  - 不应出现 dev seed contamination
- 实际结果：待填写
- 是否通过：待填写

### 5.4 bootstrap-admin

- 命令：

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin
```

- 预期结果：
  - 首个管理员成功创建
  - 重复执行不应创建重复账号
  - 不应输出明文密码
- 实际结果：待填写
- 是否通过：待填写

### 5.5 check-init-baseline，预期 PASS

- 命令：

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

- 预期结果：
  - 返回 `PASS` 或非阻断 `WARN`
  - 不应再出现 `no bootstrap admin`
- 实际结果：待填写
- 是否通过：待填写

### 5.6 确认无 dev seed 污染

- 验收方式：
  - 查看 `db:check:init` 输出
  - 确认没有 `dev seed contamination detected`
- 预期结果：
  - 无 dev seed 污染
- 实际结果：待填写
- 是否通过：待填写

## 6. 运行态健康检查验收

说明：

- `/health` 是 liveness
- `/ready` 是 readiness
- Docker healthcheck 继续使用 `/health`

| 验收项 | 命令 / 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| API liveness | `curl -i http://<api-host>/api/v1/health` | 返回 `200` | 待填写 | 待填写 |
| API readiness | `curl -i http://<api-host>/api/v1/ready` | 完整初始化后返回 `200` | 待填写 | 待填写 |
| `prod-healthcheck.sh MODE=liveness` | `MODE=liveness bash scripts/prod-healthcheck.sh` | 通过 | 待填写 | 待填写 |
| `prod-healthcheck.sh MODE=readiness` | `MODE=readiness bash scripts/prod-healthcheck.sh` | 通过 | 待填写 | 待填写 |
| `prod-healthcheck.sh MODE=full` | `MODE=full bash scripts/prod-healthcheck.sh` | API liveness + readiness + Web `/login` 全通过 | 待填写 | 待填写 |

如需额外验证 readiness 失败语义，可在隔离环境下分别验证：

- 缺 admin 时 `/ready` 返回 `503`
- 缺 seed 时 `/ready` 返回 `503`

## 7. 认证链路验收

可直接复用：

```bash
bash scripts/verify-api-login-dockerexec.sh
```

重点验收项：

| 验收项 | 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 账号密码登录成功 | 调用 `/auth/login` | 返回 token / 用户上下文 | 待填写 | 待填写 |
| `/auth/me` 成功 | 调用 `/auth/me` | 返回当前登录用户信息 | 待填写 | 待填写 |
| 错误密码失败 | 错误密码登录 | 返回失败，不得放行 | 待填写 | 待填写 |
| 短信验证码登录未启用 | 调用短信登录接口 | 明确返回未启用 | 待填写 | 待填写 |
| 微信 `mock:*` callback 被拒绝 | 调用微信 callback mock code | 明确返回未启用或拒绝 | 待填写 | 待填写 |
| 前端登录页只显示账号密码登录 | 浏览器打开 `/login` | 不显示短信/微信入口 | 待填写 | 待填写 |

## 8. 首发菜单验收

首发应显示菜单：

- 总览
- 系统管理
- 资产管理
- 招商租赁核心项
- 工单管理

应隐藏菜单：

- IoT
- 能耗
- 视频安防
- 机器人
- 安全管理
- 招商线索
- 公海池
- 招商漏斗
- 退款 / 豁免 / 发票等非首发项

说明：

- 菜单隐藏不代表页面代码删除
- 直接访问非首发 URL 第一版保持现状

| 验收项 | 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 首发一级菜单显示正确 | 登录后检查左侧菜单 | 仅显示白名单一级菜单 | 待填写 | 待填写 |
| 首发二级菜单显示正确 | 展开菜单检查 | 仅显示首发白名单二级菜单 | 待填写 | 待填写 |
| 非首发一级菜单隐藏 | 检查 IoT / 能耗 / 视频安防 / 机器人 / 安全管理 | 不显示 | 待填写 | 待填写 |
| 非首发二级菜单隐藏 | 检查招商线索、公海池、招商漏斗、退款、豁免、发票等 | 不显示 | 待填写 | 待填写 |
| 非首发 URL 直接访问 | 手工输入非首发 URL | 保持第一版当前行为 | 待填写 | 待填写 |

## 9. 文件存储验收

必须确认：

- `FILE_STORAGE_LOCAL_ROOT` 指向持久化目录
- 不要执行 `docker compose down -v`

| 用例 | 步骤 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 上传允许类型文件 | 通过前端或 API 上传 PDF / 图片等允许类型文件 | 上传成功 | 待填写 | 待填写 |
| 下载文件成功 | 通过 API 下载上传后的文件 | 下载成功，内容正确 | 待填写 | 待填写 |
| 删除文件成功 | 执行删除操作 | 数据库记录软删除成功 | 待填写 | 待填写 |
| API 容器重启后文件仍可下载 | 重启 API 容器后再次下载 | 文件仍可访问 | 待填写 | 待填写 |
| `docker compose down` 不带 `-v` 后文件仍可下载 | 停服再起服务，不删除 volume | 文件仍可访问 | 待填写 | 待填写 |
| 持久化路径确认 | 检查容器环境、compose 和卷挂载 | 路径为 `/var/lib/jinhu/files`，挂载存在 | 待填写 | 待填写 |
| 运维禁忌确认 | 复核运维说明 | 明确禁止随意执行 `docker compose down -v` | 待填写 | 待填写 |

## 10. 幂等控制验收

首批接口：

- `POST /users`
- `POST /work-orders`
- `POST /leasing/contracts`
- `POST /leasing/contracts/:contractId/generate-receivables`
- `POST /leasing/payments`

每个接口至少验证：

- 同 key 同 body 请求两次，只写入一次
- 第二次返回缓存成功响应
- 同 key 不同 body 返回 `409`
- 幂等表记录为 `succeeded`
- `failed` 后允许重试，如可构造

说明：

- 文件上传不纳入第一版完整幂等
- 状态流转不纳入第一版
- `PATCH / DELETE` 不纳入第一版

| 接口 | 用例 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| `POST /users` | 同 key 同 body 两次 | 仅创建一次，第二次复用成功响应 | 待填写 | 待填写 |
| `POST /users` | 同 key 不同 body | 返回 `409` | 待填写 | 待填写 |
| `POST /work-orders` | 同 key 同 body 两次 | 仅创建一次，第二次复用成功响应 | 待填写 | 待填写 |
| `POST /work-orders` | 同 key 不同 body | 返回 `409` | 待填写 | 待填写 |
| `POST /leasing/contracts` | 同 key 同 body 两次 | 仅创建一次，第二次复用成功响应 | 待填写 | 待填写 |
| `POST /leasing/contracts/:contractId/generate-receivables` | 同 key 同 body 两次 | 仅生成一次，第二次复用成功响应 | 待填写 | 待填写 |
| `POST /leasing/payments` | 同 key 同 body 两次 | 仅创建一次，第二次复用成功响应 | 待填写 | 待填写 |
| 幂等表记录 | 查询 `sys_idempotency_request` | 记录存在且状态正确 | 待填写 | 待填写 |

## 11. 首发核心业务流程验收

### 系统管理

| 用例 | 预期 | 实际 | 是否阻断 |
|---|---|---|---|
| 用户管理基础操作 | 可创建、查询、展示正确 | 待填写 | 待填写 |
| 角色管理基础操作 | 可查询、配置、展示正确 | 待填写 | 待填写 |
| 权限管理基础操作 | 可查询、展示正确 | 待填写 | 待填写 |
| 组织管理基础操作 | 可查询、维护、展示正确 | 待填写 | 待填写 |
| 字典管理基础操作 | 可查询、维护、展示正确 | 待填写 | 待填写 |

### 资产管理

| 用例 | 预期 | 实际 | 是否阻断 |
|---|---|---|---|
| 园区管理 | 可查询、维护、展示正确 | 待填写 | 待填写 |
| 楼栋管理 | 可查询、维护、展示正确 | 待填写 | 待填写 |
| 楼层管理 | 可查询、维护、展示正确 | 待填写 | 待填写 |
| 房源 / 单元管理 | 可查询、维护、展示正确 | 待填写 | 待填写 |
| 状态看板 / 统计 | 可正常展示首发统计视图 | 待填写 | 待填写 |

### 招商租赁

| 用例 | 预期 | 实际 | 是否阻断 |
|---|---|---|---|
| 租户企业档案 | 可查询、创建、维护 | 待填写 | 待填写 |
| 合同管理 | 可创建、查询、展示正确 | 待填写 | 待填写 |
| 应收 | 可生成、查询、展示正确 | 待填写 | 待填写 |
| 收款 | 可登记、查询、展示正确 | 待填写 | 待填写 |

### 工单管理

| 用例 | 预期 | 实际 | 是否阻断 |
|---|---|---|---|
| 工单创建 | 可创建且数据正确 | 待填写 | 待填写 |
| 工单列表 | 可查询和过滤 | 待填写 | 待填写 |
| 工单看板 | 可展示首发看板 | 待填写 | 待填写 |
| SLA | 可查询和维护首发规则 | 待填写 | 待填写 |
| 超时工单 | 可查询和展示 | 待填写 | 待填写 |
| 工单统计 | 可展示首发统计视图 | 待填写 | 待填写 |

## 12. 备份与恢复验收

特别说明：

- 数据库备份和文件备份应尽量在同一时间窗口
- 不要删除 file volume
- 不要随意执行 `down -v`

| 验收项 | 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| PostgreSQL 备份 | 执行预发数据库备份 | 备份成功 | 待填写 | 待填写 |
| 文件目录 / volume 备份 | 备份 `FILE_STORAGE_LOCAL_ROOT` 对应目录或 volume | 备份成功 | 待填写 | 待填写 |
| 恢复数据库 | 从备份恢复到验证环境 | 数据恢复成功 | 待填写 | 待填写 |
| 恢复文件目录 | 恢复文件目录或 volume | 文件恢复成功 | 待填写 | 待填写 |
| 恢复后登录验证 | 抽样验证 `/auth/login`、`/auth/me` | 登录正常 | 待填写 | 待填写 |
| 恢复后文件下载验证 | 抽样下载已上传文件 | 下载正常 | 待填写 | 待填写 |
| 时间窗口记录 | 记录 DB 备份时间与文件备份时间 | 时间窗口明确 | 待填写 | 待填写 |

## 13. 回滚验收

| 验收项 | 方法 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 应用镜像回滚 | 切回上一稳定镜像 | 服务可恢复启动 | 待填写 | 待填写 |
| 配置回滚 | 切回上一稳定配置 | 应用可正常启动 | 待填写 | 待填写 |
| 数据库 migration 回滚策略说明 | 记录回滚策略 | 明确说明当前策略与限制 | 待填写 | 待填写 |
| 文件 volume 保留 | 回滚时不删除文件 volume | 文件不丢失 | 待填写 | 待填写 |
| 回滚后 `/health` | 回滚后检查 health | 返回 `200` | 待填写 | 待填写 |
| 回滚后 `/ready` | 回滚后检查 ready | 返回 `200` | 待填写 | 待填写 |
| 回滚后 login | 回滚后检查登录 | 登录成功 | 待填写 | 待填写 |
| 回滚失败时升级处理 | 明确升级路径 | 有负责人和应急路径 | 待填写 | 待填写 |

说明：

- 当前不建议把 migration 机制作为本阶段的大改目标
- 回滚策略必须结合当前数据库状态、镜像版本和备份情况一起评估

## 14. 验收结论模板

结论模板只允许以下三种：

- 通过
- 带条件通过
- 不通过

必须同时记录：

- 阻断问题
- 非阻断问题
- 待人工确认事项
- 上线建议

建议模板：

```text
验收结论：

- 结果：通过 / 带条件通过 / 不通过
- 阻断问题：
- 非阻断问题：
- 待人工确认事项：
- 上线建议：
```

## 15. 问题记录表

| 编号 | 模块 | 问题描述 | 严重级别 | 是否阻断 | 负责人 | 处理状态 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | 待填写 | 待填写 | P0 / P1 / P2 | 是 / 否 | 待填写 | 待填写 | 待填写 |

## 16. Go / No-Go 判断标准

### Go 条件

- 初始化闭环通过
- `/ready` 通过
- 登录通过
- `release-smoke` 通过
- 文件存储持久化验证通过
- 幂等关键接口验证通过
- 无 P0 阻断问题

### No-Go 条件

- 初始化失败
- `/ready` 失败
- 登录失败
- 认证 mock 被误启用
- 文件上传后不可恢复
- 幂等重复写入
- 数据库 / 文件备份无法完成
- 存在未关闭 P0 阻断问题

## 17. 后续动作

- 预发验收完成后整理验收报告
- 收口生产环境变量真实值
- 编写上线 SOP
- 编写回滚 SOP
- 单独推进 `P1-2 migration` 机制治理
