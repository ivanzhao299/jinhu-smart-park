# 实施与验证

1. 定向完整读取相关API/Web/shared规范和当前正式输入/运行/冻结来源实现；确认全部账套覆盖与逐项源结构，记录research，避免重新分析备份。
2. 实现单一正式计算来源准备复用及独立只算不发整月核对服务，保留全部正式入账约束；实现强类型DTO、权限、源绑定、完整性、审计与精确比较。
3. 实现现代工资页面完整工作流和全量核对导出；失败保留草稿及取消过期请求，桌面与390px可用。
4. 运行金额纯函数、权限单测、实际owned PostgreSQL+HTTP和完整正式运行回归；实际业务表无写入反例。执行相关lint/typecheck/build及Web交互，必要全套interaction。
5. 独立trellis-check全范围审查，修复后必要复验。浏览器真实组件验证合成边界；生产角色验收单独标记。
6. 最新main同步，提交PR，CI通过后按既有授权合并/全量部署，跟进原部署句柄，health后Docker清理且实际API/Web SHA一致。
7. 更新短checkpoint（目标、版本、变更、证据、运行句柄、局部业务待办、下一动作），整个人力资源长目标仍active。

真实月份金额试算依赖吴恩国确认实际正式规则和输入，只影响对应动作。不要要求再次确认月份/范围/负责人，不触碰已成功导入批次，不保存秘密/个人行到任务文件。


## Final integration correction

Full interaction validation exposed a shared export lifecycle defect. Deterministic React regressions prove that an old passive cleanup can cancel a newly committed context request, and an old pending request can prevent a new context export. ScopedLedgerExport now owns cancellation and visible state per context. Existing cancellation and duplicate protections remain. This bounded shared correction and its regression tests are included; no timeout, retry, skip or weakened coverage changes.
