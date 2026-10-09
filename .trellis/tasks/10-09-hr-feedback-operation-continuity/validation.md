# 验证与边界

本轮无历史数据重导、无生产测试业务写入、无DDL/种子/角色授予。新增周期管理读取入口复用原SQL与必需读取审计；模型/问卷、提名分离和匿名发布规则保持原后端契约。

已通过：
- Web实际组件+适配器交互55项：360办理12、HTTP适配器3、原配置13、目标执行16、目标定义11。
- API实际服务/控制器与原360配置契约16项。
- HR原回归222项。
- API/Web typecheck、受影响文件eslint；API/Web最终完整build。
- 本地实际组件与合成API浏览器桌面、390px；失败答卷保留0和建议，周期创建表单可用；scrollWidth385、可见控件最小44。浏览器尺寸恢复、临时标签和服务关闭。

远端CI、合并部署与运行版本证据另随发布检查点记录，不能用本地浏览器替代生产验收。

执行入口：pnpm --filter @jinhu/web test:unit:interaction test/interaction/hr-feedback-operation-continuity.test.tsx test/interaction/hr-feedback-operation-api.test.tsx test/interaction/hr-feedback-configuration.test.tsx test/interaction/hr-goal-execution-workflow.test.tsx test/interaction/hr-goal-definition-workflow.test.tsx；pnpm --filter @jinhu/web test:unit:hr；API目录TS_NODE_TRANSPILE_ONLY=true node --test --require ts-node/register src/modules/hr/hr-feedback360-operation-context.spec.ts src/modules/hr/hr-feedback360.contract.spec.ts src/modules/hr/hr-feedback360-configuration.spec.ts。

本轮不新跑PostgreSQL全域场景：原查询及所有写入事务不变；本轮验证新增精确入口的授权/范围/审计以及前端办理连续性。现有员工选项LIMIT500仍是明确边界，不能声称全员候选可达；后续按业务选择需求补分页。真实岗位、当前工资双轨金额、旧规则等价和独立HR整体验收未完成。
