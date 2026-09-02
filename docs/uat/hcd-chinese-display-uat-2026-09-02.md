# HCD 中文名称显示最终 UAT（2026-09-02）

## 结论

**PARTIAL / BLOCKED，不归档。** PR1 #536、PR2 #537、PR3 #538 均已合入，PR 与 main 门禁为绿色；静态成熟门禁和 HCD 定向测试通过。2026-09-02 重启轮已通过专用 Linux Chrome 的 CDP 预检：3 个具名民宿详情路由完成 HCD 数据双视口 PASS，另有 19 个入口仅完成空态 surface-only 双视口检查。剩余住房具名数据、picker 真实交互、窄权限账号、未知值 fixture 和两条业务主链未形成完整浏览器证据，因此不声明全部 30 项 HCD PASS。

## 已完成交付

- PR1 #536：shared 封闭枚举、Web presentation 与 A/C 类接线，merge commit `422af8fa`。
- PR2 #537：四项授权名称投影、权限裁剪/null 回退与 picker 按 ID 恢复，merge commit `c9177120`。
- PR3 #538：六组 D 类临时定名、开放字典优先策略与收尾接线，merge commit `599fb765`。
- 三个 PR 的 required checks、合并后的 main CI 与自动部署均成功；未对生产执行直接操作。

## 成熟门禁

2026-09-02 在 `main@599fb765` 执行：

- `pnpm lint`：PASS。
- `pnpm typecheck`：PASS。
- `pnpm build`：PASS（191/191 静态页面生成）。
- `pnpm --filter @jinhu/shared test`：36/36 PASS。
- `pnpm --filter @jinhu/web test:unit:homestay`：18/18 PASS。
- `pnpm --filter @jinhu/web test:unit:housing`：33/33 PASS。
- `pnpm --filter @jinhu/web test:unit:property`：33/33 PASS。
- PR3 与 main Release Smoke：PASS；其 disposable PostgreSQL/API/文件卷门禁包含民宿与长租 Property API 聚合回归。

未运行 `pnpm test:unit:web`，因为该聚合命令包含 HR 测试，超出本任务硬边界；改为只运行本任务相关的三个 Web suite。

## 隔离全栈与浏览器重启轮

此前两次有效初始化均使用全新 disposable PostgreSQL、282/282 migration 与 8/8 prerequisite、production-safe seed、临时 bootstrap admin、独占 API/Web、独占文件目录与独立 Chrome profile。两轮均通过 strict baseline、API `/api/v1/ready` 与 Web `/login`，但浏览器 runner 在任何业务路由访问前失败：

1. Windows Chrome 文件可见，但当前 WSL 会话禁用 Windows 互操作，随机 CDP 端口在 15 秒内不可达。
2. 改用本机已有缓存 Linux Chrome-for-Testing，随机 CDP 端口仍在 15 秒内不可达。

用户授权换方法重启后，先单独启动 Chrome for Testing 151，显式补齐其本地运行库、使用全新 `/tmp` profile、`--no-sandbox` 和固定 CDP 端口，并轮询 `/json/version`。预检成功后，runner 通过 `--browser-url` 复用该专用实例，不再自行随机启动 Chrome。该轮使用全新 disposable PostgreSQL，282/282 migration、production-safe seed、bootstrap admin、strict baseline、API `/api/v1/ready` 与 Web `/login` 均通过；首轮 Web 预热因外层 `NODE_ENV=production` 与 `next dev` 冲突返回 500，精确重启本轮 Web 为 development 后恢复，未进入业务 Case 前不记产品失败。

浏览器结果：

- 19 个列表/工作台入口桌面 19/19、390px 19/19 仅 `SURFACE_ONLY`：证明可达、空态、viewport 与通用 Network/console 门禁，不证明行级 HCD 数据。
- 民宿订单、入住、周转 3 个具名详情路由桌面 3/3、390px 3/3 `PASS`，包含中文状态、名称投影与长中文。
- 共 44 张截图；runner 未记录失败 Network、console/runtime error、390px viewport mismatch 或横向溢出。
- 人工抽查订单详情截图确认“已确认”中文状态、长中文房源名称自动换行，未挤压“刷新”等主操作。
- 本地证据（local-only）：`/tmp/jinhu-hcd-uat-20260902-r3/`；截图 manifest 为 `evidence-SHA256SUMS`，报告/日志 manifest 为 `metadata-SHA256SUMS`。截图不入库。

### 重启轮元数据

| 项目 | 值 |
|---|---|
| 被测 commit / 执行者 / 时间 | `main@b26148ba` / Codex / 2026-09-02 20:59–21:22（Asia/Singapore） |
| RUN_ID / compose project | `hcd-20260902-r3` / `jinhu-hcd-uat-20260902-r3` |
| Chrome / CDP | Chrome for Testing `151.0.7922.34` / protocol `1.3` / `127.0.0.1:47151` |
| viewport | desktop `1440×960@1`；mobile `390×844@3`，runner 实测 CSS viewport `390` |
| DB / API / Web | `35433` / `3281` / `3282`；监听 PID `545591` / `546341` |
| 运行日志 | local-only `/tmp/jinhu-hcd-uat-20260902-r3/api.log`、`web-r2.log`、四份 `browser-*.log` / `details-*.log` |
| runner 报告 | `desktop-report.json`、`mobile-report.json`、`details-desktop-report.json`、`details-mobile-report.json` |

### 逐路由证据索引

表中 `D`/`M` 均相对 local-only 证据根目录，`...` 精确展开为共同文件名前缀 `HCD_UAT_20260902_R3_ADMIN`；每个文件的 SHA-256 见 `evidence-SHA256SUMS`。

| Case | 路由 | D / M 截图 | 结论 |
|---|---|---|---|
| S01 | `/homestay`（重定向 dashboard） | `desktop/...-1440-homestay.png` / `mobile/...-390-homestay.png` | SURFACE_ONLY |
| S02 | `/homestay/dashboard` | `desktop/...-1440-homestay-dashboard.png` / `mobile/...-390-homestay-dashboard.png` | SURFACE_ONLY |
| S03 | `/homestay/tasks` | `desktop/...-1440-homestay-tasks.png` / `mobile/...-390-homestay-tasks.png` | SURFACE_ONLY |
| S04 | `/homestay/availability` | `desktop/...-1440-homestay-availability.png` / `mobile/...-390-homestay-availability.png` | SURFACE_ONLY |
| S05 | `/homestay/rates` | `desktop/...-1440-homestay-rates.png` / `mobile/...-390-homestay-rates.png` | SURFACE_ONLY |
| S06 | `/homestay/bookings` | `desktop/...-1440-homestay-bookings.png` / `mobile/...-390-homestay-bookings.png` | SURFACE_ONLY |
| S07 | `/homestay/stays` | `desktop/...-1440-homestay-stays.png` / `mobile/...-390-homestay-stays.png` | SURFACE_ONLY |
| S08 | `/homestay/turnovers` | `desktop/...-1440-homestay-turnovers.png` / `mobile/...-390-homestay-turnovers.png` | SURFACE_ONLY |
| S09 | `/homestay/finance` | `desktop/...-1440-homestay-finance.png` / `mobile/...-390-homestay-finance.png` | SURFACE_ONLY |
| S10 | `/housing`（重定向 dashboard） | `desktop/...-1440-housing.png` / `mobile/...-390-housing.png` | SURFACE_ONLY |
| S11 | `/housing/dashboard` | `desktop/...-1440-housing-dashboard.png` / `mobile/...-390-housing-dashboard.png` | SURFACE_ONLY |
| S12 | `/housing/tasks` | `desktop/...-1440-housing-tasks.png` / `mobile/...-390-housing-tasks.png` | SURFACE_ONLY |
| S13 | `/housing/tenants` | `desktop/...-1440-housing-tenants.png` / `mobile/...-390-housing-tenants.png` | SURFACE_ONLY |
| S14 | `/housing/leases` | `desktop/...-1440-housing-leases.png` / `mobile/...-390-housing-leases.png` | SURFACE_ONLY |
| S15 | `/housing/handovers` | `desktop/...-1440-housing-handovers.png` / `mobile/...-390-housing-handovers.png` | SURFACE_ONLY |
| S16 | `/housing/billing` | `desktop/...-1440-housing-billing.png` / `mobile/...-390-housing-billing.png` | SURFACE_ONLY |
| S17 | `/housing/finance` | `desktop/...-1440-housing-finance.png` / `mobile/...-390-housing-finance.png` | SURFACE_ONLY |
| S18 | `/housing/repairs` | `desktop/...-1440-housing-repairs.png` / `mobile/...-390-housing-repairs.png` | SURFACE_ONLY |
| S19 | `/housing/purchases` | `desktop/...-1440-housing-purchases.png` / `mobile/...-390-housing-purchases.png` | SURFACE_ONLY |
| H01 | `/homestay/bookings/f200…0004` | `details-desktop/...-1440-homestay-bookings-f2000000-0000-4000-8000-000000000004.png` / `details-mobile/...-390-homestay-bookings-f2000000-0000-4000-8000-000000000004.png` | PASS |
| H02 | `/homestay/stays/f200…0004` | `details-desktop/...-1440-homestay-stays-f2000000-0000-4000-8000-000000000004.png` / `details-mobile/...-390-homestay-stays-f2000000-0000-4000-8000-000000000004.png` | PASS |
| H03 | `/homestay/turnovers/f200…0007` | `details-desktop/...-1440-homestay-turnovers-f2000000-0000-4000-8000-000000000007.png` / `details-mobile/...-390-homestay-turnovers-f2000000-0000-4000-8000-000000000007.png` | PASS |

隐私门禁：逐图人工复核全部 44 张截图，未发现密码、JWT、Cookie、Authorization、连接串、真实个人敏感数据或签名 URL；文件名只含临时账号名、viewport 和测试路由。对全部 JSON/text/log 执行敏感关键词扫描，命中的 4 行仅为 migration/baseline 的字段或配置名称，不含秘密值；runner 报告未保存请求头或 token。证据不入库。

住房详情 fixture 尝试两次，均由数据库约束安全回滚：第一次被 canonical park 保护触发器拒绝，第二次被新版 Party 身份加密元数据约束拒绝。遵守同题最多两次，停止继续改造 SQL fixture。最终执行精确 teardown：本轮 compose 容器、volume、network 和 DB/API/Web/CDP 端口均为零；专用 profile、临时文件根、临时运行库与 compose 文件已删除。未操作生产、HR、`phoenix-v3-db`、他人容器或主 Chrome。

因此以下项目仍无完整真实浏览器证据：19 个入口的行级 HCD 数据；住房租约/交割/报修/采购详情与 Party 兼容详情 5 个路由的具名数据；picker 刷新/返回后的真实交互回显；窄权限账号下名称不泄漏及中文占位；未知值实际页面兜底；民宿与长租主链的真实状态迁移防回退。长中文仅在民宿详情取得浏览器证据；已测页面的 runner Network/console 门禁不能外推到剩余数据态与交互。代码/contract 测试覆盖不能替代这些视觉与交互断言。

## D 类临时定名（待产品确认）

- 民宿住客核验：未核验、已核验、已驳回；凭证：已发放、已回收、已遗失、已作废。
- 民宿审计动作：创建订单、确认订单、登记未到店、取消订单、订单改期、办理入住、办理退房；未知值为“未知订单操作”。
- Party：核验为未核验/已核验/已驳回；同意为待确认/已同意/已撤回；同意事实为待补证据/已取得同意/已撤回同意/不适用；来源为经操作员记录/历史来源未知。
- Party 角色/来源：`tenant` 为“租客”，`housing_lease` 为“长租租约”；其他未知值使用中文通用兜底。
- 住房费用：租金、押金、能耗费、退租结算费、退租扣款、采购补收；支付方式：银行转账、现金、微信、支付宝、POS、其他。租户 `/dict-items` 配置优先于平台临时名。
- Identity/通知/事件/retention：集中中文状态、事件与保留动作目录；retention 当前没有 Web 页面，未虚构页面验收。

## 解阻条件

Chrome/CDP 已解阻。下一轮应使用与当前 migration 兼容的 API/UI fixture 链建立民宿与住房列表/详情数据，用独立窄权限账号完成 picker 回显、字段权限裁剪和未知值 fixture，并真实走完民宿与长租主链状态迁移防回退；逐页保存 DOM、截图、Network 与 console 证据。全部通过后再更新本报告、归档 Trellis 任务并提交终报。
