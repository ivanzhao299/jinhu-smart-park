# HCD 中文名称显示最终 UAT（2026-09-02）

## 结论

**CLOSED WITH GRADED EVIDENCE / 浏览器基线移交。** PR1 #536、PR2 #537、PR3 #538 均已合入，PR 与 main 门禁为绿色；静态成熟门禁和 HCD 定向测试通过。最终深水轮 `hcd-20260902-r4-final` 已用产品 API 解开住房 Party/租约 fixture 约束，并真实完成住房、民宿 API 主链与防回退断言；本地证据保存在 ignored `artifacts/`。浏览器基建第二次尝试到达真实 UI 登录表单，但未建立认证 session，27 路由均未开始；遵守同题最多两次后停止。因此历史 22 路由仍仅为 `SURFACE_ONLY`，不声明任何浏览器 HCD Case PASS，更不声明全部 30 项 PASS。经用户批准，本轮按上述证据等级诚实收口并归档四个 HCD Trellis 任务，未完成的真实浏览器面移交为独立验证基线重建工作；“归档”不代表将 `BLOCKED` 或 `UNVERIFIED` 升级为 `PASS`。

## 已完成交付

- PR1 #536：shared 封闭枚举、Web presentation 与 A/C 类接线，merge commit `422af8fa`。
- PR2 #537：四项授权名称投影、权限裁剪/null 回退与 picker 按 ID 恢复，merge commit `c9177120`。
- PR3 #538：六组 D 类临时定名、开放字典优先策略与收尾接线，merge commit `599fb765`。
- PR #539：保存首次浏览器 UAT 阻塞报告，merge commit `b26148ba`。
- PR #540：保存重启轮 `SURFACE_ONLY` 浏览器观察与基建根因记录，merge commit `782630d1`。
- 上述 PR 的 required checks、合并后的 main CI 与自动部署均成功；未对生产执行直接操作。

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

- 19 个列表/工作台入口桌面 19/19、390px 19/19 仅 `SURFACE_ONLY`：证明当时可达、空态、CSS viewport 与 runner 所覆盖的通用渲染检查，不证明行级 HCD 数据。
- 民宿订单、入住、周转 3 个具名详情路由桌面 3/3、390px 3/3 也仅记 `SURFACE_ONLY`：截图可观察到中文状态、名称投影与长中文，但 runner 未执行 route-specific DOM 断言或交互，不能记成熟 Case PASS。
- 共生成 44 张截图；runner 未记录 console/runtime error、390px CSS viewport mismatch、横向溢出，以及其所跟踪的 same-origin API 请求失败。runner 不跟踪全部 document/JS/CSS/image/off-prefix 请求，因此不作“全量 Network 零错误”结论。
- 人工查看全部截图，并对订单详情作内容观察：可见“已确认”中文状态、长中文房源名称自动换行，未挤压“刷新”等主操作；这仍是观察证据，不替代 DOM/交互断言。
- 运行时本地证据根为 `/tmp/jinhu-hcd-uat-20260902-r3/`，曾生成 `evidence-SHA256SUMS` 与 `metadata-SHA256SUMS`；遵循本轮 `/tmp` 与 teardown 约束，证据根已在 teardown 删除，现不可复核。未复制到 `artifacts/`，这是证据留存缺口，截图未入库。

### 重启轮元数据

| 项目 | 值 |
|---|---|
| 被测 commit / 执行者 / 时间 | `main@b26148ba` / Codex / 2026-09-02 20:59–21:22（Asia/Singapore） |
| RUN_ID / compose project | `hcd-20260902-r3` / `jinhu-hcd-uat-20260902-r3` |
| Chrome / 自动化 | Chrome for Testing `151.0.7922.34`；MCP `N/A`，使用仓库 `scripts/go-live-browser-uat-check.mjs`（被测 commit `b26148ba`）直连 raw CDP protocol `1.3` / `127.0.0.1:47151` |
| viewport | desktop `1440×960@1`；mobile `390×844@3`，runner 实测 CSS viewport `390`；未采集 `navigator.maxTouchPoints` 与 fine/coarse pointer，故 390px 仅宽度观察，不构成完整移动设备能力证据 |
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
| H01 | `/homestay/bookings/f200…0004` | `details-desktop/...-1440-homestay-bookings-f2000000-0000-4000-8000-000000000004.png` / `details-mobile/...-390-homestay-bookings-f2000000-0000-4000-8000-000000000004.png` | SURFACE_ONLY |
| H02 | `/homestay/stays/f200…0004` | `details-desktop/...-1440-homestay-stays-f2000000-0000-4000-8000-000000000004.png` / `details-mobile/...-390-homestay-stays-f2000000-0000-4000-8000-000000000004.png` | SURFACE_ONLY |
| H03 | `/homestay/turnovers/f200…0007` | `details-desktop/...-1440-homestay-turnovers-f2000000-0000-4000-8000-000000000007.png` / `details-mobile/...-390-homestay-turnovers-f2000000-0000-4000-8000-000000000007.png` | SURFACE_ONLY |

隐私门禁（teardown 前完成）：逐图人工复核全部 44 张截图，未发现密码、JWT、Cookie、Authorization、连接串、真实个人敏感数据或签名 URL；文件名只含临时账号名、viewport 和测试路由。对全部 JSON/text/log 执行敏感关键词扫描，命中的 4 行仅为 migration/baseline 的字段或配置名称，不含秘密值；runner 报告未保存请求头或 token。证据不入库且现已删除。

住房详情 fixture 尝试两次，均由数据库约束安全回滚：第一次被 canonical park 保护触发器拒绝，第二次被新版 Party 身份加密元数据约束拒绝。遵守同题最多两次，停止继续改造 SQL fixture。最终完成运行资源 teardown：本轮 compose 容器、volume、network 和 DB/API/Web/CDP 端口均为零；专用 profile、临时文件根、临时运行库与 compose 文件已删除。未操作生产、HR、`phoenix-v3-db`、他人容器或主 Chrome。但本轮未冻结 touched-table 清单、未记录 fixture-scope 前后计数/删除谓词/immutable-trigger 分类；删除隔离 volume 不能替代该证据，故成熟基建的 fixture residual gate 记 `UNVERIFIED`，不称“精确清理”。

标准浏览器 Case 偏差：runner 通过 API 获取 token 后注入浏览器存储，绕过真实 UI 登录、refresh cookie 与 session isolation；未记录 Web 请求重写的实际 API target，也未用 UI 创建含 RUN_ID 的 fixture 并从同一数据库反查。因此 isolated compose/readiness 虽通过，浏览器到该 isolated API/DB 的反串线三联证据仍为 `UNVERIFIED`。这些偏差共同使 22 个路由只能保留为 `SURFACE_ONLY`。

因此以下项目仍无完整真实浏览器证据：22 个已观察路由的 route-specific HCD DOM/交互断言；19 个入口的行级 HCD 数据；住房租约/交割/报修/采购详情与 Party 兼容详情 5 个路由的具名数据；picker 刷新/返回后的真实交互回显；窄权限账号下名称不泄漏及中文占位；未知值实际页面兜底；民宿与长租主链的真实状态迁移防回退。长中文仅在民宿详情取得截图观察；runner 的受限 Network/console 门禁不能外推到完整资源流、剩余数据态与交互。代码/contract 测试覆盖不能替代这些视觉与交互断言。

## 最终深水轮（`hcd-20260902-r4-final`）

### 已解阻

- 被测基线：`origin/main@782630d1`；隔离 PostgreSQL 使用唯一 compose project `jinhu-hcd-uat-hcd-20260902-r4-final` 与 loopback `35434`，API/Web 为 `3283/3284`。
- 282 个 migration、production-safe seed、bootstrap admin、严格 initialization baseline、API `/api/v1/ready` 与 Web `/login`：PASS。
- 住房 fixture 不创建或改写 canonical park。审批账号和基础 long-rent/short-stay 单元沿用 disposable Property API gate 的受控 SQL 基础 fixture；Party、身份加密字段、租约及其后续实体全部由产品 API 创建。
- `scripts/e2e/housing-rental-api-e2e.mjs`：PASS。具名 lease、Party、move-in/move-out handover、repair/work order、purchase 均已落库；长租链真实完成 `draft → pending_approval → signed → active → terminated`，终态下 ledger/occupant/charge-plan 写入均被拒绝，防回退 PASS。
- `scripts/e2e/homestay-api-e2e.mjs`：PASS。具名 booking/stay/turnover 数据已落库；订单完成退房、财务登记、周转 start/exception/complete 与终态可读断言 PASS。
- DB 只读反查将 RUN_ID 对应的 Party、lease、handover、purchase、booking、turnover 关联保存于 `reports/residual-before.txt`。这证明产品 API fixture 与本轮数据库绑定，但不是“UI 创建 → UI 显示 → DB 反查”三联，因为浏览器登录未成功。
- local-only 证据根改为 `artifacts/hcd-uat-hcd-20260902-r4-final/`，保留 logs、reports、临时 compose、SQL 审计输入与 `SHA256SUMS`；未再使用 teardown 后不可复核的 `/tmp` 作为证据权威来源。

### 浏览器结果与诚实分级

1. 第一次 runner 启动在页面访问前因缓存 Chrome 缺少 NSS/NSPR/ALSA 动态库失败。
2. 临时库仅解包到本轮 ignored artifact，未安装系统包；Chrome for Testing `151.0.7922.34` 预检成功。
3. 第二次 runner 使用独立 incognito BrowserContext 到达 `/login`，通过 DOM 查找账号、密码和 submit 控件并点击提交；结果仍停在 `/login`，未出现认证 storage，记 `no_authenticated_session`。
4. 遵守同题最多两次，未作第三次浏览器尝试。`pages_checked=0`、截图 `0`；没有把 API fixture、CDP 可连或登录页冒充 Case PASS。

因此本轮分级如下：

| 范围 | 结论 | 说明 |
|---|---|---|
| 隔离栈/迁移/seed/bootstrap/readiness | PASS | 独占 DB/API 文件卷；严格 baseline 通过 |
| 住房 fixture 新约束适配 | PASS | Party/租约走产品 API，未命中 canonical park 或加密元数据约束 |
| 民宿/住房真实 API 主链与防回退 | PASS（API 层） | 不能替代 UI 状态迁移证据 |
| ignored `artifacts/` 证据留存 | PASS | 47 个本地文件，SHA-256 manifest 已生成 |
| 真实 UI 登录/session isolation | BLOCKED | 表单已提交但 session 未建立；未进入业务页 |
| 全资源 Network/device/rewrite runtime 证据 | BLOCKED | runner 代码已补采集面，但本次未越过登录，不能记运行 PASS |
| 27 路由/30 HCD Case | BLOCKED | 本轮 0 个浏览器 Case 开始；历史 22 个仍为 SURFACE_ONLY |
| picker、窄权限、未知值、390px 长中文 | BLOCKED | 无新的真实浏览器交互证据 |
| RUN_ID UI/API/DB 反串线三联 | BLOCKED | API→DB 已证实，缺 UI 创建/展示一联 |
| touched-table/residual gate | UNVERIFIED | 运行前未冻结全表 before 计数，不能用事后统计补写为已冻结 |

### residual、隐私与 teardown

- `reports/residual-before.txt` 保存本轮 RUN_ID 业务关联、`pg_stat_user_tables` 触达统计及 immutable trigger 分类；但因全表清单不是在写入前冻结，residual gate 诚实记 `UNVERIFIED`。
- teardown 使用与启动完全相同的 project/compose/env，删除本轮 API/PostgreSQL 容器、两个独占 volume、network 与本地 API image；project label 下容器/volume/network 均为 0，`35434/3283/3284` 均无监听。没有操作 `phoenix-v3-db`、其他退出容器、生产或主 Chrome。
- 含密码/密钥的 ignored `run.env` 已在 teardown 后精确删除。截图目录为空；文本关键词扫描唯一命中 `compose.yml` 的环境变量名，不含值。日志和报告未保存 Authorization、JWT、Cookie 或连接串。

### 当前解阻条件

- 在新的同题计数下定位 UI 表单提交未触发认证请求的原因，先以单路由最小 Case 证明：真实表单输入 → `/auth/login` Network 2xx → `/users/me` → 页面身份 → logout → 新 BrowserContext storage/cookie 隔离。
- 运行前冻结完整 touched-table 清单和 fixture 精确谓词/before 计数；区分可删业务表与 immutable trigger 表，再开始业务写入。
- 登录基线通过后才执行 27 路由 route-specific DOM/交互矩阵、19 入口行级数据、住房 5 详情、picker refresh/back、窄权限、未知值、双主链 UI 状态与两模块 390px 长中文；逐 Case 保存全资源 Network、设备能力和截图。

### 浏览器验证基线移交清单

- 首个门禁只验证一个最小页面：真实 UI 表单输入、`/auth/login` 2xx、`/users/me`、页面身份、logout，以及新 BrowserContext 无 storage/cookie 串线；未通过前不展开 27 路由。
- runner 必须保留独立 BrowserContext，不再通过 API token 直接注入 Web storage；登录失败报告须包含脱敏 Network 事实与页面状态，不能只给超时标签。
- fixture 写入前冻结 touched-table 清单、精确 RUN_ID 谓词与 before 计数；区分可清理业务表和 immutable trigger/audit 表，teardown 后输出独立 gate verdict。
- 登录门禁通过后按 27 路由执行 route-specific DOM/交互矩阵，覆盖 19 个入口行级数据、3 个民宿具名详情、5 个住房具名详情、picker refresh/back、窄权限、未知值和双主链 UI 状态。
- desktop 与 390px 均保存逐 Case 截图、完整 HTTP(S) Network、console/runtime、设备能力与 rewrite target；390px 宽度模拟不能单独冒充移动设备能力 PASS。
- 每个含 RUN_ID 的 UI fixture 都需完成 UI 创建/显示、同源 API 读取、同一 disposable DB 反查三联；证据进入可复核的脱敏 artifact manifest，敏感 env 精确删除。
- 后续任务沿用本报告的 `PASS / SURFACE_ONLY / BLOCKED / UNVERIFIED` 分级，不得用静态、API 或截图观察替代真实浏览器 Case PASS。

## D 类临时定名（待产品确认）

- 民宿住客核验：未核验、已核验、已驳回；凭证：已发放、已回收、已遗失、已作废。
- 民宿审计动作：创建订单、确认订单、登记未到店、取消订单、订单改期、办理入住、办理退房；未知值为“未知订单操作”。
- Party：核验为未核验/已核验/已驳回；同意为待确认/已同意/已撤回；同意事实为待补证据/已取得同意/已撤回同意/不适用；来源为经操作员记录/历史来源未知。
- Party 角色/来源：`tenant` 为“租客”，`housing_lease` 为“长租租约”；其他未知值使用中文通用兜底。
- 住房费用：租金、押金、能耗费、退租结算费、退租扣款、采购补收；支付方式：银行转账、现金、微信、支付宝、POS、其他。租户 `/dict-items` 配置优先于平台临时名。
- Identity/通知/事件/retention：集中中文状态、事件与保留动作目录；retention 当前没有 Web 页面，未虚构页面验收。

## 历史重启轮解阻条件

Chrome/CDP 已解阻。后续独立浏览器基线任务应按上方移交清单重建真实 UI 登录/session isolation、全资源 Network、设备能力、rewrite target、RUN_ID UI/API/DB 三联以及 residual gate。四个 HCD Trellis 任务在本轮按分级证据归档；后续验证结果须更新新的任务与本报告，不得回写或改称本轮已取得浏览器 PASS。
