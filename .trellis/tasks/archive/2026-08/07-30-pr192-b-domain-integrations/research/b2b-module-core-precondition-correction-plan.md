# B-2b module-core 前置门禁纠偏计划

状态：复审退回后修订，待重新独立复审  
适用阶段：B-2b 前置门禁及 B-extension-core  
结论：在独立 `B-module-core SHA` 完成签署前，B-2b 保持 fail-closed，不创建 fixture、不启动临时 PostgreSQL、不生成组合校验和。

## 1. 纠偏原因

既定路线要求 B-2b 同时消费共享房产、审批、任务三个 runtime handoff，以及独立的 module-core、B-schema-expand 和 A-base-core 权威输入。现有 B-0.5 结果只记录 `moduleDependency.status=PASS`，没有单独的 module-core grammar、可复算 SHA、owner handoff 和独立签署，因此不能作为 B-2b 的规范输入。

该缺口仅补齐门禁与证据，不扩大业务范围，不修改既有模块依赖行为。

## 2. 阶段 M：补签 B-module-core

### M1 输入冻结

- 冻结当前 `apps/api/src/modules/saas-modules/**` 完整 14 文件路径集。
- 冻结 `B-contract-v2`：`e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944`。
- 冻结 `B-schema-expand`：`53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874`。
- 冻结 `B-high-risk-stopship`：`d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8`。
- Runtime effect manifest 没有独立 byte grammar；唯一权威是当前
  `b0-runtime-contract-freeze.md` 原始 SHA：
  `47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf`。
- 冻结 `000189_property_b_module_rbac_definitions.sql` 原始 SHA：`f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2`。
- 完整 module tree 为 14 文件，其中生产文件 13、targeted spec 1。
- grammar 的精确字节格式为：首行 literal `b-module-core-v1\n`；随后以仓库根
  相对 POSIX 路径按 UTF-8 byte/`LC_ALL=C` 升序，每行
  `relative-path<TAB>bytes<TAB>raw-sha256<LF>`；包含 13 个生产文件和 1 个 spec；
  文件末尾必须有且仅有一个 LF。

### M2 独立门禁

- 运行 module dependency targeted spec，验证 hard dependency、完整 active predicate、锁顺序、稳定 409 冲突和 enabled/status 一致性。
- 新增独立临时 PostgreSQL 16/Nest 行为 Gate，验证并发 enable/disable、advisory
  lock、active predicate、跨租户/园区隔离、事务回滚、superuser 不绕过依赖和稳定
  `module-dependency-conflict` 409；该 Gate 必须先于 module-core 签署，不能由 F 阶段替代。
- 运行 API typecheck、API build、目标 ESLint。
- 对 `000189` 执行模块依赖/RBAC 合同断言。
- 校验完整 module tree 仍为准确 14 文件（生产 13、spec 1），且门禁过程未改业务源码、migration、seed、shared 或 Web。
- 只有全部通过且 `open_P0_P1=[]`，才生成 `b-module-core-v1.grammar` 和独立 handoff signoff；grammar 的 LF 原始字节 SHA 即唯一 `B-module-core SHA`。
- M 阶段 PG Gate 必须复用 `bootstrap/ephemeral-postgres.mjs`，使用唯一 runId、
  `--rm`、`127.0.0.1::5432` 随机端口、官方 `postgres:16-alpine`、双精确 label 和
  单匿名卷。Docker 返回 ID 后，inspect 的 ID/name/labels/image/DB/port/volume 全部
  一致才取得 cleanup authority；失败/中断时只按重新校验的精确 ID 清理。

## 3. 阶段 F：B-extension-core fixture 与 validation

### F1 写前 fail-closed

在 Docker、数据库或 fixture 写入前，逐项复算并验证：

- B-2a superseding combined signoff。
- A-base handoff、profile、generator 和准确 A-base checksum。
- 当前 B contract、B-schema-expand、000185–000190、000193–000195 签名迁移集合。
- 当前 foundation runtime v2、approval runtime v2、task runtime handoff。
- 新签署的 `B-module-core SHA`。
- `B-high-risk-stopship SHA` 和当前 runtime effect manifest 原始 SHA。
- `000191`、`000192` 必须仍为 reserved/absent。

任一名称、owner、路径、字节数、原始 SHA 或内嵌 canonical SHA 不一致时，在创建容器和写 fixture 前终止。
同一份输入冻结须在 `before-container`、`after-local`、`after-pg`、`after-cleanup`
四个阶段逐字复算相等；任一阶段漂移即失败，不得发布混合证据。

### F2 实现边界

- B-extension 测试实现与证据放在独立目录，不进入 A-base generator 已冻结扫描范围。
- 只新增 fixture/profile、mutation manifest、validator、runner 和 runner spec。
- 不修改 runtime、Web、shared、migration 或 seed；不运行生产/开发 seed。
- 首版 A-base `expected_mutations=[]`；发现确需修改 A 数据时必须退回独立复审，不得静默放宽。

### F3 临时 PostgreSQL 门禁

- 每次使用唯一 runId、排他 reservation、精确容器标签、随机本机端口和单一匿名卷。
- 强制复用 `bootstrap/ephemeral-postgres.mjs`；容器必须使用 `--rm`、
  `127.0.0.1::5432` 随机端口、官方 `postgres:16-alpine`、双精确 label、单匿名卷，
  禁止外部/共享数据库 URL。
- Docker 返回 ID 后必须 inspect 并确认 ID、name、labels、image、DB、port、volume
  完全一致，之后才取得 cleanup authority；失败/中断时只按重新校验的精确 ID
  清理，禁止按名称、label 或 glob 批量清理。
- 迁移顺序固定为 A-base bootstrap → `000184` → `000185`–`000190` →
  `000193`–`000195`；`000191`/`000192` 必须 absent。记录每个当前 raw SHA、成功
  history，随后直接重跑迁移并证明 exact no-op。
- 执行 B-extension provision、同库重跑、cleanup、再次 provision；所有输出必须确定且可复算。
- 成功、失败和中断路径只清理本 run 的精确容器与匿名卷，并确认最终不存在。

### F4 验收矩阵

- 输入：缺一或错一时容器创建数和 fixture 写入数均为零。
- 确定性：两个全新数据库 run 的 B data、mutation、fixture、A+B combined SHA 完全一致。
- 重跑：decision、effect、task、outbox、inbox、DLQ 均无重复。
- 身份：六个 submission 状态
  `draft/pending_verification/verified/rejected/withdrawn/superseded` 各 1 行，精确键、
  current 指针、snapshot/file 关联和 canonical row SHA 冻结。
- 审批：冻结满足 `ck_biz_property_approval_request_status_pair` 的 11 行联合矩阵：
  `draft/submitted/pending_approval` 分别配 `not_started`；五行 `approved` 分别配
  `executing/retry_wait/executed/execution_failed/infra_exhausted`；
  `rejected/withdrawn/expired` 分别配 `not_required`。精确计数为 decision
  `approved=5`、其余各 1，execution `not_started=3`、`not_required=3`、其余各 1；
  每行按数据库 CHECK 冻结 claim epoch/token、retry schedule/count、executed time、
  error code/detail、infra exhaustion、effect/receipt 等必需或禁止字段。另冻结
  maker-checker allow/deny 各 1，claim current/stale 各 1，过期版本、跨租户/园区各
  1 个拒绝场景；execution effect 和 receipt 精确键集合、行数、字段及 SHA 冻结。
- 任务：六个状态 `open/claimed/in_progress/blocked/closed/cancelled` 各 1 行；claim
  race 与 lease reclaim 各 2 个竞争者且唯一成功数=1；active-key、epoch/token、
  source version、projection rebuild 行数/内容/SHA 精确相等。
- 消息：notification delivery 五状态
  `pending/delivering/delivered/delivery_failed/delivery_exhausted` 各 1；event incident
  四状态 `active/replaying/resolved/quarantined` 各 1；publisher/consumer DLQ 各 1；
  inbox duplicate、out-of-order deferred、outbox crash、DLQ replay 各 1 场景，所有
  event key、attempt、status、field set 和 canonical row SHA 冻结，重复副作用数=0。
- 对账：A-base 17 个逻辑表逐表冻结 count 与 canonical row SHA，并覆盖其物理测试
  文件清单；before=after=post-cleanup，未声明新增/修改/删除行均为 0。
- 清理：B-extension residual、容器、匿名卷、临时锁和未签 fixture 残留均为零；
  正式 reservation 以 `0600` 保留并参与不可变证据链。
- 证据：fixture SHA、validation SHA、combined checksum、artifact/manifest/reservation SHA 链闭合且权限为 `0600`。

## 4. 放行条件

1. 两名独立 reviewer 对本纠偏计划给出 GO，P0/P1/P2 均为零。
2. M 阶段独立门禁 PASS，发布唯一 `B-module-core SHA`。
3. F 阶段 qa-automation 与 migration-reconcile 分别发布 `B-extension-core fixture SHA` 和 `B-extension-core validation SHA`。
4. 两份 B-2b SHA 独立复审 PASS 且 `open_P0_P1=[]` 后，才允许进入 B-2c。

## 5. 禁止事项

- 不得用旧 B-0.5 combined/foundation SHA 冒充 module-core。
- 不得先虚构或预留候选 module-core/fixture/validation SHA。
- 不得创建、修改或提前执行 `000191`、`000192`。
- 不得运行 seed，不得使用共享或生产数据库。
- 不得使用宽泛 Docker 清理、`TRUNCATE`、`DROP` 或无确定键删除。
- 门禁失败时保留不可变失败证据，B-2c 继续 blocked。
