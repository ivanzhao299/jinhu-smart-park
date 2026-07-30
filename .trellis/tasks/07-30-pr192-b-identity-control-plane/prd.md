# PR192 B 身份与共享控制面

## 1. 目标

交付资产模块下唯一 Party canonical UI、实名身份 submission/snapshot 安全模型和
共享房产控制面，使住房租客与民宿住客共享同一受控个人档案，同时允许园区管理员
配置经营模式、查看共享占用与切换历史。

本任务不实现通用 workflow，也不拥有 approval runtime、跨领域 maker-checker 集成
或 migration/reconcile 脚本。B1 先提供 identity/property foundation API/runtime
core 和 Web 输入合同；check-in/domain adapters、canonical Web、shadow/final
reconcile 分别在后续 B2c、B3、B4 消费这些 handoff。

## 2. Canonical 产品表面

- `/assets/parties/[partyId]`：唯一 Party 详情、非敏感资料、身份维护、实名提交、
  核验结果和授权审计表面。
- `/assets/property-operations`：房源经营设置列表。
- `/assets/property-operations/[unitId]`：经营详情、阻断原因和模式申请入口。
- `/assets/property-occupancies` 与 `/assets/property-occupancies/[occupancyId]`：
  跨业态占用只读日历/详情。
- `/assets/property-mode-transitions`：模式切换历史。

`/housing/tenants/[partyId]`、民宿住客入口和任务深链均指向 canonical Party detail，
不得另建 housing/homestay identity CRUD。普通业务角色不得因此获得 generic
occupancy 写权限。

## 3. Party 四权分离

以下权限互不蕴含：

- `party:create`：创建非敏感基础档案。
- `party:update`：修改姓名、联系方式、同意状态、备注等非身份字段。
- `party:identity_update`：写入、修改或清除证件身份。
- `party:identity_verify`：核验 requested/pending submission。
- `party:sensitive_read`：读取授权后的完整敏感字段。

`party:create` 不得单独写身份字段；旧 payload 兼容期同时要求 create 与
identity_update。默认 built-in role 不同时授予 identity_update 和 identity_verify。
Verifier 不得核验本人 requested、recorded 或 submitted 的身份。搜索结果默认脱敏，
敏感读取不得隐含修改或核验。

## 4. Identity Submission 与 Snapshot

- 每个 Party 最多一个 active requested/pending-verification submission，数据库
  partial unique 或等价约束为最终并发权威。
- Submission 记录状态、actor、Party identity version、snapshot pointer 和 optimistic
  version；状态转换使用 expected status/version CAS。
- 进入待核验时同一 transaction freeze 不可变 snapshot。
- Snapshot 保存 document type、normalized identity hash、algorithm/version、加密
  payload reference/key/format、captured actor/time、protected file ID/version/SHA-256。
- 修改身份必须 supersede 旧 submission、递增 identity version 并创建新 snapshot；
  禁止就地覆盖已提交 snapshot。
- 密钥轮换只允许重加密 payload，不改变业务 hash/version/file snapshot。

Create、supersede、verify 按 Party → current submission → snapshot/file 的统一锁序
执行，并结合 CAS；并发失败返回可解释 409。

## 5. Check-in 原子合同

民宿 check-in transaction 必须：

1. 锁 booking。
2. 按稳定顺序锁所有 Party。
3. 锁 current verified submission 和 snapshot。
4. 重新验证 current pointer、identity version/hash/algorithm、document type、
   protected file versions、consent 和 booking scope。
5. 写入住状态与审计。

审计保存 submission ID/version、snapshot ID、identity version、algorithm 和 file
digest。核验后身份被 supersede、撤销、跨 scope 或附件变化时入住 fail closed。
不得在事务外预读后直接入住。

## 6. 共享房产控制面

- `asset` 是 homestay/housing_rental 的显式商业依赖，不自动启用。
- 有依赖模块时关闭 asset 返回 409；缺 asset 时启用依赖模块返回 409。
- 房源经营设置显示 live owning aggregates 与共享占用阻断，不只信任 projection。
- generic occupancy API 不能声明 homestay/housing/commercial leasing source。
- 普通订单/租约/保洁/维修通过 owning aggregate 管理占用。
- 模式切换和强制释放只从资产详情申请，Track B approval enforce 前不可直执。

## 7. 迁移、Shadow、兼容与回滚

Identity schema 与 migration 由 `schema-migration-owner` 独占；shared contract 由
`shared-contract-owner` 独占；reconcile 脚本由 `migration-reconcile-owner` 独占。
本任务只消费其 handoff 并实现 property foundation runtime；B1 不实现 Web。Web
需求和合同进入 `B-identity-ui-input SHA`，由父计划 B3 的
`shared-property-web-owner` 在 B2c 完成后实施。

迁移顺序：

```text
expand
→ compatibility adapter
→ change capture
→ deterministic backfill
→ mutation replay
→ shadow reconcile
→ per-tenant final lock/reconcile
→ enforce
```

Legacy submission 使用固定 namespace UUIDv5。Backfill 必须保留 legacy
actor/source/confidence，不伪造 verifier：

- verified + 完整 identity → verified snapshot/submission + current pointer。
- rejected + identity → rejected snapshot/submission。
- unverified + identity → pending verification。
- unverified + 无 identity → 不创建。
- terminal status 但 identity 不完整 → anomaly，禁止 enforce。

旧 Party create/update/verification API 保留两个发布周期并调用 canonical command；
旧宽权限不再授权身份修改或核验。Shadow 硬差异阈值为零。Rollback 只关闭 UI/enforce，
不删除 submission、snapshot、approval 或 audit，也不恢复同人核验和旧宽权限。

## 8. UX、字段与文件安全

- Party detail 分为资料、身份、核验、审计区块，每个区块独立 permission/query。
- 无 `party:sensitive_read` 时显示 masked/omitted projection；Web 不持有完整字段后
  自行脱敏。
- permission/module/tenant/park/scope 变化立即清除 picker cache、选中 Party、详情
  snapshot 和相关草稿。
- 身份文件使用 protected biz type；领域权限与 `file:read/upload/download` 和 Party/
  unit scope 相交。绑定与删除使用同一 file-row lock，禁止 dangling reference。
- 核验表单显示 immutable snapshot 版本，上传进行中不得提交；已提交证据只读。
- 所有高风险确认展示 Party、版本、影响和 actor 分离规则；成功/冲突可读屏宣布。
- 页面复用 `ds-*` 和共享上传/预览组件，支持 desktop/360/390、键盘和 WCAG 2.2 AA。

## 9. 分阶段交付

### 9.1 B1 Core Milestone

输出 `B-property-foundation-runtime SHA`，只包含：

- 已冻结 schema/shared contract 的消费。
- Party/identity canonical commands、projection 和 protected-file policy。
- Submission/snapshot、partial unique、锁序、CAS 和 identity verifier port。
- Property operations/control API runtime core 和 approval-required boundary。
- API/HTTP/DB contract tests。

同时输出只读的 `B-identity-ui-input SHA`，包含 Party/control canonical route、字段/
文件 projection、状态矩阵、permission 和 UX contract。B1 不包含 check-in adapter、
领域 maker-checker adapter、任何 Party/control Web 页面、shadow/backfill/final
reconcile。`B-property-foundation-runtime SHA` 可在这些后续能力之前交给 B2b。

### 9.2 后续 Milestones

- B2c：domain integrations 消费 foundation/runtime SHA，实现 check-in 和领域 adapters。
- B3：`shared-property-web-owner` 同时消费 UI input SHA 与 B2c handoff，实现全部
  Party/identity/control Web。
- B4：migration-reconcile 完成 backfill、shadow、final reconcile、rollback/re-enable。
- 上述全部通过后，另行输出 `B-identity-control-technical SHA`；它不是 B1 core SHA。

## 10. 不在范围

- approval execution/outbox/inbox、task assignment 的实现。
- 住房/民宿领域审批集成或账务迁移。
- 通用 workflow、公安或第三方实名服务。
- 破坏性 schema rollback。

## 11. 验收标准

- [ ] B1 可独立输出 `B-property-foundation-runtime SHA` 和
  `B-identity-ui-input SHA`，不等待 B2c/B3/B4。
- [ ] B1 core 不包含 Web、check-in/domain adapters 或 shadow/final reconcile。

- [ ] Party 只有一个 canonical detail；住房/民宿入口均深链或重定向到该页面。
- [ ] 四权 API/UI/字段/文件 exact-set 和最近越权 403 全通过。
- [ ] 每 Party 单 active submission DB 约束、锁序、CAS 和状态转换通过。
- [ ] Snapshot 不可变，supersede 创建新 version，旧 snapshot 可审计。
- [ ] Check-in 同 transaction 重验并记录 submission/snapshot/version/file digest。
- [ ] create/supersede/verify/check-in 并发和 TOCTOU 测试通过。
- [ ] Backfill 幂等可重跑，shadow zero-difference 后才允许 tenant enforce。
- [ ] 旧 API/client 两周期兼容，回退/re-enable 不丢 submission 或审计。
- [ ] 共享控制面、asset dependency、generic occupancy 禁写和 live blocker 通过。
- [ ] 模式切换/强制释放未接 approval 时 fail closed。
- [ ] 敏感字段与文件跨 tenant/park/scope 不泄露存在性。
- [ ] canonical UI 状态、移动、WCAG/DS 和 protected upload recovery 通过。
- [ ] Canonical Web 只在 B2c handoff 后由父计划 B3 owner 实施。
- [ ] 所有跨 owner handoff SHA 明确且 open P0/P1 为零。
