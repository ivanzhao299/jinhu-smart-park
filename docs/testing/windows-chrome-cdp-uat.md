# Windows 真实 Chrome CDP 浏览器 UAT 方法（标准作业程序）

> 来源：2026-08 路由治理系列真实浏览器验收实践。本文规定验收方法；模块覆盖范围和通过标准以 [`docs/uat/full-product-acceptance-matrix.md`](../uat/full-product-acceptance-matrix.md) 为准。

## 1. 架构与链路

```text
Codex CLI（WSL2，~/.codex/config.toml）
  └─ chrome-devtools MCP
       └─ http://127.0.0.1:<cdp-port>
            └─ Windows 原生 Chrome（专用 UAT profile）
                 └─ 本轮隔离全栈（Web / API / PostgreSQL）
```

断言必须来自真实 Chrome 的 URL、DOM 和交互结果。API/DB 查询只作状态持久化的辅助证据，不能代替 UI 断言。页面能打开且初始内容正确，不等于用例 PASS。

每轮先生成唯一 `RUN_ID`，并贯穿 compose project、DB/API/Web/CDP 端口、Chrome `user-data-dir`、fixture 前缀、local-only artifact 目录和报告文件名。例如：

```bash
export UAT_SCOPE="pay"
export RUN_ID="20260825-01"
export UAT_PROJECT="jinhu-${UAT_SCOPE}-uat-${RUN_ID}"
export UAT_ENV_FILE="/tmp/${UAT_PROJECT}.env"
export UAT_ARTIFACT_DIR="artifacts/${UAT_SCOPE}-uat-${RUN_ID}" # local-only
export UAT_REPORT="docs/uat/${UAT_SCOPE}-uat-${RUN_ID}.md"     # 入库
```

同一 Chrome profile 与同一 origin 不得并发运行不同账号。现有 dev compose 含固定 `container_name`，仅改变 `-p` 不能支持同机并行数据库实例；启动前发现同名容器时，必须串行执行或使用经评审的专用 UAT compose 文件，不得抢占或删除他人实例。

## 2. 一次性基础设施与 MCP 工具

### 2.1 Chrome 与 MCP

| 组件 | 位置/命令 |
|---|---|
| MCP 配置 | `~/.codex/config.toml` 的 `[mcp_servers.chrome-devtools]`，`--browser-url` 必须对应本轮 CDP 端口 |
| 启动专用 Chrome | `"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=<cdp-port> --user-data-dir='C:\Users\JinhuIT\.codex\browser\<RUN_ID>' --no-first-run --no-default-browser-check "about:blank" &` |
| 连通性验证 | `curl -fsS http://127.0.0.1:<cdp-port>/json/version`，记录 Browser/MCP 版本 |
| 端到端冒烟 | 让 Codex 用 chrome-devtools MCP 打开本地 `/login`，读取标题并保存一张 local-only 截图 |

红线：不关闭、不操作用户主 Chrome；不复用日常 profile；不让旧 tab 留在同一 origin 后继续刷新 token。若使用设计上常驻的 9222 专用 Chrome，它不计入业务端口清零，但整轮必须独占该 profile 与 origin。

### 2.2 MCP 工具速查

| 工具 | 适用场景 |
|---|---|
| `list_pages` / `select_page` | 每次操作前确认目标 tab，防止在旧账号或错误 origin 上执行 |
| `take_snapshot` | 获取可访问性树和稳定 DOM 定位；在点击、填写和断言前后使用 |
| `evaluate_script` | 采集 viewport、媒体查询、storage 键名和页面状态；原始输出另存 JSON/text local-only artifact |
| `click` / `fill_form` / `upload_file` | 真实完成按钮、表单和附件流程；不得用脚本直接改业务状态代替 UI |
| `resize_page` | 执行桌面与窄窗口交互；记录实际 viewport，不把请求尺寸当成实际尺寸 |
| `take_screenshot` | 视觉取证；文件名含 Case 编号、步骤和结果，仅本地保存 |
| `list_console_messages` | 每个交互段前后取快照，识别新增 error/warning |
| `list_network_requests` | 排查失败请求、重复提交、错误 API origin 和意外重试 |
| `performance_start_trace` / `performance_stop_trace` | 分析卡顿、长任务或关键交互性能；仅在用例要求或异常排查时启用 |

## 3. 每轮 UAT 标准流程

### 3.1 隔离数据库闭环

先用 `ss -ltn`、`docker ps -a` 实测端口和固定容器名是否可用，不按历史端口盲目顺延。准备权限为 `0600` 的本轮 env 文件，至少包含：

```dotenv
COMPOSE_PROJECT_NAME=jinhu-<RUN_ID>
COMPOSE_FILE=/absolute/path/to/infra/docker/docker-compose.yml
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=<unused-db-port>
POSTGRES_DB=jinhu_<scope>_uat_<run_id>
POSTGRES_USER=jinhu
POSTGRES_PASSWORD=<random-local-only-password>
FILE_STORAGE_LOCAL_ROOT=/tmp/jinhu-<RUN_ID>-files
AUTH_SMS_CODE_VISIBLE=false
AUTH_WECHAT_MOCK_ENABLED=false
```

env 文件只能放本机临时目录或其他已忽略位置，禁止提交。`db:migrate` 和 `db:seed:prod` 不读取 `ENV_FILE`，所以必须先导出文件中的变量；`COMPOSE_PROJECT_NAME` 使脚本内部未写 `-p` 的 compose 调用仍命中本轮 project。

```bash
chmod 600 "$UAT_ENV_FILE"
set -a
. "$UAT_ENV_FILE"
set +a
export UAT_PROJECT="$COMPOSE_PROJECT_NAME"
test "$UAT_PROJECT" = "$COMPOSE_PROJECT_NAME"

docker compose -p "$UAT_PROJECT" --env-file "$UAT_ENV_FILE" \
  -f "$COMPOSE_FILE" config --services
docker compose -p "$UAT_PROJECT" --env-file "$UAT_ENV_FILE" \
  -f "$COMPOSE_FILE" up -d postgres
docker compose -p "$UAT_PROJECT" --env-file "$UAT_ENV_FILE" \
  -f "$COMPOSE_FILE" ps

pnpm db:migrate
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
TENANT_ID=10000001 PARK_ID=20000001 STRICT=true pnpm db:check:init
```

第一次 baseline 必须逐项核对输出：只允许预期的 `bootstrap admin` 缺口；出现 schema、seed、租户、园区、模块授权、字典或其他缺口立即阻断。

`db:bootstrap:admin` 必填 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_NAME`。密码至少 12 位，且包含大写、小写、数字和特殊字符，不得使用固定默认密码，也不得包含用户名。用权限为 `0600` 的 local-only env 文件注入，或使用无回显输入：

```bash
read -rsp 'UAT bootstrap admin password: ' ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
ADMIN_USERNAME="UAT_${RUN_ID}_ADMIN" ADMIN_NAME="UAT Admin" \
  TENANT_ID=10000001 PARK_ID=20000001 ROLE_CODE=SUPER_ADMIN \
  pnpm db:bootstrap:admin
unset ADMIN_PASSWORD

TENANT_ID=10000001 PARK_ID=20000001 STRICT=true pnpm db:check:init
```

密码、JWT、Cookie、Authorization 头和数据库连接串不得进入 shell 命令参数、命令日志、报告或截图。不得启用 shell trace（`set -x`）。若使用专用 compose 文件，以上所有命令的 `COMPOSE_FILE` 必须统一改为该文件，不能混用默认 compose。

### 3.2 启动 Web/API 并建立门禁

API 实际读取 `POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`，不是 `DATABASE_URL`。`FILE_STORAGE_LOCAL_ROOT` 必须指向本轮独占目录。Web 通过 `NEXT_PUBLIC_API_PREFIX` 发起相对请求，并由 `NEXT_PUBLIC_API_TARGET` rewrite 到本轮 API。当前 Next 配置只 rewrite `/api/:path*`，因此 `API_PREFIX` 必须位于 `api/` 命名空间；选择其他前缀会使浏览器请求无法转发，应阻断而不是继续验收。示例：

```bash
export API_PORT=<unused-api-port>
export WEB_PORT=<unused-web-port>
export API_PREFIX=api/v1
export WEB_ORIGIN="http://127.0.0.1:${WEB_PORT}"
export NEXT_PUBLIC_API_PREFIX="/${API_PREFIX}"
export NEXT_PUBLIC_API_TARGET="http://127.0.0.1:${API_PORT}"
export UAT_LOG_DIR="/tmp/jinhu-${RUN_ID}"
mkdir -p "$UAT_LOG_DIR"

APP_PORT="$API_PORT" nohup pnpm dev:api >"$UAT_LOG_DIR/api.log" 2>&1 &
echo $! >"$UAT_LOG_DIR/api.pid"
nohup pnpm dev:web >"$UAT_LOG_DIR/web.log" 2>&1 &
echo $! >"$UAT_LOG_DIR/web.pid"
```

报告记录 API/Web PID 和失败日志路径，不复制含秘密的日志正文。轮询等待，不用单次固定 sleep 掩盖慢启动；例如用以下 120 秒门禁，进程提前退出或超时即 FAIL：

```bash
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  kill -0 "$(cat "$UAT_LOG_DIR/api.pid")" 2>/dev/null || break
  kill -0 "$(cat "$UAT_LOG_DIR/web.pid")" 2>/dev/null || break
  if curl -fsS --connect-timeout 1 --max-time 2 \
       "http://127.0.0.1:${API_PORT}/${API_PREFIX}/health" >/dev/null && \
     curl -fsS --connect-timeout 1 --max-time 2 \
       "http://127.0.0.1:${API_PORT}/${API_PREFIX}/ready" >/dev/null && \
     curl -fsS --connect-timeout 1 --max-time 2 \
       "http://127.0.0.1:${WEB_PORT}/login" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS --connect-timeout 2 --max-time 5 \
  "http://127.0.0.1:${API_PORT}/${API_PREFIX}/health"
curl -fsS --connect-timeout 2 --max-time 5 \
  "http://127.0.0.1:${API_PORT}/${API_PREFIX}/ready"
curl -fsS --connect-timeout 2 --max-time 5 \
  "http://127.0.0.1:${WEB_PORT}/login" >/dev/null
```

`API_PREFIX` 可覆盖，先记录本轮实际值，再构造 health/readiness URL；readiness 是 `/<prefix>/ready`，不是 `/health/ready`。`/health` 只证明进程存活，`/ready` 才包含数据库和初始化基线检查。

开始 UAT 前还必须证明链路没有静默连到默认环境：

1. `docker compose ... ps` 的 project/service label、端口和本轮 env 一致；API `/ready` 的数据库检查通过。
2. Chrome Network 中业务请求发往本轮 Web origin 的 `/<prefix>/...`，并由 `NEXT_PUBLIC_API_TARGET` 指向本轮 API。
3. 用带 `RUN_ID` 的 fixture 通过真实 UI 创建/读取，再用只读 API/DB 查询确认只出现在本轮库。

### 3.3 第 0 阶段：设计↔实现闭环审计

真实 Chrome 用例之前，先收集模块的权威功能设计：

- `.trellis/tasks/` 及 `.trellis/tasks/archive/` 中相关任务的 `prd.md`、`design.md`；
- `docs/` 下架构、模块、发布和验收文档；
- `AGENTS.md` 中对应模块规则。

先审计设计本身是否闭合：每个状态是否有出口，分支是否有出口条件，权限矩阵是否覆盖全部声明操作，异常路径是否有定义，字典、权限、园区上下文等模块依赖在不同文档间是否一致。缺失或矛盾记为 `design gap`。

再逐条核对实现闭环：

1. 交叉检索菜单白名单、`apps/web/app/` 路由和 `packages/shared` 权限契约，确认路由、菜单和权限点一致。
2. 对照设计核对 API 端点与前端调用接线；用 `rg -n 'TODO|FIXME|暂未|占位' apps packages` 定位并人工判定占位、stub 或假实现。
3. 沿“写入→存储→查询→展示”检查数据链路是否闭合。
4. 核对设计声明的校验规则在前端和后端都存在，且边界一致。

产出《设计-实现闭环审计表》，每个设计条目标记“已实现 / 部分实现 / 未实现 / 偏离设计”并附代码或文档证据路径。`部分实现`、`未实现` 的链条不进入浏览器 UAT 矩阵，直接记 gap 和阻断；设计矛盾导致流程无法走通的受影响链路终止，记 `audit finding`，不记浏览器 UAT FAIL。只有审计表完成后才进入后续步骤。

严格执行顺序为：**第 0 阶段闭环审计 → 在报告中形成设计依据清单 → 推导角色 × 流程链矩阵 → 执行真实 Chrome 用例**。审计表未产出，禁止开始浏览器用例。

fixture 一律使用 `UAT_<SCOPE>_<RUN_ID>_` 前缀；角色矩阵至少考虑管理员、业务岗、窄权限岗和跨园区/数据范围岗。用例设计阶段根据该模块 fixture 的实际触达面，逐表列出 residual 审计清单和 before/after 查询，不能事后只抽查 `users`。

### 3.4 账号切换与会话隔离

账号切换必须按以下序列执行：

1. 在真实 UI 点击退出；断言回到 `/login`。
2. 确认旧 tab 不再访问该 origin，避免旧 refresh cookie/token 刷新造成串线。
3. 新账号用真实表单登录；断言页面身份、租户和园区与 Case 一致。
4. 检查 `sessionStorage` 与 `localStorage` 双写 token 已切换，`jinhu_park_context_switch` 等残留键已清理；同时验证 HttpOnly refresh cookie 对应新会话。

禁止用直接覆盖 token 或直接再次登录来代替退出。不同账号不得共享同一 profile+origin 并发执行。

## 4. UI/UX 交互测试纪律

每个 Case 必须写明并实际走完“交互路径”，不得只 navigate 到页面看一眼：

- 主流程：创建→编辑→删除，搜索→筛选→翻页，上传→预览→删除等适用序列全部执行。
- 表单：触发必填校验；输入超长、特殊字符和边界值；检查错误反馈；成功后检查 toast、跳转或列表刷新。提交期间检查按钮禁用态，并实际快速连点两次，确认无重复写入。
- 三态：分别验证加载中（骨架/spinner）、空状态（文案和引导动作）和请求失败的页内错误态；白屏或英文堆栈为 FAIL。
- 一致性：操作后列表、KPI、详情同步更新；编辑值真实变化；删除后条目消失。
- 导航：面包屑正确；浏览器后退不破坏状态；带参深链可直达；tab 切换保持设计声明的筛选条件。
- 可观测性：交互段开始和结束分别保存 console 快照；`list_console_messages` 不得新增未解释 error/warning；用 `list_network_requests` 检查失败和重复请求。
- 响应式：窄窗口下实际操作抽屉、弹窗、表单和移动卡片；过程中不得破版或横向溢出，不能只检查初始渲染。
- 键盘与可访问性：验证 Tab 顺序、焦点可见性、Enter/Esc、弹窗关闭后的焦点返回、200%/400% zoom/reflow、基础 screen-reader semantics、`prefers-reduced-motion` 和 forced-colors；保存相应 snapshot/evaluate 原始输出。
- 离线恢复：按设计切断网络后实际执行或排队操作，检查页内反馈；恢复网络后验证重试、状态保持和重复写入控制。

红线：**“页面能打开且内容正确”不等于 PASS。只有 Case 声明的交互序列全部完成、状态符合预期且无未解释的可观测异常，才可 PASS。**

## 5. 端到端业务流测试（设计驱动）

每个模块报告开头先放“流程链矩阵”，从设计推导“角色 × 端到端流程链”，而不是按页面拼凑 Case。每条链必须写明流程链编号、设计依据、页面序列、每步角色、操作和期望状态迁移。例如租赁链可为“合同创建→应收生成→收款登记→核销→对账”，工单链可为“创建→派单→执行→验收→关闭→评价”。

设计中声明的每个分支都必须有用例，包括审批驳回、取消/作废、部分成功、幂等重放和并发冲突。每个 UI 步骤之后可以执行只读 API/DB 查询，佐证状态真实落库；查询结果记录在 Case 中，但不能替代 UI 的反馈和最终状态断言。

设计与实现不一致时，新建独立 `gap` 发现项，写明设计出处、期望和实际表现；验收轮不顺手修改产品代码。

红线：**只验单页初始内容不算完成 UAT；未覆盖设计声明的端到端流程链和分支，模块不得声明 PASS。**

## 6. 证据与关闭闭环

### 6.1 Case 证据

每个 Case 按顺序执行：选对 tab → snapshot 定位 → 真实点击/填写/提交 → URL/DOM/状态断言 → console/network 检查 → 截图。设备证据必须保存 `evaluate_script` 原始 JSON/text 输出，至少包含实际 viewport、`navigator.maxTouchPoints` 和 `(pointer:fine/coarse)`。

以下只能表述为本机该轮实测，不能泛化为 Windows Chrome：历史某轮桌面 `maxTouchPoints=10`；历史某轮请求 390×844 后实际最小窗宽约 500px。报告只声明实际测得的 viewport 与对应窄窗口契约，不冒充真机模拟。

### 6.2 证据策略

- 入库报告：`docs/uat/<scope>-uat-<run-id>.md`，包含 Case 编号、结果和对应本地证据引用。
- 本地证据：`artifacts/<scope>-uat-<run-id>/`，在报告路径旁明确标注 **`local-only`**；`artifacts/` 保持 gitignore。
- 不承诺截图随 PR 提供，不强制加入被忽略的 artifact，也不得使用 `git add -f artifacts/`。
- 历史已经入库的 artifact 保持现状；本 SOP 只约束未来轮次。

截图禁止包含密码、JWT、Cookie、Authorization 头、连接串、个人敏感数据或签名 URL。提交前对本轮 artifact 目录逐图审查，并对文件名、伴随 JSON/text、OCR 可检索内容做敏感词扫描；发现泄漏先删除或脱敏本地证据，再写报告。报告不得嵌入秘密。

### 6.3 FAIL、清理与 residual=0

FAIL 先排除 fixture/环境；同一问题最多重试 2 次。仍失败则记录产品 FAIL、疑似根因和 local-only 证据，验收轮不改代码。无关异常作为 observation，设计差异作为 gap。

结束时：

1. 所有账号经真实 UI logout 并断言 `/login`，Chrome 停在 `about:blank`；不关闭常驻专用实例。
2. 按用例设计阶段列出的逐表 before/after 清单删除 fixture 和文件，证明 residual=0。
3. 对每个 pid file，先用 `ps -p <pid> -o pid=,args=` 核对命令，再用 `readlink -f /proc/<pid>/fd/1` 和 `/proc/<pid>/fd/2` 核对 stdout/stderr 都指向本轮 `api.log` 或 `web.log`；全部匹配后才向确切 PID 发送 SIGINT。身份不符则停止清理并人工核查。端口清零仅指本轮声明的 DB/API/Web 端口；设计上常驻的 9222 CDP 不计入。
4. 先快照全部现存容器，再用 compose label 精确圈定本轮资源；确认目标 project 后才清理：

```bash
docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' \
  >"/tmp/jinhu-${RUN_ID}-containers-before.txt"
docker ps -a --filter "label=com.docker.compose.project=$UAT_PROJECT"
docker volume ls --filter "label=com.docker.compose.project=$UAT_PROJECT"
docker network ls --filter "label=com.docker.compose.project=$UAT_PROJECT"
docker compose -p "$UAT_PROJECT" --env-file "$UAT_ENV_FILE" \
  -f "$COMPOSE_FILE" ps

docker compose -p "$UAT_PROJECT" --env-file "$UAT_ENV_FILE" \
  -f "$COMPOSE_FILE" down -v --remove-orphans
docker ps -a --format '{{.ID}} {{.Names}} {{.Status}}' \
  >"/tmp/jinhu-${RUN_ID}-containers-after.txt"
```

`down` 必须与 `up` 使用完全相同的 `-p/-f/--env-file`。清理后再次按 project label 核对容器、卷、网络为空，核对本轮 DB/API/Web 端口无监听，并对清理前快照中的非本轮容器做前后对比。禁止按名称模糊匹配或操作他人容器。最后安全删除本轮临时 env 文件。

附件物理文件也属于 residual：先校验 `test "$FILE_STORAGE_LOCAL_ROOT" = "/tmp/jinhu-${RUN_ID}-files"`，再删除这个精确目录并确认不存在；校验失败时禁止递归删除，改为人工核查。数据库软删除不能代替本轮文件根清理。

### 6.4 报告、验收与发布状态

报告最低元数据：commit SHA、执行者、起止时间、RUN_ID、compose project、浏览器/MCP 版本、实际 viewport、Web/API/DB 端口、API/Web PID、失败日志路径和开放限制。正文至少包含设计依据、流程链矩阵、Case PASS/FAIL/BLOCKED、gap/observation、local-only 证据路径和清理审计。

任务只有在**全部验收条件 PASS**后才能 completed/归档；浏览器/viewport 矩阵只是其中一维。有 FAIL/BLOCKED 保持 in_progress 并写清缺口。UAT 结论必须与发布状态分开：UAT PASS 不自动等于真人签署、`production_ready` 或 Deploy 成功。

报告变更走分支 → PR → `@codex review` → CI 绿 → squash merge → main CI 绿。纯文档变更仍在报告正文记录 Deploy 结果，但不把部署产物、截图或 `artifacts/` 纳入 PR，也不以 Deploy 业务指标替代 UAT 结论。

## 7. 已知坑位清单

| 坑 | 事实与处理 |
|---|---|
| compose 默认值 | DB 脚本默认 `COMPOSE_FILE=infra/docker/docker-compose.yml`；本轮必须导出同一绝对路径和 `COMPOSE_PROJECT_NAME` |
| 固定容器名 | dev compose 的固定 `container_name` 会阻止仅靠 `-p` 实现同机并行；启动前实测并串行或使用专用 compose |
| readiness 路径 | 是 `/<API_PREFIX>/ready`，不是 `/health/ready`；先记录本轮 prefix |
| Windows Chrome 最小窗宽 | “约 500px”仅是历史本机实测；每轮记录实际 viewport |
| 桌面 Chrome 触点数 | `maxTouchPoints=10` 仅是历史本机实测；设备判定同时记录 `(pointer:*)` |
| production seed / scheduler | 历史曾由 seed 数据触发 scheduler 报错；这是排障线索，不是当前必现行为 |
| 端口复用 | 历史端口不构成占用事实；每轮用 `ss`/compose 实测选择端口 |
| 守卫与导航竞争 | 上下文切换必须覆盖切换瞬间和旧 tab/session，单看最终页面会漏掉时序竞争 |

## 8. 新模块 UAT 简报与报告模板

```markdown
# <模块名> 真实 Chrome UAT

## 元数据
- Commit / 执行者 / 起止时间：
- RUN_ID / compose project：
- Chrome / MCP / viewport：
- Web、API、DB 端口 / API、Web PID：
- 日志路径 / 开放限制：
- 报告：docs/uat/<scope>-uat-<run-id>.md
- 本地证据（local-only）：artifacts/<scope>-uat-<run-id>/

## 设计依据清单
| 路径 | 关键结论 |
|---|---|
| .trellis/tasks/.../prd.md | ... |

## 设计-实现闭环审计表
| 设计条目 | 设计闭环结论 | 实现状态 | 设计/实现证据路径 | gap / 阻断 |
|---|---|---|---|---|
| ... | 闭合 / design gap | 已实现 / 部分实现 / 未实现 / 偏离设计 | ... | ... |

## 流程链矩阵
| 流程链编号 | 角色 | 页面序列 | 状态迁移 | 分支/异常 | 适用 Case |
|---|---|---|---|---|---|
| FLOW-01 | ... | ... | draft→... | 驳回/冲突/... | C01... |

## Case 矩阵
| Case | 流程链编号 | 设计依据 | 角色/范围 | 交互路径 | 预期状态迁移 | UI/URL 断言 | API/DB 辅助佐证 | console/network | viewport | local-only 证据 | 结果 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | FLOW-01 | ... | ... | 创建→编辑→删除 | ... | ... | ... | ... | ... | artifacts/...（local-only） | PASS/FAIL/BLOCKED |

## 按模块类型勾选的覆盖维度
- [ ] 主流程与全部设计分支/异常流
- [ ] 菜单、按钮、API、字段级权限与数据范围
- [ ] 幂等重放、快速双击与并发冲突
- [ ] 财务审计、作废规则与禁止物理删除（财务模块适用）
- [ ] 附件类型、大小、biz_type/biz_id 绑定、预览和权限（上传模块适用）
- [ ] 加载/空/错误三态、导航状态、桌面与窄窗口交互
- [ ] residual 逐表 before/after 清单

## 发现与闭环
- FAIL / gap / observation：
- 清理与 residual=0：
- UAT 结论：
- 发布状态（单独记录，不由 UAT 自动推导）：
```
