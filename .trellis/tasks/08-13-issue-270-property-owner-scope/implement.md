# 实施清单
- [ ] 同步 origin/main，确认 PR #263 和最新迁移编号。
- [ ] 列出全部遗留裸 FK，逐项确认是否已有后续复合约束。
- [ ] 编写 preflight、复合 unique/FK 和 validate migration。
- [ ] 更新 Track-B migration/constraint gate。
- [ ] 补跨 scope negative PG tests、空库与升级库验证。
- [ ] lint/typecheck/build/目标 tests/release smoke。
- [ ] 中文提交、Draft PR、Codex Review、CI 及线程闭环。
