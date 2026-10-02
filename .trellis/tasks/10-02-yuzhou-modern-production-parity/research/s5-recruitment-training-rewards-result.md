# S5 招聘、培训、奖惩实际数据库验证（2026-10-02）

基线为生产已发布提交 `280d0926103fcb3d5c1c98e7eeaf3d7255c0da9c`。本轮验证已有实现，没有修改应用服务、页面或迁移，不增加旧功能等价信用。

## 结果与覆盖

专用回环地址临时 PostgreSQL 16 空库，运行原 `scripts/db-migrate.sh` 至000320，保留原约束及触发器。仅准备合成组织供招聘测试使用，未执行生产seed或历史导入。测试文件顺序执行，避免共享数据计数相互影响。

| 领域 | 实际测试 | 已验证行为 |
| --- | --- | --- |
| 招聘 | 1通过 | 候选阶段→转员工；跨园区拒绝；并发转换只成功一次；创建待入职员工及5项清单；不创建登录账号、不联动工资/绩效/消息；转换回执禁止修改 |
| 培训 | 1通过 | 发布课程事实冻结；后续课程版本不影响原计划；并发完成只成功一次；两次更正保留版本并展示最新结果；已完成结果禁止直接覆盖；不改员工状态或工资绩效 |
| 奖惩 | 3通过 | 审批并发只成功一次；终态与证据不可变；绩效关联防重及错员工拒绝；普通字段更新保留敏感字段；无权限/无组织范围拒绝；必要读审计失败拒绝返回；防自审、退回→重提→撤回及申诉/更正追加 |

合计5通过、0失败、0跳过。测试完成时间2026-10-02 19:01:44（北京时间），临时容器及临时凭据已删除。聚合回执见 `s5-real-postgres-20261002.json`。

## 实际命令与复现边界

在专用空库及明确的POSTGRES连接参数下执行，招聘测试在提供数据库名和密码后即启用；不要指向共享或生产数据库。培训、奖惩分别显式开启 `HR_TRAINING_PG_TEST=1`、`HR_REWARDS_PG_TEST=1`。

```sh
sh scripts/db-migrate.sh
pnpm --filter @jinhu/api exec node --test --test-force-exit --test-reporter=tap --require ts-node/register src/modules/hr/hr-recruitment.pg.spec.ts
HR_TRAINING_PG_TEST=1 pnpm --filter @jinhu/api exec node --test --test-force-exit --test-reporter=tap --require ts-node/register src/modules/hr/hr-training.pg.spec.ts
HR_REWARDS_PG_TEST=1 pnpm --filter @jinhu/api exec node --test --test-force-exit --test-reporter=tap --require ts-node/register src/modules/hr/hr-rewards.pg.spec.ts
```

本次外部运行器限定独立容器、127.0.0.1地址、临时lab数据库名，迁移前检查数据库身份及public空结构；凭据不进入仓库。原始日志私有保留，不含真实员工或历史工资输入。

## 尚未完成的验收

这是已有服务及数据库触发器的技术证据：服务测试使用合成身份/权限与既有审计替身，没有运行HTTP鉴权/完整IdempotencyInterceptor重放，不能由并发只成功一次推断所有HTTP幂等路径都已验收。

Windows客户端与集团Web的招聘、培训费用/记录、奖惩规则仍须独立对照，当前证据不增加旧功能分母或信用。生产三角色桌面/390px、真实文件下载、真实消息接收和岗位签署尚未通过。绩效关联测试只验证引用，不验证绩效核算或工资金额联动。

下一切片：继续核对绩效旧资料/现代业务链的现有测试和实际缺口；已有生产角色会话到位后执行模块页面验收。保持历史导入批次不重放，工资期间/规则未确认时不冻结生产来源或发布工资。
