# 园区切换权限修复队列

## Goal

按 `docs/reviews/park-switch-permission-investigation-2026-08-28.md` 和已批准 D1–D5，串行完成园区切换权限修复、历史 access-only 审计清单、S3 证据 reconciliation 与三修复上线后的完整 UAT。

## Requirements

- 顺序固定：PSW-001 → PSW-002 → PSW-003 → D5/S3 收尾 → 三修复 UAT。
- 每个 PSW 都使用独立 GitHub Issue、Trellis 子任务、`codex/fix-psw-*` 分支和关闭 Issue 的 PR。
- D1：仅受保护 `SUPER_ADMIN` 是同租户所有园区（含未来园区）的控制面身份；普通角色和自定义/literal wildcard 不提升。
- D2：access-only 是合法持久状态，但 UI 明示“可切换但无业务角色”。
- D3：access-only 目标园区使用专用可恢复空态，不伪装通用 403。
- D4/D5：不做默认角色继承；历史 access-only 仅出只读审计清单，由管理员逐园区确认。
- 不碰 HR 系列、生产环境、他人容器/Chrome；不伪造证据；同题最多两次；敏感信息不入报告。
- 长任务每段进度与续跑点写入各子任务 `implement.md`。

## Acceptance Criteria

- [ ] PSW-001/002/003 各自通过 review（最多 3 轮）、CI、合入 main，且 main 双绿。
- [ ] D5 历史 access-only 审计清单可由管理员复核，不自动授予权限。
- [ ] S3 使用单一 Park ID 重跑或对齐原始 artifact，权威报告无双 ID 歧义。
- [ ] 最终 UAT 重验 S1a/S1b/S2/S3，并抽查 G1–G7 与成熟基建全套；FAIL 如实保留。
- [ ] 全 PASS 后归档三个修复任务与调查遗留项。

## Child map

- `08-28-psw-001-tenant-super`：当前唯一激活目标，GitHub #463。
- PSW-002/003 在前序 PR 合入且 main 双绿后分别创建，避免并行改变授权语义。

## Source baseline

- 用户提供调查合入基线：`main@07a27b45`。
- 本任务创建时远端已前进至 `origin/main@0ee4b471`，PSW-001 分支从该最新提交创建。
