# PR192 房产业务产品化整改复审门禁

## 1. 复审范围

本父任务在创建前完成多轮只读审查，覆盖：

- 产品与功能设计。
- RBAC 和职责分离。
- UI、交互、移动端和无障碍。
- 开发与架构。
- QA、运营和真实用户代表。
- 独立反方/红队集成。

## 2. 专项 Gate

| Gate | 最终结果 | 主要闭合内容 |
|---|---|---|
| 产品/设计/RBAC | PASS | canonical IA、六层 manifest、bundle/role、asset 依赖、财务边界、maker-checker |
| UI/交互 | PASS | 无重复 terminal CRUD、逐页状态、deep-link、picker、任务队列、弱网、WCAG/DS |
| QA/运营/用户 | PASS | traceability、fixture、清理、性能、岗位指标、人工签署、证据 schema |
| 开发/架构 | PASS | Track 拆分、extract-first、response contract、façade、ownership、四槽调度、migration |
| Approval/Identity 架构复审 | PASS | execution lease、outbox/inbox、Party snapshot/锁序、backfill/reconcile/compatibility |

## 3. 红队记录

### 3.1 首轮红队：FAIL

发现七项 P0/P1：

1. DB commit 后 publisher/broker 失败可能错误触发 approval 领域重执行。
2. approval `status` 与 `execution_status` 构成未定义双状态源。
3. 任务队列被称为纯读 projection，却保存独立 claim/assignee。
4. V3–V5 能力未映射到唯一 Track/Gate/flag。
5. shared、migration、property-operations、approval ownership 重叠。
6. identity submission 缺不可变 identity snapshot 合同。
7. 自动化 E2E 与真实岗位 UAT/签署主体混淆。

闭合：

- 冻结 decision/execution 两字段合法组合、CHECK/CAS 和权威读取。
- DB transaction 成功后 approval 永久 executed；outbox/inbox 分离重试域。
- owning aggregate assignment 与专属 assignment aggregate 分离。
- 完全替换 Track、ownership 和四槽计划。
- 增加 immutable identity snapshot。
- 拆分 Codex 自动任务与 external human Gate。

### 3.2 V6 红队复审：FAIL

剩余两项 P1：

1. Track A 的完整 D18 数据集依赖尚未部署的 B schema。
2. Human UAT 被排在 C 之前，与 `codex_complete` 可独立完成冲突。

闭合：

- 数据集拆为 versioned `property-remediation-a-base-v1` 与 `property-remediation-b-extension-v1`，每个 Gate 只验证已部署 schema，并定义 combined checksum。
- B 拆为 technical Gate 与 Production Readiness Gate。
- C 只依赖 B technical SHA。
- Human UAT 改为可并行、可长期 awaiting 的外部泳道，不占常驻 subagent 槽。

### 3.3 V7 红队复审：PASS

独立红队最终仅返回：

```text
PASS
```

该结论只覆盖当时的规划版本。

### 3.4 A-C1 独立实现复审：重新打开 Stop-ship

独立复审在 shared contract 落地后发现：

1. Track A 只在 manifest 中声明 `blocked-until-track-b`，尚无 server-side
   `PROPERTY_WORKBENCH_V2=true` 409 boundary；按钮隐藏不足以 fail closed。
2. housing tenant list/create 的 Party `mobile`/`email` 与 manifest masked projection
   漂移。
3. homestay booking detail、credential issue/return 的 `credentialReference` 与
   manifest masked projection 漂移。

复审期间另发现 canonical metadata 缺失/不匹配时 safety policy 可能 fail open；
实现已改为依赖 canonical metadata 且缺失时拒绝，并补充负向合同测试。

2026-07-30 复审结果：**PASS / CLOSED**，`open_P0_P1=[]`。验证证据：

- focused tests：44/44 PASS。
- API lint、typecheck、build：PASS。
- Shared build：PASS。
- Web typecheck：PASS。
- diff check：PASS。

contract/server-safety baseline 已于 2026-07-30 冻结，精确 SHA：
`e709459a034807b3575db604a76bc69bf1c5ff5b`
（`feat(property): freeze Track A access safety baseline`）。A-1 仍为进行中，因为
在该 A-C1 checkpoint，A-C2 schema、API projection 与后置 Web 接入尚未按 Gate
完成；后续增量结论见 3.6。

### 3.5 A-C2 只读复审：发现顺序冲突并修正计划

2026-07-30 只读复审确认：计划中的 17 个 canonical Web routes 尚未落地，当前会命中
catch-all placeholder；因此 Web menu、landing 或 redirect 不能标记完成。复审将权威
顺序修正为：

1. A-C2 schema migration/exact tests（property permission exact set=65，不是 69；
   `000183_*` 仅为候选编号，创建前重扫并即时 reservation）。
2. API-only `/users/me` property projection（active enabled modules、granular page
   permission、current tenant+park relation；custom/legacy/wildcard 不自动扩权），
   Web 继续不可见。
3. shared Web foundation 与 A-base。
4. homestay/housing domain owners 实现真实 routes/guards 并分别输出 route SHA。
5. 收到两份 route SHA 后才实现 Web menu、legacy landing、housing tenant alias 与
   unknown property deep-link fail-closed；domain owners 保持 app routes/guards
   ownership，menu owner 不创建 placeholder 或领域 route。
6. route evidence 与独立 Gate。

本次结论是“计划顺序已修正”，不是 A-C2 实现通过。A-1 必须保持
`in_progress`，直到 schema、API projection、下游 Web 接入及相应 Gate 按阶段完成。

### 3.6 A-C2 DB Runtime Fixture 与 API Projection Gate：CLOSED / PASS

2026-07-30 在独立临时 PostgreSQL 容器与独立 volume 中完成 A-C2 增量技术复验：

- 以 `000176`–`000182` 为声明的隔离基线；
- `000183_property_business_granular_rbac.sql` 连续直跑两次通过；
- property permission exact set=65，二次运行后 definition、grant 与 timestamp 稳定；
- 多园区、module disabled、relation expired/missing/status-disabled 全部按当前
  tenant+park 和 active module 默认拒绝；
- custom role、legacy operations、wildcard 均不自动扩展 granular page permission；
- cross-scope permission assignment 与 role tenant 一致性通过，跨 tenant 错配拒绝；
- cleanup residual counters=`0|0|0|0`，临时容器和 volume 已删除。

增量独立 review 发现 container fallback 选择范围不够精确，已自修并 exact rerun：
fallback 绑定 exact run-id 与双 label、只接受 running container；容器使用
`docker run --rm`、official PostgreSQL image、显式 `POSTGRES_DB` 和匿名 volume；
任何数据库 URL override 均拒绝。复跑后 `open_P0_P1=[]`。

空库执行 `000175` 时按其生产数据补丁语义 fail-fast 并回滚；它不提供 A-C2 fixture
所需 schema，所以本次隔离基线跳过 `000175`。该处理不是把全量空库 migration chain
标为通过，而是明确限定本 Gate 只验证 `000176`–`000182` 基线上的 A-C2 切片。

结论：A-C2 migration + API-only `/users/me` projection slice 为
**CLOSED / TECHNICAL PASS**，`open_P0_P1=[]`。
A-1 仍为 `in_progress`，因为 shared Web foundation、两个 workbench、最终 Web
menu/landing/alias/deep-link 与 route evidence 尚未完成。

### 3.7 Shared Web 浏览器验收顺序复审：计划修正

只读复审发现：foundation 在 canonical domain route 之前要求真实 browser evidence，
会迫使实现者创建无业务归属的 preview/生产 route，与 route ownership 和六步顺序
冲突。决策为“延后到首个 domain route SHA”：

- foundation handoff 只要求纯函数/组件静态与单测、lint/typecheck/build；
- 不创建 preview route 或临时生产 route；
- 首个输出 canonical route SHA 的 homestay/housing owner 在真实 route 上执行
  desktop/mobile/keyboard/focus/zoom/ARIA；
- shared owner 负责组件缺陷修复和 final UI Gate 签收，QA owner 负责证据追溯；
- 证据未补齐前 foundation 可标 `handoff ready`，不得标 `final UI gate passed`。

该调整不改变既定六步顺序，A-1 继续保持 `in_progress`。

## 4. 方案落盘结论

本目录下的：

- `prd.md`
- `design.md`
- `implement.md`
- `review-gates.md`

构成唯一权威合并方案。会话中的 V2–V7 是评审演进记录，不作为实施时并列规范；如有冲突，以本目录文档为准。

## 5. 后续 Gate 规则

- 任一实施子任务开始前读取对应 Trellis spec。
- 每个 worker 必须有唯一文件 owner。
- 每个实现由不同 checker 审查。
- 任一 P0/P1 未关闭不得 handoff 或进入下一 Gate。
- 自动化 technical PASS 不代替真人 UAT。
- 只有 Production Readiness Gate PASS 才能开启高风险生产 enforce。
