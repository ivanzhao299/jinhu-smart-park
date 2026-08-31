# 身份治理硬伤组全链路 UAT 报告

## 结论

- 结果：**PASS**。
- 验收基线：`main@034b7317`（包含 F02-F05）。
- Issue：#521；父队列：#509。
- RUN_ID：`20260831-175319`。
- 执行范围：一次性本地 Compose、PostgreSQL、API、Web、文件卷和独立 Windows Chrome profile；未访问生产，未操作共享数据库、HR、主 Chrome 或其他所有者的容器。
- 本报告不包含口令、密钥、令牌、Cookie、Authorization 值、连接串、身份证明文、手机号或原始 Network payload。

## Phase 0 设计—实现审计

| 范围 | 验收依据 | 实现/证据入口 | 结论 |
| --- | --- | --- | --- |
| F01 密钥治理 | 缺失密钥 fail-fast；旧/新 keyring 均可解密 | API 启动负例；Party 加密与轮换 focused specs | PASS |
| F02 同意证据 | notice 版本进入事实；撤回形成不可变记录 | consent/governance focused specs；live API 与 DB 摘要 | PASS |
| F03 留存执行 | legacy 可分类；到期动作按策略执行 | schema/governance specs；`classify-legacy` 与 `execute-due` live API | PASS |
| F04 明文揭示 | 默认脱敏；独立权限、理由、审计；无权限响应无明文 | Party service/controller specs；live detail/reveal/audit | PASS |
| F05 住房门槛 | 建租约/签署不阻断；入住要求核验通过且同意有效 | housing gate specs；Property Housing E2E 正反例 | PASS |
| G1-G7 | 冻结映射覆盖菜单、模块、漂移、路由、会话、同源与 Property 回归 | Web/Auth gates；Property API Homestay/Housing suites；浏览器与 DB 证据 | PASS |

未发现阻断性设计—实现缺口。G1-G7 的冻结含义为：G1 权限—菜单四象限；G2 模块合法/禁用/时间窗/依赖；G3 元数据漂移与孤儿 fail-closed；G4 legacy/canonical landing 与 auth routing；G5 auth refresh/session convergence；G6 Chrome/API/DB 单一目标园区与 origin；G7 Property API、安全、maker-checker、文件与 scope 防回退。

## 隔离环境与预检

- Compose project：`jinhu-identity-uat-20260831-175319`。
- 一次性数据库：`jinhu_property_api_e2e_identity_20260831_175319`。
- isolated origin：`http://127.0.0.1:3300`；Chrome、API 与 DB 证据均绑定本次 RUN_ID 的单一隔离目标。
- loopback 端口：Web `3300`、API `3301`、PostgreSQL `55432`、CDP `9333`。
- Chrome：`151.0.7922.138`，独立 profile；实际桌面视口 `1424×865`，手机视口 `390×844`。
- 迁移 `279/279`、前置条件 `8/8`、最后迁移 `000288`；production-safe seed、bootstrap 后 strict baseline 均通过。bootstrap 前 strict baseline 仅按预期报告缺少首个管理员。
- API keyring fixture 第一次为非 JSON 格式而启动失败，第二次修正为合法 keyring 后健康；未进行第三次同题尝试。
- Property E2E 第一次在 preflight 因数据库名不满足隔离命名规则而拒绝、未运行 suite；复制到合规的一次性数据库后第二次通过。

## 自动化与运行态结果

| 检查 | 结果 |
| --- | --- |
| F01-F05 API focused specs | 59/59 PASS |
| G1/G4 Web 菜单 | 12/12 PASS |
| G4/G5 auth routing | 57/57 PASS |
| G5 auth session | 50/50 PASS |
| G7 Property gate contract | PASS |
| Property API Homestay suite | PASS |
| Property API Housing suite | PASS |

关键运行态断言：

- 缺少活动 Party 数据密钥时，一次性 API 进程退出码为 1，并以明确配置错误 fail-fast。
- keyring 轮换测试验证旧版本密文与新版本写入/读取兼容。
- Party 普通详情返回 200，存在脱敏值且不含身份证明文；无 reveal 权限的契约同样禁止明文字段。
- reveal 理由非法返回 400；合法理由返回 201。明文仅在受控响应内存中观察，未进入报告或持久化证据。数据库审计同时保留失败与成功事件，成功事件仅记录理由码。
- 同意撤回返回 201；数据库投影为 withdrawn，授权与撤回事实均带 notice 证据，撤回事实带 revoked 状态。
- `classify-legacy` 返回 201 并分类 2 条；为唯一指定 Party 的单条留存 assignment 设置到期夹具后，`execute-due` 扫描 1、hold 0、执行 `processing_restricted` 1。
- Housing E2E：未核验/未同意入住返回 409；核验通过且 `housing_move_in` 同意有效时入住成功。租约创建与签署仍可在入住门槛前完成。
- Homestay E2E：submission → claim → decision → check-in 全链通过；旧 verification endpoint 继续被契约禁止。

## 浏览器与 Network

- 使用独立 Windows headless Chrome 和隔离 profile；未使用主 Chrome。
- 首个完整 runner 因模板正则语法错误停止；第二个 runner 因遗漏星号转义在同一证据脚本位置停止。遵守同题最多两次规则，未发起第三次完整运行；随后仅从第二次已经认证的同一 tab 继续采集，不改变业务用例或产品状态。
- Party 详情桌面与手机视口均无横向溢出，显示脱敏身份号，不存在 18 位身份证模式。
- Network 共 8 条、失败 0；console error 0。
- 通过真实 UI logout 返回 `/login`，local/session storage 为空；最终页为 `about:blank`。
- 4 张截图均仅存本地证据目录，不提交仓库。

## 表冻结、残留与清理

- 从运行开始时间起，34 张表存在非零测试残留，覆盖 Homestay、Housing、Party/同意/核验/留存、占用、审批、安全、文件、登录与操作日志等链路。
- 枚举到 84 个 immutable/append-only trigger；未禁用 trigger，未执行 broad `DELETE`、`TRUNCATE` 或审计绕过。
- 留存到期动作造成的受限状态和所有不可变记录保留到卷销毁；未逐表伪清理。
- teardown 前精确归属为 3 个 project 容器、2 个 project 卷（数据库与业务文件存储）、1 个 project 网络；teardown 后均为 0，因此一次性业务 file root 随所属卷销毁。
- `3300/3301/55432/9333` 均关闭；Chrome 启动清单中的专用 PID 已不存在，专用 profile、一次性 env 与临时 runner 脚本均已删除。
- 既有 F02 PostgreSQL 容器在 teardown 前后保持同一容器 ID 与 running 状态，未被触碰。

## 证据与敏感扫描

- 本地证据根：`/tmp/jinhu-identity-uat-20260831-175319/`（不提交）。
- 该路径是刻意保留的证据根，不是已销毁的一次性业务文件卷；其中不再保留 env、登录 runner 或 Chrome profile。
- `SHA256SUMS` 包含 47 个保留文件并通过 `sha256sum -c`。
- 文本证据扫描未发现 JWT、数据库连接串或 18 位身份证明文。`Authorization`、`Bearer`、`Cookie` 的命中来自测试名称或响应头键名；未发现相应凭据值。
- 原始截图、日志、DB 摘要及 Network 摘要只留本机；本报告仅保留非敏感计数和结论。

## 最终判定

F01-F05、住房正反例、民宿实名链及 G1-G7 均通过；环境所有权、残留保留、证据完整性和精确 teardown 门禁通过。Issue #521 可由本报告 PR 关闭；父队列 #509 仅在报告 PR 合并、main CI/Deploy 双绿并完成全部任务归档后关闭。
