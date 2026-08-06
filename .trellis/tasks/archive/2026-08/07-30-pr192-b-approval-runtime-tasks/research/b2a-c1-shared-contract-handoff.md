# B-2a C1 shared contract owner handoff

> 日期：2026-08-01
>
> 结论：`C1 SHARED IMPLEMENTATION COMPLETE / INDEPENDENT C1 RE-GATE PENDING`
>
> `implementation_release=blocked`

## 1. 基线与已消费合同

```text
base commit = 0152616fb9a25effdff68fa9da24fea7db8a21a7
B-contract SHA = 81e5080fd75d19ffa8abb27628f71785fe1c8bb8981b7285cd52b062fbf59af3
B-endpoint-manifest SHA = 6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd
runtime freeze raw = 1c61c425b709b4155423d6fff1a39ce778e995ff96aef41135df2c410b15b27d
product freeze raw = d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040
identity freeze raw = 062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496
physical freeze raw = 3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5
```

四 raw 按 `b-contract-v2` 固定顺序、单个 TAB 与 LF、final LF 重新聚合后得到上述
`B-contract SHA`。Endpoint golden 对 49 行按 method + TAB + canonical route 的 UTF-8 bytes
排序、对 canonical JSON 逐行求 SHA-256，再按 `b-endpoint-manifest-v2` 聚合；复算值与 shared
常量相同。Manifest/本 sidecar 均不进入 B-contract。

## 2. `b-shared-source-v1` exact file set

以下顺序固定。Raw SHA 针对未经 newline normalization 的原始文件 bytes：

| 顺序 | Path | Raw SHA-256 |
|---:|---|---|
| 1 | `packages/shared/src/property-business/access-manifest.ts` | `a7ca65ad970795dc82c237f6f8c2d966d9ae98c14a7697309800a04d60ca252f` |
| 2 | `packages/shared/src/property-business/index.ts` | `e6d9449683271e325bf5185665a946033e4e30641a0b57b6f1994f69d4886231` |
| 3 | `packages/shared/src/property-business/permission-bundles.ts` | `6c0ca347471d0136f6575db748b7bf34c900c8037cadded72d00e0998f16c158` |
| 4 | `packages/shared/src/property-business/permissions.ts` | `32486d858a5bf1d7f7192274fd7a0ab0b1ab32e08aaae070f3ed388e951c43d1` |
| 5 | `packages/shared/src/property-business/property-task-contracts.ts` | `6e136d9c32ddb569428dd018e2bdf31feba83370a5044b6b614c62df6e5cdf5b` |
| 6 | `packages/shared/src/property-business/response-contracts.ts` | `972657fa55b279d05cedd203c03da4c1c6214a8ebb5c4effa6d1936152edae61` |
| 7 | `packages/shared/src/property-business/routes.ts` | `b8961d9d066b8ac894c4948374a5b71d4ec386dfe4995df09f6d16fff97d7712` |
| 8 | `packages/shared/src/property-business/track-b-contracts.ts` | `3f99c18556a975f1c74befbc95f15e541a043c7f58b9ed3e2d4c93f6d8729b6b` |
| 9 | `packages/shared/src/property-business/track-b-endpoint-permissions.ts` | `12e5f5243628ca9b3b443360505a4f83d38712ac60ec52c42982e24340a6d586` |
| 10 | `packages/shared/src/property-business/track-b-routes.ts` | `6f13f25e0d87822058259f027b9af967508564a202f37170667048b503617bfb` |

唯一 grammar bytes 为：header `b-shared-source-v1` + LF，随后对上表每行写入
`file<TAB><path><TAB><raw-sha256><LF>`；UTF-8、单个 TAB、LF-only、无 BOM、final LF。
该完整 bytes 的 SHA-256 为：

```text
B-shared-source SHA = b4930006f4e9bef6f2976ab5b0e1a5127561cdb6576c464650ac82cf0864056a
```

逐文件检查均为 UTF-8、LF-only、无 BOM、final LF。未把 tests、dist、本 sidecar 或 contract
manifest 纳入该 exact file set。

## 3. 验证证据

以下命令均在仓库根目录、Node.js 20.20.2、pnpm 9.12.0 下重新执行：

| 命令 | 结果 |
|---|---|
| `pnpm --filter @jinhu/shared build` | PASS；TypeScript build 退出码 0 |
| `pnpm --filter @jinhu/shared test` | PASS；4/4 test files 通过，0 failed |
| `pnpm --filter @jinhu/shared typecheck` | PASS；退出码 0 |
| `pnpm --filter @jinhu/shared lint` | PASS；退出码 0 |

Shared tests 覆盖：49-row endpoint exact set、release/unblock 的 OR authorization、task wire
字段/null/omitted/order golden、source/queue/module/user-park fail-closed、terminal assignmentVersion
约束、source registry 约束以及 route token。新增 ABI golden 明确 receipt port 直接接受共享
`EntityManager` object boundary，并保持 acquire/replay/complete wire 不漂移；calendar golden 同时拒绝
非法月日、非闰年 2 月 29 日、`24:00`、无毫秒 UTC 等别名，并接受真实闰日与月末 canonical
UTC millisecond ISO。Production source registry 固定 exact-empty；所有 resolver/deep-link 实例只使用
`test_fixture_*` 并由 test-fixture registry 构造，未进入 production registration graph。这里的
fixture 证明不等于真实民宿/住房 source adapter；后者仍属于 B-2c。

```text
known_failures = []
owner_open_P0_P1 = []
independent_C1_regate = pending
```

本 handoff 只证明 shared owner 批次已完成；独立 C1 re-Gate 通过前，不得宣称 C1、C2、B-2a
runtime 或 production enforcement PASS，也不得以本 sidecar 代替岗位 UAT。
