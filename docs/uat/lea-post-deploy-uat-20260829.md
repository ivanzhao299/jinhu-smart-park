# LEA 上线后全链路 UAT — 2026-08-29

## 结论

LEA-001/002/003/004 上线后复测 **PASS**。基线为包含 LEA-004 的 `main@c806ce38896d`；对应 CI `33253628779` 与 Deploy Production `33253628787` 均为 SUCCESS。LEA-004 自身部署 run `33252944272` 亦为 SUCCESS。

本轮未连接生产数据库或写生产业务数据。全部业务写验证在 disposable PostgreSQL/API 中通过真实 API 完成；浏览器使用独立 Windows Chrome profile。凭据、令牌、身份号码和文件内容均未写入报告或仓库。

## 隔离与证据

- 主业务 run：`lea-uat-20260829-01`，数据库 `jinhu_property_api_e2e_lea_20260829_01`，端口 Web/API/DB/CDP 为 `13000/13001/15432/19222`。
- Network 补证 run：`lea-uat-20260829-01b`，fresh volume、同一迁移/生产种子/管理员基线，只执行只读浏览器检查。
- local-only evidence：`/tmp/lea-uat-20260829-01/`；`evidence-SHA256SUMS` 冻结日志、JSON、截图与 DB 摘要。截图和运行凭据不入库。
- 两轮均在 teardown 后确认 compose containers/volumes/networks 为 `0/0/0`，四个声明端口全部 FREE。

## Mode × 用途矩阵

| 场景 | 动态证据 | 结果 |
| --- | --- | --- |
| 办公用途 10 → 长租 | 真实 API 新建办公房源；模式切换审批 executed；`/housing/unit-candidates?usage_type=10` 返回 `rental_segment=office, eligible=true` | PASS |
| 办公 → 民宿 | `POST /property/units/:id/mode-transitions` 请求 `short_stay` 返回 409，消息 `Unit usage is not allowed for target operating mode` | PASS |
| 办公 → 长租租约 → active | 指定办公候选运行 Housing real API；租约创建、审批、签署、activate 全部 PASS，随后完成完整账务/交割/checkout 链 | PASS |
| 住宅 → 长租 | 主 Property API gate 选择住宅 long-rent 候选，完成 tenant-to-checkout 全链 | PASS |
| 住宅 → 民宿 | 主 Property API gate 完成预订、取消、no-show、check-in、check-out、清扫与财务链 | PASS |

Picker facet 同时返回用途 `10..70`，其中 10 派生 `office`、70 派生 `residential`；住房与民宿候选各自受配置模式过滤。办公切换民宿的服务端拒绝原因同时构成 UI 控制面可展示的稳定原因文本。

## 改名、权限与浏览器

- `/users/me` 菜单投影返回 `长租经营`；租户权限表中 `housing_rental` 及 32 个住房页面/动作显示名全部收敛为 `长租*`，code 未改变。
- Windows Chrome 以 390×844 请求 17 个住房/民宿菜单页面：17/17 PASS、17 张截图、无 console warning、无横向溢出。
- Network manifest 共记录 137 个 `/api/v1` response，全部 HTTP 200；每条包含页面、资源类型、脱敏 path 与 status。
- `长租经营工作台` 页面目检显示“住宅长租、办公长租”；实际 viewport width 与 document width 均无超宽。
- 无住房权限的独立审批账号直接访问 `/housing/dashboard`：真实 Chrome 显示 403 与“当前账号没有访问该页面的权限”，390px 截图 PASS。

## Rental status 与双写审计

主 gate 在测试前相关状态日志为 0；完成后：

| 来源 | 状态日志 | 业务审计 |
| --- | --- | --- |
| 民宿 booking | check-in `10→30`；check-out `30→10` | action snapshot 分别记录 changed `10→30`、changed `30→10`；未占用的 cancel/no-show 记录 unchanged `10→10` |
| 住宅长租 lease | activate `10→30`；checkout `30→10` | checkout effect audit 记录 projection changed `30→10` |
| 办公长租 lease | activate `10→30`；checkout `30→10` | checkout effect audit 记录 projection changed `30→10` |

全部投影记录带 `housing_lease:<id>:occupy/release` 或 `homestay_booking:<id>:occupy/release` 原因；生命周期 API 与状态日志由同一真实业务事务产生。强冲突优先级、锁顺序与双写原子性由 LEA-004 PostgreSQL/服务单测及已通过的 Release Smoke 覆盖，本轮没有用 DB 写入模拟业务状态。

## G1–G7 防回退抽查

| Gate | 本轮证据 | 结果 |
| --- | --- | --- |
| G1 permission→menu | API property menu/access contracts 45 项集合 + Web menu 12/12 | PASS |
| G2 module dependency | SaaS property dependency contract | PASS |
| G3 metadata drift/orphan | property menu metadata、manifest 与 orphan fail-closed contracts | PASS |
| G4 canonical/legacy landing | Web menu 12/12 + auth-routing 57/57 | PASS |
| G5 authorization refresh/403 | auth-routing 57/57 + 当前 Chrome 403 | PASS |
| G6 scope convergence | 当前 `/users/me`、菜单与 17 页 Network 均在唯一 tenant/park；同日完整 park-switch 权威报告仍为 `psw-uat-retest-uat-20260829-061634.md` | PASS（抽查） |
| G7 property/security | 当前 Property API gate Homestay + Housing PASS；额外办公 Housing 全链 PASS | PASS |

API targeted contracts 45/45、Web menu 12/12、auth-routing 57/57 PASS。主 Property API gate 退出码 0；额外办公 Housing real API 退出码 0。

## 仓库校验

- `pnpm lint`：PASS。
- `pnpm typecheck`：PASS。
- `node --test scripts/e2e/lea-post-deploy-uat.contract.mjs`：3/3 PASS。
- API targeted contracts：45/45 PASS；Web menu：12/12 PASS；auth-routing：57/57 PASS。
- `pnpm test`：未通过环境预检；在 disposable teardown 后，首个 S1 smoke 无法连接其默认 `127.0.0.1:3001` API，未进入业务断言。本轮相关真实 API 与 targeted gates 已在上文列明；此项不记为 PASS。

## Harness 修正与失败历史

- 浏览器脚本新增单用户环境输入、外部 CDP、direct path、预期 403、mobile path、截图与 Network manifest；修复 login 页面异步清理与 session 注入的竞态。
- Housing E2E 的“通用 occupancy 必须 403”断言仅适用于住宅用途 70；办公用途 10 不受该住宅专属边界约束。套件现显式记录办公分支并继续住房租约链。
- 首次办公重跑使用相同 run-id 命中 idempotency payload conflict；换用新 run-id 后通过。失败日志保留，不作为 PASS authority。
- 首轮浏览器报告实时采集但未持久化每页 Network；补证 run 在修正 JSON 结构后得到 17 页、137 条全 200 Network authority。

## 清理与残余风险

- 两轮 disposable volumes 均整体销毁；不可变 approval/audit 数据未逐行删除或绕过。
- 专用 Chrome 通过其 CDP `Browser.close` 关闭；Web 仅在 PID、PGID 与日志 FD 核验后终止进程组。
- 未执行生产写入式 UAT；生产健康由已完成的 CI/Deploy workflow 证明。
- 报告只提交 harness、测试边界与脱敏结论；local-only 截图/Network 原始 JSON 不入库。
