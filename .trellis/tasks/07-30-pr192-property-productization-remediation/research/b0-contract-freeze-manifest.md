# B-0 / B-2a C1 四输入合同冻结清单

> 结论：`C1 IMPLEMENTATION COMPLETE / INDEPENDENT FINAL RE-GATE PENDING`
>
> 日期：2026-08-01
>
> `implementation_release=blocked`

## 1. 签署输入与 superseded lineage

C1 唯一计划输入是三方已签署的 correction plan raw SHA：

```text
b89de6a675e9afdf7490861f8600898d2658dd5c26be6469ad93fcfdd95f93da
```

下列旧冻结值永久 superseded，只能作为 000194 correction lineage；不得授权 shared、filter、
migration、runtime 或后续 Track：

```text
old identity raw = f0af4c2d1cc7979ebc8c5d15f662cc299a698e1c0749393f180509bd0507239b
old runtime raw = 845e886fb1b3443431e5e18a6afac1c98b06080f4456829b7f2802819b2597f7
old product raw = 6624bebb7b9dd9972c574d1cf262d7adbc9080287463f3aa23e3832982b2371a
old physical raw = 34759fbca464e10d61cff03fcc2a2278bccbe8d50d47b35fbaa7b55d94f50f45
old B-contract SHA = a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8
```

更早的三输入/四输入摘要、route token、physical/security 与 scope 修正摘要均继承原 manifest
的 superseded 地位，不恢复为可消费合同。旧 `b0-contract-v1` grammar 同样永久 superseded。

## 2. C1 freeze raw SHA

Raw SHA 对文件未经 newline normalization 的原始 bytes 计算；四文件均要求 UTF-8、LF-only、无
BOM、final LF。顺序是 `b-contract-v2` 固定顺序，不按文件名字典序：

| 顺序 | 合同 | Raw file SHA-256 |
|---:|---|---|
| 1 | `b0-runtime-contract-freeze.md` | `1c61c425b709b4155423d6fff1a39ce778e995ff96aef41135df2c410b15b27d` |
| 2 | `b0-product-access-freeze.md` | `d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040` |
| 3 | `b0-identity-control-freeze.md` | `062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496` |
| 4 | `b0-schema-physical-addendum.md` | `3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5` |

## 3. `B-contract SHA` v2

唯一 grammar bytes：

```text
b-contract-v2\n
freeze<TAB>b0-runtime-contract-freeze.md<TAB>1c61c425b709b4155423d6fff1a39ce778e995ff96aef41135df2c410b15b27d\n
freeze<TAB>b0-product-access-freeze.md<TAB>d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040\n
freeze<TAB>b0-identity-control-freeze.md<TAB>062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496\n
freeze<TAB>b0-schema-physical-addendum.md<TAB>3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5\n
```

`<TAB>` 是单个 `0x09`，`\n` 是单个 LF `0x0a`；无 BOM，final LF。上述完整 bytes 的
SHA-256 为：

```text
B-contract SHA = 81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3
```

Manifest 不参与 B-contract；四份 freeze 也不嵌入该新 digest，避免自引用。Shared source SHA、
endpoint manifest SHA、property error filter SHA、000194/schema SHA、approval runtime SHA 与 task
runtime SHA 都是后续 sidecar，不得反向进入 B-contract。

## 4. 本次冻结覆盖

四份现行合同已统一冻结：

- 六状态、source success 从任一 active 关闭、字段清理与 version/epoch fencing；
- endpoint `authorizationAlternatives`、release/unblock OR evaluator 与完整 task read/queue scope；
- occupancy canonical `:occupancyId`；
- source-neutral resolver/descriptor/registry、production registry exact-empty 与 test-only fixture 边界；
- task-key-v1、UUIDv5 taskId、exact wire、error/details/recovery allowlist；
- terminal actor/clientKey/requestHash、active execute 与 same-terminal current-1 existing-only replay；
- manual-rebuild/authority-sync 双 mode replacement、唯一锁序、resultRef、immutable audit 与 retention；
- `000194` correction、191/192 B-2c ownership、C2 隔离链与 B-4 integration DAG；
- `b-contract-v2`、endpoint/function/runtime/call-site/error-filter 的 handoff grammar 与诚实安全边界。

## 5. 放行边界

Freeze owner 已完成五份文档冻结与机械摘要；后续串行 owner 已完成 shared contract 与 property
error filter 实现。完整 handoff sidecar 及其 raw SHA 是：

| Sidecar | Raw SHA-256 |
|---|---|
| `.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-shared-contract-handoff.md` | `a9a9d7bbac595a852483774b2a7883055a925e36f621e26359670cffb0ca9371` |
| `.trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-error-filter-handoff.md` | `9ca15ef645574a8c86a3f0cd5c3cdd238aa55ac0dddab99fae9be140275b16c2` |

```text
B-shared-source SHA = b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a
B-endpoint-manifest SHA = 6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd
B-property-error-filter SHA = ff28353767c7f44acf7a57561be3f1750e4ff8d117377aa46a393d8845abfad0
```

Filter handoff 已消费以下独立 HTTP no-existence-leak 子门禁证据：

| HTTP Gate artifact | Raw SHA-256 |
|---|---|
| `b2a-c1-http-leak-gate-contract.md` | `154bd35bff64559e7617231f5d9286e05e187140fbc888b66d689d918424dbbc` |
| `b2a-c1-http-leak-gate-signoff.md` | `736c73e298f341dbd91a16f69773920715b0b568e432b5172e0452bc4be325cb` |
| `b2a-c1-http-leak-gate-artifact.json` | `de84c656bad5d384532573a0d69dc050f19d56e7f01a331748ad01ad833e7a27` |
| `b2a-c1-http-leak-gate-evidence.md` | `87f3d10b9cc4c5c1ceb6452ea30752f95602d3b7a4427d9bb716b98270bbb744` |

该子门禁为真实 Nest HTTP 11/11 与结构 timing PASS；canonical artifact 已采用 owner-token 原子
防覆盖，无 artifact 环境变量的 reviewer 运行前后 raw/mtime 不变。旧 `3a02d03...f4a1b`、
`fe539fff...f542f`、`25ec734a...6e13` 均为 superseded/non-authoritative。该子门禁不参与
B-contract，也不替代仍待执行的独立 C1 final re-Gate。

本 manifest 与两个 sidecar 均不参与 `b-contract-v2`；`B-contract SHA` 仍只由第 2 节四个
freeze raw 按固定顺序计算。以上是 owner implementation-complete 证据，不是独立 Gate 签字。
本批次没有创建 migration/runtime，也没有启动数据库。下一步必须由独立 architecture、
product/RBAC、test/security reviewer 复算五份 freeze/manifest、两个 sidecar、shared/filter exact
file set 及其所有 digest，并关闭 P0/P1；通过前：

```text
C1_freeze_owner_complete = true
C1_shared_owner_complete = true
C1_filter_owner_complete = true
C1_independent_final_regate = pending
C1_open_P0_P1 = unknown_until_review
shared_implementation = complete_but_not_independently_released
filter_implementation = complete_but_not_independently_released
migration_000194 = blocked
runtime_implementation = blocked
production_enforce = forbidden
```

独立 final re-Gate 通过后，schema owner 与 runtime owner 才可遵守 correction plan 进入后续批次，
不得并行越过前置 Gate。当前不得宣称 C1 或 C2 PASS。技术 PASS 不替代真实岗位 UAT、生产发布、
安全/财务负责人签署或 Track C privilege hardening。
