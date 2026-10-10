# 执行计划

1. 已核对最新main9585258e及前次生产运行回执，洁净独立候选codex/hr-compensation-ledger-export-20261010；保留primary。
2. 必需trellis implement子代理实现API/Web/有意义的PG与交互测试；主代理只拥有task/checkpoint/浏览器证据，不并行编辑代码。只使用当前工作区，禁止子代理生产/提交/推送。
3. 读取本片API/Web相关spec和精确代码；按design实现。API/Web lint/typecheck及聚焦测试先跑，最终build与现有HR合同检查；保留私有原始日志，输出摘要。
4. 必需trellis check独立最后完整范围复核；必要自修后只重跑受影响检查。
5. 实际编译组件/CSS桌面1280与390px浏览器检查，明确合成API不等于真实生产验收。
6. 更新七段spec及父任务当前入口，diffcheck、fresh fetch、整合main、最终提交PR/CI，按既有授权串行合并部署，验证health/cleanup/APIWebruntime。

相关命令：pnpm --filter @jinhu/api lint/typecheck/build；具体node --test TScontract/PG入口沿现有package脚本确认；pnpm --filter @jinhu/web lint/typecheck/build；聚焦vitest及pnpm --filter @jinhu/web test:unit:hr。无DDL无需本地重复完整迁移历史，CI所需门禁以scope为准。

不能以已有分页测试证明全量一致快照；PG必须验证导出服务真实执行与并发更新，私有合成数据，容器结束清理。完成后记录变更文件、命令、结果、跳过及剩余业务验收。

当前验证：实际PostgreSQL两个测试（新完整导出含独立连接并发/5000边界/审计失败，以及原分页台账回归）通过；Web39项交互/CSV测试通过。API合同、lint/typecheck/build通过；Web lint/typecheck与既有HR合同通过，最终Web build按唯一当前句柄继续。最后完整范围复核及实际浏览器截图、CI/发布尚待执行，不提前记作上线。
