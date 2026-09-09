# HCD 中文名称显示最终 UAT（2026-09-02）

## 结论

**FINAL ADJUDICATED：23 PASS / 7 FAIL。** 2026-09-09 独立终局任务在 L-04 基线上完成真实键盘登录、27 路由 × desktop/mobile 共 54 个单元、逐页 DOM 与 Network 采集、logout 和新 BrowserContext 隔离，并逐项重新裁定 HCD-001—030。历史四轮与 L-04 记录保留在下文，仅作为基建史，不再决定 Case 状态。7 个未实际触发原定义交互或数据态的 Case 如实记 FAIL 并由 #721 跟踪；不以页面可达、静态测试或 API fixture 冒充浏览器 PASS。

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

## 2026-09-09 终局浏览器裁定

### 执行与证据

- 被测起点为 `origin/main@dcd9a9cf`；bearer header 已存在，但 follow-up probe 会在新 target 的 `about:blank` 上过早判定 ready，导致拿不到 Web origin storage。本任务修正为启用 Page domain 并等待目标进入 Web origin；anonymous audit 同步修正，契约门禁覆盖该行为。
- 隔离栈使用 disposable PostgreSQL（307/307 migration）、production-safe seed、bootstrap admin、产品 API 民宿/住房 fixture、独占 API `3287`、Web `3288` 和专用 Chromium 151/CDP `47159`。未连接主 Chrome、未操作生产或 HR。
- 终局矩阵第二轮到达 27/27 路由、54/54 单元；真实 `/auth/login=200`、登录态 `/users/me=200`、logout 两端点 `200`，新 BrowserContext `/users/me=401`、storage/cookie 均无认证残留。54 个页面均无 runner 所采集的 HTTP(S) 失败、console/runtime error、CSS viewport 偏差或横向 document overflow。
- `M`：ignored `artifacts/hcd-final-20260909/evidence-final-r2/`，54 张截图、逐单元 DOM/Network report；manifest SHA-256 `9d10f6a418f6cfea7f1aa901abfac486a6c5edad5d53634c9e04a2565b639d3e`，55/55 文件重算一致。
- `N`：ignored `artifacts/hcd-final-20260909/evidence-narrow-r2/`，窄权限 desktop/mobile 截图与 DOM/Network；manifest SHA-256 `841dee52d70bf68cc8278aef337f45b23b7310a28da894fe82557a46f77b67a3`，3/3 文件重算一致。产品实际显示中文权限占位且不泄漏相对方名称；执行器词表修正后的 terminal status 遵守两次上限未第三次复跑，因此只把已观察的产品断言记 PASS，不把 runner 旧 FAIL 隐去。
- `F`：ignored `artifacts/hcd-final-20260909/evidence-targeted-fix/`，任务标题中文化与详情长标题断行修复后的 2 路由 × 双视口；manifest SHA-256 `ee177bbabeb9a0108c4517fe964cd8150265f5ef3c3e910624884e4df0f2f01b`，5/5 文件重算一致，runner terminal PASS。
- 隐私门禁逐图复核 54+2+4 张证据截图；可识别字段均来自 disposable synthetic fixture，未出现密码、JWT、Cookie、Authorization、连接串、签名 URL 或真实个人数据。对最终三组 JSON/text 执行敏感模式扫描，无命中。

### 30 Case 裁定矩阵

“证据”中的路由表示 `M` report 内该 Case 的 desktop/mobile 单元及对应 manifest 截图；`F` 为修复后替代证据；`N` 为权限边界补充证据。FAIL 均有 #721，不保留 `BLOCKED`。

| Case | 裁定 | 浏览器证据 / 说明 |
|---|---|---|
| HCD-001 | PASS | `M /homestay/tasks`：任务来源、状态为中文，具名任务；双视口 DOM/Network。 |
| HCD-002 | PASS | `M /homestay/availability`：民宿短租/长租经营与房态中文。 |
| HCD-003 | PASS | `M /homestay/bookings?...` 与具名订单详情：订单状态中文。 |
| HCD-004 | PASS | `M` 周转筛选完整中文；具名周转详情状态“已完成”。 |
| HCD-005 | PASS | `M` 具名订单/入住详情：核验与凭证状态中文。 |
| HCD-006 | FAIL | #721：未在浏览器实际选择退款/减免来源流水，不能裁定 picker 回显。 |
| HCD-007 | PASS | `M` 具名订单/入住详情：流水状态与审计动作无原码直出。 |
| HCD-008 | FAIL | #721：具名周转没有关联工单，工单 picker/status 原定义未实际触发。 |
| HCD-009 | FAIL | #721：高风险操作由 fixture API 完成，浏览器未触发成功提示。 |
| HCD-010 | PASS | `M` 具名订单每日房价显示中文“未知价格来源”，无 `date_override` 原码。 |
| HCD-011 | PASS | `M` 具名订单/入住详情显示 `unitCode / unitName`，不使用固定占位。 |
| HCD-012 | PASS | `M /homestay/bookings?...`：URL 恢复后 picker 回显 `A1 1F / U01`，不是 UUID/加载占位。 |
| HCD-013 | FAIL | #721：未在浏览器触发验证、冲突、权限或网络错误，不能以正常页裁定错误投影。 |
| HCD-014 | PASS | `M` 订单/周转筛选含“未到店”“未完成”等权威中文值。 |
| HCD-015 | PASS | `M /housing/tenants` 与 Party 详情：核验/同意状态中文。 |
| HCD-016 | PASS | `M /housing/leases` 与具名详情/账单：完整租约状态中文。 |
| HCD-017 | FAIL | #721：产品 API 未产生未知 eligibility code；本轮没有可证明“未知阻断原因”的真实浏览器数据态。 |
| HCD-018 | PASS | `M` 具名交割详情与租约内嵌记录：类型、状态中文。 |
| HCD-019 | PASS | `F /housing/tasks`：来源/状态中文；修复后交割标题为“入住/退租”，不再直出 `move_in/move_out`。 |
| HCD-020 | PASS | `M /housing/tasks?status=active`：负责人姓名不可用时显示“未分派”，不回退 UUID。 |
| HCD-021 | PASS | `M` 具名租约/Party 数据使用名称与中文占位，不回退内部 ID；`N` 补充权限边界。 |
| HCD-022 | PASS | `M` 具名租约入住人员角色显示“同住人”。 |
| HCD-023 | PASS | `M` 具名报修详情：状态、优先级、紧急程度中文。 |
| HCD-024 | PASS | `F` 具名采购详情：审批/付款状态中文；desktop/mobile Network 与 DOM PASS，长标题可断行。 |
| HCD-025 | FAIL | #721：账单页未打开费用计划 picker，未实际观察计费来源回显。 |
| HCD-026 | FAIL | #721：财务表单未实际选择费用类型、支付方式和审批目标，不能以列表页裁定 picker。 |
| HCD-027 | PASS | `M` 采购列表/详情显示具名房源 `A1 2F / U01`，不显示 UUID。 |
| HCD-028 | PASS | `M` Party 详情角色/来源/状态/provenance 均为中文；`N` 证明窄权限无名称泄漏且有中文占位。 |
| HCD-029 | PASS | `M /property/approvals`：审批决定与领域执行状态独立显示中文。 |
| HCD-030 | PASS | `M /assets/identity-submissions`：submission 及当前 Web 可见状态中文；未虚构不存在的 retention 页面。 |

### 修复与新增 Issue

- 修正 browser session/anonymous probe 的 Web-origin readiness，保留 bearer Authorization 传递，并补强 query 路由、被 supersede 的 `ERR_ABORTED` Network 处理和中文权限占位识别；`browser-uat-contract` 5/5 PASS。
- 修复长租交割任务标题裸 `move_in/move_out`；API 定向测试 12/12 PASS，`F` 双视口 PASS。
- 共享详情标题增加 `min-width: 0` 与 `overflow-wrap: anywhere`；采购长编号在 390px 从裁切改为断行，定向 contract 2/2、`F` 双视口 PASS。
- #721 保持 OPEN，跟踪 7 个 FAIL Case 所缺的可执行浏览器场景；这些 Case 在完成前不得升级 PASS。
- #722 保持 OPEN：逐图复核额外发现采购详情“成本分类”直出开放值 `repair`。该字段不属于 HCD-024 原定义，故未越界扩写本任务产品定名。

## D 类临时定名（待产品确认）

- 民宿住客核验：未核验、已核验、已驳回；凭证：已发放、已回收、已遗失、已作废。
- 民宿审计动作：创建订单、确认订单、登记未到店、取消订单、订单改期、办理入住、办理退房；未知值为“未知订单操作”。
- Party：核验为未核验/已核验/已驳回；同意为待确认/已同意/已撤回；同意事实为待补证据/已取得同意/已撤回同意/不适用；来源为经操作员记录/历史来源未知。
- Party 角色/来源：`tenant` 为“租客”，`housing_lease` 为“长租租约”；其他未知值使用中文通用兜底。
- 住房费用：租金、押金、能耗费、退租结算费、退租扣款、采购补收；支付方式：银行转账、现金、微信、支付宝、POS、其他。租户 `/dict-items` 配置优先于平台临时名。
- Identity/通知/事件/retention：集中中文状态、事件与保留动作目录；retention 当前没有 Web 页面，未虚构页面验收。

## 历史重启轮解阻条件

Chrome/CDP 已解阻。后续独立浏览器基线任务应按上方移交清单重建真实 UI 登录/session isolation、全资源 Network、设备能力、rewrite target、RUN_ID UI/API/DB 三联以及 residual gate。四个 HCD Trellis 任务在本轮按分级证据归档；后续验证结果须更新新的任务与本报告，不得回写或改称本轮已取得浏览器 PASS。

## L-04 浏览器基线重建（2026-09-09）

- Issue #716 重建通用 CDP 门禁：真实键盘登录必须观察 `/auth/login` 2xx；任意登录后分支都执行真实 logout，并由新 BrowserContext 证明 `/users/me=401` 且无 Web storage 串线。
- `--viewport-matrix` 对每条选定路由执行 1440x960 与 390x844；声明式 `--case-file` 支持同路由多 Case、picker、未知值、详情和预期 403 断言。最终 HCD 命令必须同时使用 `--require-route-count 27 --require-case-count 30`，重复 ID、模板详情路径、过滤或截断均 fail closed。
- artifact 写入 mode 0600 的截图、脱敏 JSON report 与 SHA-256 manifest；仅完整 Case、双 viewport 与 session isolation 全通过时，`hcd_evidence_grade` 才为 `PASS`。
- 非 HR 自动门禁 `pnpm test:e2e:browser-uat-contract` 已接入 CI；本地该契约 4/4、shared HCD 4/4、housing 33/33、homestay 18/18 通过。
- 专用 Chromium 已用临时解包运行库启动，未连接主 Chrome；但本机现存 Web 安装状态令 `/login` dev 编译返回 500（CSS loader/`.next/required-server-files.json`），本轮 `pages_checked=0`，证据位于 ignored `artifacts/pma-l04-browser-baseline/`。因此 HCD-001..030 浏览器终局仍为 `BLOCKED`，不将静态/契约结果升级为浏览器 PASS。
- 终局补跑使用全新 disposable PostgreSQL（307/307 migration）、production-safe seed、bootstrap admin、隔离 API/Web 与专用 Chromium profile；民宿、住房产品 API fixture 主链均通过。第一次真实浏览器运行因 Enter 序列未触发登录 POST 而阻断；修正为聚焦 submit 后的真实 Enter 键，第二次已观察 `/auth/login=200`、登录态 `/users/me=200`、UI logout 两端点 `200`，且新 BrowserContext 的 storage/cookie 均为空。
- 第二次运行随后暴露 runner 自身的会话探针缺少 bearer header，错误地将已经建立的真实登录会话判为失败；该缺陷已修正并加入契约断言。遵守同题最多两次，本轮不作第三次浏览器运行，故 27 路由仍为 `pages_checked=0`，HCD-001..030 终局保持 `BLOCKED`。两次脱敏报告及 SHA-256 manifest 保存在 ignored `artifacts/pma-l04-browser-final/`；不得把已通过的登录/logout/isolation 子门禁外推为 Case PASS。
