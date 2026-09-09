# Implementation Plan

- [x] 从 `dcd9a9cf` 建立专用分支，核实 bearer probe 与 browser contract。
- [x] 复核原 30 Case 定义、L-04 case file 和隔离运行手册；补齐断言语义与本轮 fixture ID 解析。
- [x] 检查现存进程/容器/端口，启动本轮唯一 disposable PG/API/Web/Chromium 链，完成 migrate/seed/bootstrap/fixtures。
- [x] 执行一次主 27×2 矩阵，保存脱敏 report/screenshots/DOM/Network/SHA-256 manifest；完成 teardown。
- [x] 逐图人工隐私复核并对所有文本 artifact 执行敏感信息扫描；发现泄漏先删除或脱敏。
- [x] 将 30 Case 从本轮证据裁为 PASS/FAIL；若有范围内缺陷，按同根因 ≤2 修复并针对性复验；范围外问题登记 Issue。
- [x] 更新 HCD UAT 终版并保留四轮基建史；运行 browser contract、相关产品测试和最终质量门禁。
- [ ] 提交、push 当前分支、创建报告 PR，完成最多三轮 review 与 CI；squash merge。
- [ ] 按常设门禁规则观察 main，关闭 Issue，归档 Trellis 任务并记录 journal；输出完整矩阵、证据索引、修复、遗留和 Cost Summary。

## Rollback / safety points

- 运行前后按 run label 精确列举资源；绝不删除未知容器、volume、profile 或监听进程。
- artifact 保持 ignored/mode 0600；临时秘密文件在 teardown 精确删除。
- 产品修复仅限 HCD 显示链；任何超范围行为回退到 Issue，不扩大实现。
- 同根因第三次失败进入 focused root-cause audit/COST_GUARD，不盲目重跑。
