## Bug Analysis: 房产业务 Review 边界条件遗漏

### 1. Root Cause Category

- **Category**: D - Test Coverage Gap
- **Specific Cause**: 原验证集中在正常业务闭环，没有系统覆盖大金额精度、月末锚点、上海业务时区、细粒度权限、状态变化后的二次校验，以及前端慢响应和重复提交。
- **Secondary Category**: B/E - Cross-Layer Contract / Implicit Assumption
- **Specific Cause**: 数据库金额与唯一约束、服务层状态机、API 权限投影和前端选择上下文之间存在未显式记录的契约。

### 2. Why Fixes Failed

1. 主流程测试通过：只能证明常规输入可工作，不能证明边界值、竞态和权限组合正确。
2. 逐条修复 Review：若不横向搜索相同模式，会遗漏凭证刷新、交割附件等同类异步竞态。
3. 类型检查与构建通过：无法发现业务日期、金额精度和返回字段授权等语义错误。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Test Coverage | 为金额、日期、权限、幂等、选择上下文和占用激活增加回归测试 | DONE |
| P0 | Documentation | 将可执行契约写入房产业务控制与共享占用规范 | DONE |
| P0 | Code Review | Review 修复后横向搜索同类写法，不只修改评论锚点 | DONE |
| P1 | Delivery Gate | PR 正文记录类型检查、lint、构建、测试、API E2E 与桌面/390px 验收证据 | DONE |
| P1 | Change Size | 后续按共享底座、民宿、住房出租和分析拆分较小 PR | TODO |

### 4. Systematic Expansion

- **Similar Issues**: 财务写入、附件提交、订单/租约详情加载、分页列表和看板聚合均需要检查权限、重试和异步上下文。
- **Design Improvement**: 金额持久化使用缩放整数或十进制字符串；异步提交持有来源上下文；占用激活在事务中重新校验。
- **Process Improvement**: 开发前建立边界矩阵，提交前把每条业务规则映射到自动化测试或明确的 UAT 证据。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/api/backend/property-business-controls.md`
- [x] 更新 `.trellis/spec/api/backend/shared-property-occupancy.md`
- [x] 补充 DTO、策略和结构回归测试
- [x] 完成 lint、类型检查、构建、真实 API E2E 与桌面/390px 验收
