# 验证记录

范围：岗位变更候选检索与正式表单选择；不重跑历史数据导入，不向生产写入测试人事变更。

初始 Web 交互54/54通过（岗位变更17、合同12、清单11、人才14）。初始Web类型检查通过。

初始实际组件浏览器：521条合成员工，姓名/工号检索0501可选EMP-501；搜索无匹配后仍保留选中员工及申请名称。390px框架内html clientWidth385=scrollWidth385，无横向溢出。独立检查修改结束后重新编译核对最终源代码。

独立检查进行中：严格分页DTO、真实隔离PG范围/分页/审计失败及共享选择器兼容。

发布前置：PR927已合并5628de9225d5dd9b6ba6c726c28473d883188460，部署38019608190进行中；本项需整合正式最新main并等待前项API/Web独立运行核验后再顺序发布。

真实岗位办理和实际工资月份核对仍独立待验收；以上合成证据不作为整体复现完成证明。用量不可用。

## 最终代码验证

- 独立check修正严格分页参数及搜索通配符转义。实际PG1/1：522名TEAM员工27页互不重复，页26首名EMP-0501，工号搜索/字面通配符匹配，PARK和foreignpark范围，审计失败拒绝。临时schema已清除，本任务PG容器/网络已移除。
- API DTO/service和既有合同3/3；API/Web typecheck及受影响文件ESLint通过。
- `pnpm --filter @jinhu/web test:unit:interaction` 指定岗位变更/合同/清单/人才/转正/奖惩6文件：86/86通过。
- `pnpm --filter @jinhu/web test:unit:hr`：238/238通过。
- `pnpm --filter @jinhu/api build`及`pnpm --filter @jinhu/web build`通过；仅既存canteen-peripherals.ts无关eslint-disable警告。
- 最终实际组件编译后浏览器：桌面501选中后搜索无结果仍保留员工和申请名称；390px手机可检索选择501，clientWidth385=scrollWidth385。截图及源hash保存私有artifact目录。
- 未向生产写入测试人事变更，未重放历史导入。真实岗位操作验收保留。
