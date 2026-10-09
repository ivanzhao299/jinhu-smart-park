# 验证结果

- API route/timing/projection contracts: 7 passed.
- Real isolated PostgreSQL integration: 1 passed, 0 skipped; original 000234/000245/000297 migrations, own/other/foreign park, immutable type and terminal state, same-version race, transactional audit rollback, drifted approval, returned edit/resubmit/approve, date-only correction and cancelled rejection. Random temporary DB removed and disposable lab stopped.
- Actual-component Web interactions: 12 passed; HR regression222 passed, 0 skipped.
- API/Web typecheck, lint, build PASS. Existing unrelated Next ESLint plugin/unused-disable warnings remain.
- Actual shared-CSS local synthetic browser desktop and390px PASS. Phone scrollWidth385 <= viewport390; all input/select/button controls44px. Explicit failure retains reason; original timing round-trips08:00 to same ISO.
- Integrated latest PR896 baseline3d264dd98; only parent child-list conflict resolved preserving all children; API/Web code auto-merged.
- No new DDL or migration replay on production, no historical import replay, no production test business writes.
- Existing full-repository/migration release-smoke not rerun locally; original migrations exercised only in focused disposable fixture; CI remains next gate.
- Real-role production UAT and complete source-rule equivalence remain pending. Audit retains timing/version and reasonChanged, not historic free-text reason content. Imported approved facts remain terminal under normal approval rules.

CI首轮发现旧M6静态测试对整个HrService禁止AS version，与本轮独立操作令牌内部查询冲突。按公开投影约束修正静态范围，保留保险字段白名单和考勤本人/他人/读者动态断言；补充本人可编辑投影仍无raw version。相关15项通过，业务代码未变化，重新提交完整CI。
