# 绩效服务JSON数组修复与真实PostgreSQL回归（2026-10-02）

## 问题和修复

绩效周期创建将`applicableOrgIds`原生数组直接传给jsonb列；发布周期将目标版本列表原生数组直接传给`goal_snapshot`。pg驱动将数组按PostgreSQL数组编码，导致真实服务路径产生`22P02 invalid input syntax for type json`。修复只在这两个jsonb写入参数上使用`JSON.stringify`；UUID数组筛选参数保留原绑定方式。无需迁移、清库或重建业务数据。

新增`hr-performance-review.pg.spec.ts`在独立数据库直接调用规划及评价服务，保留原约束和触发器。普通单位测试默认跳过该库测试；必须明确开启，不能将跳过记为通过。

## 已完成验证

- 新工作树`pnpm install --frozen-lockfile`，shared构建，API类型检查、改动文件ESLint、API生产构建通过。shared解析到本工作树`packages/shared/dist/index.js`。
- 首次实际数据库运行失败于创建周期，保留失败证据。修复后原始迁移完整执行至320，实际服务测试3组通过、0失败、0跳过，测试于2026-10-02 19:23:21北京时间完成。
- 第一组经服务创建/发布配置及周期，自评→主管评价→校准→员工结果→确认/申诉；覆盖加权84.14、校准88.00、申诉通过90.00与驳回保留86.00、同人/跨园区拒绝、防自校准/自审、员工提前结果隐藏、并发自评/校准完成/签收各一次成功一次冲突、具体终态及提交不可变错误。员工版本摘要和工资/工资条/考勤数量无变化。
- 第二组通过仅用于临时库的通知失败触发器，证明提交、状态和动作记录一起回滚，移除失败注入后重试成功。
- 第三组真实查询配合审计失败替身，证明必要读审计失败时不返回评价或动作。没有将通知回滚称为应用审计写入原子性证明。
- 现有规划/评价合同14项通过。
- 5组字段映射和来源适配器合同通过；本次只更新已审查源码哈希及显式引用，字段、分母、信用和旧计算pending状态不变。
- 4组其余证据合同在候选及未修改主干280d0926均失败，错误码及首个错误定位一致：production-adapter的evidence allowlist、bs-ass-create的legacyPanel、calculation-print的legacyWebApi、frozen-manifest的knowhow private_stage证据。它们仍未通过，不用于证明旧业务等价。

临时数据库容器、测试凭据及故障注入触发器已清理。仅保留私有日志和不含生产数据的、按数据库源码树及迁移脚本hash绑定的空结构实验库缓存，供源码未变时复用；缓存不是生产状态证明。

## 实际执行入口

准备专用回环地址临时实验库，执行原迁移；明确提供POSTGRES_HOST/PORT/USER/PASSWORD/DB。测试要求主机为回环地址、数据库名匹配`jinhu_hr_migration_lab_*`，没有生产默认回退。

```sh
HR_PERFORMANCE_REVIEW_PG_REQUIRED=1 pnpm --filter @jinhu/api exec node --test --test-force-exit --test-reporter=tap --require ts-node/register src/modules/hr/hr-performance-review.pg.spec.ts
```

## 发布和验收边界

本轮修复尚未合并或部署生产；已发布280d0926仍含上述服务缺陷。原历史数据导入不受影响，没有重放导入或覆盖历史快照。前端代码与接口形状未修改，未重复前端构建和浏览器布局验证；真实岗位桌面/390px及HTTP鉴权/幂等重放仍待验收。服务事务测试使用合成principal和读审计替身，不等于真实RBAC账号验收。

旧玉舟批量计算默认参数、通配目标、全局写回、副作用及跨引擎舍入对照保持未完成，独立HR产品要求保持不变。
