# SmartPark WP3 认证与会话安全工作计划

生成日期：2026-06-17

建议分支：`docs/wp3-auth-session-plan`

## 1. 目的

WP3 对应 `docs/release/smartpark-review-remediation-plan.md` 中的 R4，优先级为 P1。

WP3 的目标是提升认证与会话安全，重点覆盖公开认证端点限流、密码失败锁定、refresh token HttpOnly cookie、access token 内存化、token family / refresh token rotation 复用检测，以及配套 auth unit 和 smoke 验证。

当前阶段只制定计划，不修改认证代码、前端登录逻辑、数据库、CI 或测试。本计划文档本身不代表认证安全已修复，不代表登录协议已变更，不代表测试已通过。

## 2. 背景

WP0 已恢复首发回归入口，WP1 已修复 Docker / release-smoke 阻塞，WP2 已完成 CI / 测试 / Coverage 基础设施第一阶段。当前进入 P1 安全风险阶段。

总计划中 WP3 关注：

- 公开认证端点限流。
- 密码失败锁定。
- refresh token HttpOnly cookie。
- access token 内存化。
- token family 复用检测。

只读预检观察到的当前现状：

- API 公开认证端点包括 `/auth/login`、`/auth/mobile/send-code`、`/auth/mobile/login`、`/auth/wechat/authorize`、`/auth/wechat/callback`、`/auth/select-context`、`/auth/token/refresh`。
- 当前 JWT 从 `Authorization: Bearer` header 提取。
- 当前登录响应返回 `accessToken` 和 `refreshToken`。
- 当前 refresh token 已写入 `sys_auth_refresh_token`，以 hash 存储，refresh 时会撤销旧 token 并签发新 token。
- 当前 refresh token 表未见 token family、parent token、reuse detection、revoked reason 等字段。
- 当前 Web 端将 access token、refresh token 和用户信息写入 `sessionStorage` 与 `localStorage`。
- 当前未发现 HttpOnly cookie 登录态实现。
- 当前 CORS 开启 `credentials: true`，origin 来自 `WEB_ORIGIN`，但尚未看到 cookie / CSRF / SameSite 的完整策略。
- 当前生产环境会 fail-fast 禁用 SMS 固定验证码、SMS mock code 可见性、WeChat mock。
- 当前 SMS / WeChat 在生产环境中通过服务层断言拒绝。
- 当前没有发现 auth 专属 `.spec.ts`，已有 `scripts/e2e/first-release-auth-health.mjs` 和 release-smoke 登录验证覆盖基本登录、`/auth/me`、错误密码、SMS / WeChat 生产禁用行为。

该工作会影响 API、Web 登录态、CSRF、CORS、移动端或小程序登录态策略，因此必须先制定方案，分阶段实施，避免一次性改完整认证协议导致登录不可用。

## 3. 输入依据

| 输入文件 / 范围 | 用途 |
|---|---|
| `docs/release/smartpark-review-remediation-plan.md` | WP3 来源、R4/P1 定级、中期安全专项目标和验收方向 |
| `docs/release/smartpark-review-remediation-wp0-plan.md` | 确认 WP3 不回退首发菜单和回归入口修复 |
| `docs/release/smartpark-review-remediation-wp1-plan.md` | 确认 WP3 不混入 Docker / release-smoke 修复 |
| `docs/release/smartpark-review-remediation-wp2-plan.md` | 确认 WP3 依赖 `pnpm test:unit` 等测试基础设施 |
| `.github/workflows/ci.yml` | 当前 verify 已包含 lint、typecheck、unit、build；release-smoke 独立触发 |
| `package.json` | 当前 root `test:unit`、`test:coverage`、E2E 脚本语义 |
| `apps/api/package.json` | API unit / coverage 脚本入口 |
| `apps/web/package.json` | Web 构建和类型检查入口 |
| `apps/api/src/modules/auth/auth.controller.ts` | 当前公开认证端点、refresh、logout、`/auth/me`、select-context 入口 |
| `apps/api/src/modules/auth/auth.service.ts` | 当前 password / mobile / WeChat login、refresh rotation、production auth safety 逻辑 |
| `apps/api/src/modules/auth/entities/auth-refresh-token.entity.ts` | 当前 refresh token 存储字段和缺少 token family 的边界 |
| `apps/api/src/modules/auth/entities/auth-policy.entity.ts` | 当前 tenant auth policy 基础字段 |
| `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | 当前 JWT Bearer 提取和 tenant active 校验 |
| `apps/api/src/modules/auth/guards/jwt-auth.guard.ts` | 当前 public endpoint 绕过 JWT guard 的方式 |
| `apps/api/src/shared/types/jwt-principal.ts` | 当前 token / user context contract |
| `apps/api/src/app.module.ts`、`apps/api/src/main.ts` | 当前全局 guard、CORS、生产 auth 环境校验入口 |
| `apps/web/app/login/page.tsx` | 当前 Web 登录页面保存 access / refresh token 的方式 |
| `apps/web/lib/auth.ts` | 当前 token / refresh token / user 的 storage 策略 |
| `apps/web/lib/api-client.ts` | 当前 Authorization header、401 清理 storage 行为 |
| `apps/web/components/layout/UserMenu.tsx` | 当前 logout 使用 refreshToken body 的行为 |
| `scripts/e2e/first-release-auth-health.mjs` | 现有 auth/health 回归入口 |
| `scripts/verify-api-login-dockerexec.sh` | release-smoke 登录验证链路 |

## 4. WP3 四阶段计划

### 4.1 计划阶段

计划阶段只读确认：

- 当前登录、refresh、logout、`/auth/me`、select-context 流程。
- 当前 access token / refresh token 返回方式、存储方式和传输方式。
- 当前 Web 端 token 存储位置：`sessionStorage` 和 `localStorage`。
- 当前是否有 HttpOnly cookie：只读预检未发现。
- 当前是否有限流、失败锁定、token family 复用检测：只读预检未发现完整机制；SMS code 有 `attempt_count`，refresh token 有 revoked，但未见 family / reuse detection。
- 当前 SMS / WeChat / mock auth 生产行为：生产环境禁用 SMS 固定验证码、SMS mock code 可见、WeChat mock；生产服务层拒绝 SMS / WeChat 登录。
- 当前 CSRF / CORS / SameSite 策略：CORS `credentials: true` 已存在，cookie / CSRF / SameSite 策略需人工确认。
- 当前 auth 相关测试覆盖：已有首发 auth-health 和 release-smoke login；未发现 auth 专属 unit spec。

计划阶段产出应包含：

- 当前认证现状摘要。
- 目标 token / session contract 草案。
- 分阶段实施边界。
- 有副作用验证命令和测试环境要求。
- 需要人工确认事项。

### 4.2 实现阶段

后续实施应拆分小步推进，避免一次性改完整认证协议。

建议拆分：

| 小步 | 目标 | 说明 |
|---|---|---|
| 公开认证端点限流 | 对 login、mobile send-code、mobile login、wechat authorize/callback、select-context、token refresh 做限流 | 优先 API 侧保护；需区分 IP、用户名、tenant、park、设备维度 |
| 密码失败计数和锁定策略 | 连续失败后延迟、锁定或要求管理员处理 | 需避免用户枚举；锁定窗口、阈值、解锁机制需人工确认 |
| refresh token HttpOnly cookie 策略 | 将 refresh token 从 JS 可读 body/storage 迁移到 HttpOnly cookie | 涉及 cookie path、domain、Secure、SameSite、Max-Age、CORS credentials |
| access token 内存化和 Web 登录态调整 | 减少 access token 在 localStorage/sessionStorage 的暴露 | 页面刷新、多标签页、401 刷新、用户信息恢复需设计迁移路径 |
| token family / refresh token rotation / 复用检测 | 识别旧 refresh token 被复用，撤销 token family 并记录安全事件 | 可能需要 migration 增加 family、parent、used/reused、revoked reason 等字段 |
| auth 安全测试和 smoke | 增加 auth unit 和 auth-security smoke | 覆盖错误密码、限流、锁定、refresh rotation、cookie、安全禁用路径 |
| 文档和回滚说明 | 更新登录态 contract、运维配置和回滚策略 | PR 描述必须说明 cookie / CSRF / CORS / DB 影响 |

实施顺序建议：

1. 先做 API 侧无协议破坏保护，例如限流和失败锁定的最小可验证实现。
2. 再做 refresh token rotation / family 数据模型。
3. 再切换 refresh token HttpOnly cookie。
4. 最后做 access token 内存化和 Web 端迁移。

涉及 cookie / CSRF / CORS 的变更需前后端同步。若需要 migration，必须单独说明影响、兼容期和回滚。

### 4.3 验证阶段

无副作用 / 轻量验证：

```bash
pnpm test:unit
pnpm --filter @jinhu/api test:unit
pnpm lint
pnpm typecheck
pnpm build
```

新增后执行：

```bash
pnpm --filter @jinhu/api test:unit -- auth
node scripts/e2e/auth-security-smoke.mjs
```

说明：

- auth unit 应优先覆盖纯服务逻辑、token rotation、失败计数和 lock policy。
- auth smoke 可能需要 API / DB / 测试账号。
- 涉及登录失败锁定、refresh rotation、cookie 的验证需要可控测试环境。
- cookie / SameSite / CORS 行为需要浏览器或等价 HTTP client 验证。
- auth smoke 如会写测试用户、session、refresh token 或登录失败计数，执行前需确认测试 DB。

### 4.4 风险与回滚阶段

主要风险：

- 登录协议变更导致 Web 登录失败。
- refresh token cookie 策略影响跨域 / SameSite。
- access token 内存化影响页面刷新和多标签页。
- 失败锁定误伤正常用户。
- 限流策略误伤健康检查或自动化测试。
- token family 复用检测误判。
- 移动端 / 小程序登录态兼容风险。
- migration / session 表变更回滚风险。

回滚原则：

- 限流和失败锁定应可通过配置降级或关闭。
- cookie 登录态迁移应保留短期兼容策略，避免前后端错版导致全量退出。
- migration 如增加字段，应优先向后兼容；删除字段或强约束收紧应放到后续清理阶段。
- 若 refresh reuse 检测误判，应能按 family / user / device 维度撤销或恢复策略。

## 5. 范围与边界

### 5.1 后续拟修改范围

| 文件 / 范围 | 可能用途 |
|---|---|
| API auth controller / service | 登录、refresh、logout、select-context、SMS / WeChat 登录保护 |
| API JWT / refresh token / session 相关模块 | token 签发、rotation、family、复用检测、revocation |
| API guard / strategy | JWT 提取、cookie / header 兼容策略、public endpoint 保护 |
| Web auth storage / http client / login 页面 | access token 内存化、refresh cookie、401 refresh、logout |
| auth 相关 DTO / shared 类型 | 登录响应 contract、cookie 模式下 refresh token 返回策略 |
| auth 相关测试 | auth unit、token rotation unit、auth-security smoke |
| 必要时 migration / seed | token family、登录失败计数、session 表或策略字段 |
| 必要时文档 | 登录态 contract、运维配置、回滚说明 |

### 5.2 禁止修改范围

WP3 不应修改：

- 与认证无关的业务模块。
- Dockerfile / compose / release-smoke。
- WP4 权限、模块授权、数据范围和字段权限治理。
- WP5 幂等、状态机、财务一致性。
- WP6 文件安全。
- WP7 IoT / WebSocket / 外部调用。
- snapshot baseline。
- 真实密钥、密码、token、连接串。

本计划阶段进一步禁止修改：

- `.github/workflows/**`
- `scripts/**`
- `scripts/e2e/snapshots/**`
- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- 业务代码、前端登录逻辑、认证 / session / token 代码、DTO / guard / strategy / controller / service 文件
- migration / seed

## 6. 只读预检命令

计划阶段建议执行以下只读命令：

```bash
git status --short
git branch --show-current
rg --files apps/api/src apps/web packages scripts docs -g '*auth*' -g '*session*' -g '*jwt*' -g '*login*' -g '*users*' -g '*tenant*' -g '*context*' -g '!node_modules/**' -g '!.next/**' -g '!dist/**' -g '!coverage/**'
rg -n "login|logout|refresh|refreshToken|accessToken|jwt|JWT|cookie|HttpOnly|localStorage|sessionStorage|Authorization|Bearer|csrf|sameSite|select-context|auth/me|wechat|sms" apps/api apps/web packages docs scripts -g '!node_modules/**' -g '!.next/**' -g '!dist/**' -g '!coverage/**'
sed -n '1,220p' package.json
sed -n '1,220p' apps/api/package.json
sed -n '1,220p' apps/web/package.json
sed -n '1,260p' apps/api/src/modules/auth/auth.controller.ts
sed -n '1,760p' apps/api/src/modules/auth/auth.service.ts
sed -n '1,220p' apps/web/lib/auth.ts
sed -n '1,240p' apps/web/lib/api-client.ts
```

注意避免读取 `node_modules`、`.next`、`dist`、`coverage` 等生成目录。输出审计结果时不得输出真实 token、密码、密钥或连接串。

## 7. WP3 与后续 WP4-WP8 的关系

WP3 只处理认证与会话。

后续工作包边界：

- WP4 处理权限、模块授权、数据范围和字段权限。
- WP5 处理幂等、状态机、财务一致性。
- WP6 处理文件安全。
- WP7 处理 IoT / WebSocket / 外部调用安全。
- WP8 处理长期治理、性能和架构债。

WP3 不应混入权限矩阵、数据范围、文件上传、IoT nonce、外部 HTTP allowlist、财务并发等后续工作包。

WP3 的认证上下文会影响 WP4 权限治理，因此需留下明确 token / user context contract：

- `JwtPrincipal` 中的 `sub`、`tenantId`、`parkId`、`roles`、`permissions`、`dataScope`、`isSuper` 是否保持兼容。
- Cookie 模式是否仍允许后端从 Bearer header 接收 token，兼容 E2E 和非浏览器客户端。
- `/auth/me` 或 `/users/me` 的用户上下文是否仍是权限治理的输入来源。

## 8. 执行步骤

### 步骤 1：确认当前认证与会话现状

| 项目 | 内容 |
|---|---|
| 目的 | 明确现有登录态、refresh、Web storage 和测试覆盖 |
| 输入 | auth controller/service/entity、Web auth/http client、auth smoke |
| 操作 | 只读审计登录、refresh、logout、`/auth/me`、select-context、SMS / WeChat、storage、CORS |
| 产出 | 现状清单和缺口清单 |
| 验收标准 | 能说明当前 token 从哪里签发、怎么存储、怎么刷新、怎么注销 |

### 步骤 2：定义目标登录态和 token contract

| 项目 | 内容 |
|---|---|
| 目的 | 避免 API 和 Web 对 token / cookie 的预期不一致 |
| 输入 | 当前 `LoginResult`、`JwtPrincipal`、Web storage、API client |
| 操作 | 定义 access token、refresh token、cookie、用户上下文、兼容期行为 |
| 产出 | 目标 contract 草案 |
| 验收标准 | 明确 refresh token 是否返回 body、是否写 HttpOnly cookie、access token 是否只保存在内存 |

### 步骤 3：设计公开认证端点限流

| 项目 | 内容 |
|---|---|
| 目的 | 降低暴力破解、短信轰炸、OAuth state 滥用风险 |
| 输入 | 公开 auth endpoint、IP、用户名、tenant、park、mobile、state 维度 |
| 操作 | 设计限流维度、阈值、窗口、返回码、日志和白名单 |
| 产出 | 限流策略 |
| 验收标准 | 连续恶意请求被限制，健康检查和正常自动化测试不受影响 |

### 步骤 4：设计密码失败锁定策略

| 项目 | 内容 |
|---|---|
| 目的 | 防止账号级密码爆破 |
| 输入 | 用户表、登录日志、候选用户查询和错误处理 |
| 操作 | 设计失败计数、锁定窗口、解锁机制、管理员操作和审计 |
| 产出 | 锁定策略和数据模型影响 |
| 验收标准 | 错误密码达到阈值后拒绝登录；正确密码在锁定期也不能绕过；错误信息不泄露账号存在性 |

### 步骤 5：设计 refresh token HttpOnly cookie / rotation

| 项目 | 内容 |
|---|---|
| 目的 | 降低 refresh token 被 JS 读取和长期盗用风险 |
| 输入 | refresh token entity、refresh endpoint、logout、CORS |
| 操作 | 设计 cookie 名称、path、domain、Secure、HttpOnly、SameSite、Max-Age、rotation 和兼容期 |
| 产出 | refresh cookie contract |
| 验收标准 | 浏览器客户端无需读取 refresh token；refresh rotation 后旧 token 失效；logout 清理 cookie 和服务端 token |

### 步骤 6：设计 access token 内存化和 Web 端迁移路径

| 项目 | 内容 |
|---|---|
| 目的 | 减少 access token 持久化暴露面 |
| 输入 | Web login page、auth helper、api client、页面刷新和 401 处理 |
| 操作 | 设计内存 token、页面刷新恢复、并发 refresh、多标签页同步策略 |
| 产出 | Web 登录态迁移方案 |
| 验收标准 | 登录、刷新、打开新标签、页面刷新、401 自动恢复或退出路径明确 |

### 步骤 7：设计 token family 复用检测

| 项目 | 内容 |
|---|---|
| 目的 | 发现旧 refresh token 被重放或盗用 |
| 输入 | refresh token 表、revoked 状态、refresh rotation |
| 操作 | 设计 family id、parent id、used/reused 标记、revoked reason、安全事件记录 |
| 产出 | token family 数据模型和检测策略 |
| 验收标准 | 旧 refresh token 复用可识别；同 family 后续 token 可被撤销；误判可审计 |

### 步骤 8：设计 CSRF / CORS / SameSite 策略

| 项目 | 内容 |
|---|---|
| 目的 | 在 HttpOnly cookie 模式下防止跨站请求滥用 |
| 输入 | Web origin、API origin、cookie 策略、CORS credentials |
| 操作 | 设计 SameSite、CSRF token、Origin / Referer 校验、允许源和环境差异 |
| 产出 | Web/API 安全边界策略 |
| 验收标准 | 合法 Web 可 refresh；跨站请求被拒；本地开发和 CI smoke 有明确配置 |

### 步骤 9：设计测试方案

| 项目 | 内容 |
|---|---|
| 目的 | 让认证安全变更可验证、可回归 |
| 输入 | WP2 unit 入口、现有 auth smoke、release-smoke |
| 操作 | 设计 auth unit、auth-security smoke、cookie / browser 行为验证 |
| 产出 | 测试矩阵 |
| 验收标准 | 覆盖成功登录、错误密码、锁定、限流、refresh rotation、reuse detection、logout、SMS / WeChat 生产禁用 |

### 步骤 10：分阶段实施和回滚

| 项目 | 内容 |
|---|---|
| 目的 | 降低登录态协议变更风险 |
| 输入 | 步骤 2-9 的 contract、策略和测试 |
| 操作 | 按 API 保护、数据模型、cookie refresh、Web 内存化顺序分 PR 实施 |
| 产出 | 分阶段 PR 计划和回滚开关 |
| 验收标准 | 每个阶段都能独立通过 `pnpm test:unit`、lint、typecheck、build，并记录是否执行 auth smoke |

## 9. 验收命令

当前可执行：

```bash
pnpm test:unit
pnpm lint
pnpm typecheck
pnpm build
```

新增后执行：

```bash
pnpm --filter @jinhu/api test:unit -- auth
node scripts/e2e/auth-security-smoke.mjs
```

如涉及 API / DB / cookie / browser 行为，应标记为“需要测试环境确认后执行”。认证 E2E 可能创建测试用户、触发失败登录计数、产生 session / refresh token 数据，不应在未确认环境时运行。

## 10. 需要用户确认后才执行的命令

以下命令可能有副作用或影响登录态：

```bash
node scripts/e2e/auth-security-smoke.mjs
pnpm db:migrate
pnpm db:seed:prod
pnpm db:bootstrap:admin
```

说明：

- 认证 E2E 可能创建测试用户、触发失败登录计数、产生 session / refresh token 数据。
- migration 需单独确认，尤其是 token family、失败锁定、session 表结构变更。
- seed / bootstrap 可能影响测试账号和默认管理员状态。
- 本计划阶段不运行这些命令。

## 11. 风险与回滚

| 风险 | 影响 | 缓解 | 回滚 |
|---|---|---|---|
| 登录不可用 | 用户无法进入系统 | 分阶段发布，先保留 Bearer / body 兼容；上线前 auth smoke | 回退登录态协议变更，保留 API 保护逻辑 |
| cookie 策略错误 | refresh 失败或 cookie 不发送 | 明确 domain、path、Secure、HttpOnly、SameSite；浏览器验证 | 恢复 body refresh token 兼容期 |
| CSRF / CORS 配置错误 | 合法请求被拒或跨站风险增加 | 限定 origin，配套 CSRF token 或 Origin 校验 | 回退 CSRF middleware 或收窄到非阻断监控 |
| 多标签页 / 页面刷新登录态丢失 | 用户体验下降，频繁退出 | 设计 refresh-on-load、BroadcastChannel 或 storage event 兼容方案 | 临时恢复 sessionStorage access token |
| refresh rotation 误判 | 正常用户 refresh 后被强制退出 | 单元测试并记录 family / parent / reason；设置灰度开关 | 禁用 reuse detection，仅保留单 token revoke |
| 失败锁定误伤 | 正常用户被锁 | 阈值、窗口、解锁机制可配置；管理员解锁 | 提供配置关闭或缩短锁定窗口 |
| 限流误伤 | 自动化测试或合法登录被 429 | 区分 IP / username / tenant 维度，CI 可配置测试白名单 | 临时放宽阈值或关闭特定端点限流 |
| 移动端兼容问题 | 非浏览器客户端无法使用 cookie | 保留 Bearer / body 模式兼容或定义移动端专用协议 | 回退到旧响应 contract |
| migration 回滚风险 | session / token 数据不兼容 | 向后兼容新增字段，避免立即删除旧字段 | 回滚代码前确认 migration 可兼容旧代码 |

## 12. PR 描述模板

```markdown
## Summary
- WP3: 认证与会话安全改造。
- 说明本 PR 覆盖的阶段：限流 / 失败锁定 / refresh cookie / token rotation / Web 登录态 / 测试。

## Scope
- 包含：
- 不包含：WP4 权限治理、WP5 财务 / 幂等、WP6 文件安全、WP7 IoT / WS 安全。

## Auth / Session Contract
- access token:
- refresh token:
- cookie:
- CSRF / CORS / SameSite:
- Web storage:
- mobile / non-browser compatibility:

## Verification
- [ ] pnpm test:unit
- [ ] pnpm --filter @jinhu/api test:unit -- auth
- [ ] pnpm lint
- [ ] pnpm typecheck
- [ ] pnpm build
- [ ] node scripts/e2e/auth-security-smoke.mjs

## Data / Side Effects
- 是否涉及 DB migration:
- 是否创建 session / refresh token / failed login 数据:
- 是否影响测试账号:

## Out of Scope
- 不包含 WP4 权限、模块授权、数据范围和字段权限治理。
- 不包含 WP5 财务 / 幂等。
- 不包含 WP6 文件安全。
- 不包含 WP7 IoT / WS 安全。
- 不包含 release-smoke / Docker 修复。

## Rollback
- 如何回退 API 保护:
- 如何回退 cookie / storage:
- 如何处理 migration:
- 如何清理或保留 token / session 数据:
```

## 13. 完成定义 DoD

WP3 实施阶段完成定义：

- 当前认证现状已记录。
- 目标 token / session contract 已明确。
- 限流策略明确。
- 失败锁定策略明确。
- refresh token cookie / rotation 策略明确。
- access token 前端存储策略明确。
- CSRF / CORS / SameSite 策略明确。
- auth unit 测试通过。
- auth smoke 测试通过或明确未执行原因。
- 未混入 WP4-WP8。
- 若涉及 migration，migration 和回滚策略明确。
- `pnpm test:unit` 通过。
- `pnpm lint` 通过。
- `pnpm typecheck` 通过。
- `pnpm build` 通过。
- `git diff --check` 通过。
- PR 描述记录验证结果、登录态影响和回滚策略。

本计划阶段完成定义：

- 仅新增 `docs/release/smartpark-review-remediation-wp3-plan.md`。
- 不修改认证代码。
- 不修改前端登录逻辑。
- 不修改 DB。
- 不新增 migration / seed。
- 不改 CI。
- 不跑 auth E2E。
- 不修改业务代码。

## 14. 本计划阶段交付

本阶段仅新增：

```text
docs/release/smartpark-review-remediation-wp3-plan.md
```

本阶段不修改认证代码，不修改前端登录逻辑，不修改 DB，不新增 migration / seed，不改 CI，不跑 auth E2E，不修改业务代码。

本阶段也不修改：

- `.github/workflows/**`
- `scripts/**`
- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- DTO / guard / strategy / controller / service 文件
- snapshot baseline
- 真实密钥、密码、token、生产连接串

进入实现阶段前，应重新确认当前 main、工作区状态、登录态兼容策略、是否需要 migration、cookie / CSRF / CORS 策略，以及 auth smoke 使用的隔离测试环境。
