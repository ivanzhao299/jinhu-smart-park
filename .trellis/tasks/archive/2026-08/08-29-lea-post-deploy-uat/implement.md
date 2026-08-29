# LEA post-deploy UAT execution

## Ordered checklist

- [x] 调查并选定既有 UAT/browser harness、fixture、cleanup 与报告模板。
- [x] Phase 0：基线 SHA/CI/Deploy、端口/容器/profile 隔离、依赖与账号预检。
- [x] 建立唯一 run-id、表冻结清单、截图/Network manifest 与精确 cleanup plan。
- [x] 执行 mode×用途矩阵与 picker reasons/facet。
- [x] 执行改名菜单/权限/403 与 390px 检查。
- [x] 执行住房/民宿生命周期并采集 rental_status DB before/after + 双写审计。
- [x] 抽查 G1-G7 与双业务主链防回退。
- [x] 精确清理、teardown、核验无残留；生成脱敏报告。
- [x] Trellis check、报告提交、PR Closes #496、CI/review/merge/main 双绿。
- [x] 归档 UAT、队列与遗留调查任务，写终报。

## Resume point

- 2026-08-29：LEA-004 PR #490 merged `48204327`；最新包含提交 main `c806ce38` 的 CI `33253628779`、Deploy `33253628787` SUCCESS。
- 2026-08-29：Issue #496、证据分支与 Trellis 任务已创建；分支基于 `c806ce38` 并携带 LEA-004 archive/journal。
- 2026-08-29：主 Property API gate、办公 mode×用途/住房全链、17 页 390px Chrome、403、137 条 Network、DB 双写审计与两轮 teardown 全部 PASS。
- 2026-08-30：UAT 证据 PR #504 经 3 轮 review 收敛后合并为 main `d6f67966`；PR CI `33258693052`、main CI `33260301557`、Deploy `33260301563` 全部 SUCCESS。
- 续跑点：队列全部完成；归档 UAT 与 intake queue，提交归档 PR 后输出终报。
