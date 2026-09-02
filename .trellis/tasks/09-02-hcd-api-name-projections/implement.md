# Implementation Progress

## Dependency

PR1 已合入 main 并双绿；已从 `origin/main@422af8fa` 创建 `codex/fix-hcd-api-projections`。

- [x] 核验四条 API scope/字段权限/测试（双路只读探子，按 file:line 抽查）。
- [x] shared contract、API projection、Web 消费。
- [x] 权限裁剪/null/跨 scope 测试。
- [ ] trellis-check、PR、CI、merge、main 双绿。

## Validation Log

- PASS shared 全测 35/35。
- PASS PR2 API 定向 96/96：详情名称、候选 ID 恢复、任务姓名、采购名称、null、scope、字段策略裁剪。
- PASS Web homestay 18/18、housing 32/32。
- PASS API/Web typecheck、API/Web lint、`git diff --check`。
- 首次 API 全量测试在继承的 `NODE_ENV=production` 下为 1656 pass / 3 fail / 41 skip；3 项均为 auth refresh-cookie `secure=true` 与测试默认 `false` 冲突，未涉及 HCD。
- PASS 显式 `NODE_ENV=test pnpm --filter @jinhu/api test:unit`：1659 pass / 0 fail / 41 skip。
- 首轮独立复核发现并修复：民宿房源名称投影未排除软删除；列表订单/房态/周转仍有直接编号拼接路径。
- 第二轮独立复核确认 API tenant/park/ID scope 与软删除约束无 P0-P1；进一步封闭名称字段本身为 UUID 的脏数据回退，并将三类列表接线门禁改为精确调用次数。
- PASS 复核修正后 API 民宿定向 19/19、Web property 32/32、Web housing 32/32、API/Web typecheck、`git diff --check`。
