# B-2a C2 独立最终 Gate 签署（v12d）

> 日期：2026-08-01（Asia/Singapore）
>
> 结论：`C2 FINAL GATE = PASS`
>
> 唯一 runId：`b2ac2_v12_full_20260801d`

本文件是 C2 候选通过实现门禁、根代理离线复算及三方独立复审后的只追加签署记录。它不回写候选主证据的 pending review 字段，也不扩大 C2 的放行范围。

## 1. 冻结证据身份

| 证据 | SHA-256 | 字节数 |
|---|---|---:|
| v12d 主证据 | `b5169a6e2668d3a2491814f34dd6745e386056f721236160aa5fe331aae41e50` | 1831705 |
| v12d detached manifest | `67bca562e4b80a12b7fb9cde03e14eb622f27154e649b402c9a8f5f8a8065844` | 3805 |
| C2 detached final signoff JSON | `0be731ea41ffceddf050e3a4fac971ce4e03ef3c9cc8e6bbfe926cb565949274` | 4072 |
| `000194` migration | `93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0` | 以仓库原始字节为准 |
| v12d runner | `98e4c4719ab802e14f1e93c81af14e4f59c526981f1258334f1516b128079dcf` | 以仓库原始字节为准 |
| v12d static contract test | `5f0be48e3aee41aaf5b71883b856137c20106a8f29958e90caab59433e273df2` | 以仓库原始字节为准 |

主证据、5 个 sidecar 与 watchdog 均由 detached manifest 绑定；manifest `self_reference=false`。签署后不得改写这些候选文件。任何绑定源码变化都会使本签署失效并要求重新 Gate。

## 2. 三方独立复审

| 独立视角 | P0 | P1 | P2 | 结论 |
|---|---:|---:|---:|---|
| 架构 / 数据库 | 0 | 0 | 0 | ACCEPTED |
| 测试 / 安全 | 0 | 0 | 0 | ACCEPTED |
| 产品 / RBAC / 交互 | 0 | 0 | 1 | ACCEPTED |

产品/RBAC 复审者披露其曾参与 runner cleanup/deadline 修正，因此该结论仅基于冻结 v12d 产物的离线复算。唯一 P2 是同步最终状态的非阻塞文档事项：执行路线图和本 detached signoff 已更新；pre-run candidate template 保持不变，因为冻结 static contract 明确校验其 pending preparation 状态。该处置不改变候选身份，也不改写 v12c 失败历史。

```text
C2_open_P0_P1 = []
C2_final_gate = PASS
C3_release = allowed_approval_runtime_owner_only
C4_release = blocked_until_C3_independent_gate_passes
```

## 3. 验证结论

- 唯一 runId、主状态、空 findings、manifest 哈希链及字节数复算一致。
- 8 个动作均以 self 路径执行；40 次预热与 160 次实测全部成功、全部确认提交、零排除和替补、均未越过 5 秒单调时钟硬截止。
- 强制锁路径观察到预期 `55P03`，实际等待 4718.26ms，未越绝对截止，回滚快照一致。
- 两百万行 fixture 的 list/count/assignee/source 查询均无 Seq Scan，延迟和共享块均低于签署阈值。
- 负例、故障回滚、控制状态、历史保留、漂移拒绝、commit ambiguity、并发单赢家、权限与跨租户约束、60 秒 watchdog 均通过。
- Gate 自动清理后，哈希绑定证据证明精确容器 ID/名称和匿名卷均不存在。

## 4. 放行边界

C2 现在仅放行 C3 的 `approval-runtime-owner`：在 `apps/api/src/modules/property-approvals/**` 内抽取窄 mutation receipt port，并对既有 B-1、foundation 与 AppModule 执行合同 v2 重认证。C3 不得修改 `apps/api/src/app.module.ts` 或 foundation runtime code；若发现真实不兼容，必须另立 correction batch。

C4 仍被阻断。生产调用方 deadline/prospective guard、raw absent-head `23505` winner reread 与 API 归一化、真实 source adapter、生产 RBAC callsite 均未由 C2 证明。B-2c、B-3、B-4、B-5、Track C、浏览器/UAT 和生产发布也未通过。

## 5. 历史保留

v12、v12b 与 v12c 分别保留其原始失败或退回结论，不得被本签署覆盖。v12d 是首个同时通过完整实现门禁、精确清理、根代理复算与三方最终复审的 C2 候选。
