# 2026-07-06 上线前全量彩排报告

## 结论

当前判定：`READY_FOR_MONDAY_GO_LIVE_REHEARSAL_PASS`

截至 `2026-07-04`，本地生产口 `http://127.0.0.1:4330` 已完成：

1. P0 权限与字典检查
2. 上线静态 readiness 检查
3. 全员登录 / 菜单 / API 读取检查
4. 角色业务闭环 UAT
5. 全员真实浏览器页面渲染彩排

以上五项全部通过。

## 已执行命令

```bash
pnpm go-live:p0-check
pnpm go-live:check
pnpm go-live:uat-all
pnpm go-live:uat-role-flow
pnpm go-live:uat-browser
```

## 结果总览

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| `go-live:p0-check` | PASS | 6 个关键真实岗位用户、12 个字典、6 个迁移、14 个关键路由全部通过 |
| `go-live:check` | PASS | 路由、菜单、迁移、角色包、权限包、终端入口全部通过 |
| `go-live:uat-all` | PASS | 7 个启用账号全部通过登录、菜单、API 读取、页面路由基础检查 |
| `go-live:uat-role-flow` | PASS | 工程项目 -> 日报 -> 巡检 -> 整改 -> 验收 -> 财务只读闭环通过 |
| `go-live:uat-browser` | PASS | 7 个角色共 225 个页面真实浏览器渲染通过 |

## 角色浏览器彩排结果

| 用户 | 角色 | 页面数 | 结果 |
| --- | --- | ---: | --- |
| admin | SUPER_ADMIN | 91 | PASS |
| 陈国辉 | SAFETY_MANAGER, PROPERTY_MANAGER | 34 | PASS |
| 李荣杰 | SAFETY_MANAGER, PROPERTY_MANAGER, IOT_MANAGER | 43 | PASS |
| 刘汉涛 | FINANCE_MANAGER | 10 | PASS |
| 邵明洪 | PROPERTY_STAFF, MAINTENANCE_ENGINEER | 14 | PASS |
| 宋乾昌 | INVEST_MANAGER | 14 | PASS |
| 郑子勇 | MAINTENANCE_ENGINEER, IOT_OPERATOR | 19 | PASS |

浏览器彩排没有出现：

1. 登录重定向回 `/login`
2. `403` 无权限页
3. 白屏或近乎空白页
4. Next.js 运行时错误页
5. 控制台运行时异常导致的硬失败

## 业务闭环彩排结果

工程链条已验证：

1. 创建工程项目
2. 提交立项
3. 工程负责人审批
4. 进入计划 / 执行
5. 创建并审核施工日报
6. 创建并提交巡检
7. 生成问题
8. 生成整改任务
9. 整改提交
10. 复查通过并关闭
11. 回到巡检
12. 发起验收
13. 上传验收附件
14. 回读验收 `attachment_ids`
15. 验收审核关闭
16. 项目进入 `ACCEPTED`

同时还验证了：

1. 工程消息正确进入 `workflow/inbox`
2. 消息可标记已读
3. `read_at` 会真实回写

## 当前仍建议继续补强的点

这些不再是 P0 阻断，但对上线体验有价值：

1. 手机端首页继续按角色收紧展示，减少“列表堆叠感”
2. 工程移动终端增加更直接的日报 / 巡检 / 整改入口
3. 把上线当天值守流程固化到角色手册中执行
4. 对移动端抽屉、上传、提交成功反馈继续做真机巡检

## 配套文档

1. 角色操作与培训：`docs/release/GO_LIVE_2026_07_06_ROLE_OPERATIONS_PLAYBOOK.md`
2. 上线加固与权限计划：`docs/release/GO_LIVE_2026_07_06_PRODUCTION_HARDENING.md`
3. 角色业务闭环 UAT：`docs/uat/go-live-role-flow-uat.md`
4. 浏览器级页面 UAT：`docs/uat/go-live-browser-uat.md`
