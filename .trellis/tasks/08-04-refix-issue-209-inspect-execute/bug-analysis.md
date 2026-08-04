## Bug Analysis: 巡检“执行”入口无后续流程

### 1. Root Cause Category

- **Category**: B - Cross-Layer Contract；D - Test Coverage Gap
- **Specific Cause**: Web 把“执行”实现成详情预加载，状态启动藏在第二个按钮；执行表单又跨域依赖检查项管理读取接口。API 的父任务字段策略是浅投影，未继续保护嵌套结果；Web 修复 preflight 后又隐含假设其子项始终比 start 响应更新，并把隐藏/脱敏值当成普通可编辑值回传。此前测试只覆盖投影不白屏和请求竞态，没有断言单击“执行”会真正触发状态转换、嵌套字段策略、并发更新后的投影新鲜度或受保护字段的写回语义。

### 2. Why Fixes Failed

1. 首次修复只规范 GPS/附件运行时值，消除了白屏但没有检查完整业务状态机。
2. 再次修复把抽屉延迟到数据完整后打开，仍保留了跨权限接口拼装和“执行→开始任务”的双步骤。
3. Codex review 补充了竞态代际保护，但测试关注旧响应覆盖，没有验证按钮文案与实际业务动作一致。
4. 第一轮 preflight 修复无条件保留启动前子项，守住了失败语义却忽略 start 响应可能包含并发产生的更新。
5. 第一轮 API 投影只调用父实体字段策略，误把浅拷贝当成了递归保护，嵌套结果仍保留原值。
6. 第二轮只修复了读侧字段策略，没有继续追踪投影值进入写 payload 的路径，导致掩码/缺省值覆盖原值。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 增加任务自有 execution context 接口，携带 enabled 检查项并校验执行人 | DONE |
| P0 | Test Coverage | 状态矩阵覆盖 start/resume/hidden，源码接线断言单击入口调用 start 且不访问模板管理接口 | DONE |
| P1 | Runtime | 同步 ref 锁加禁用态阻止快速重复启动；generation 阻止陈旧响应覆盖 | DONE |
| P1 | Documentation | API/Web spec 与 cross-layer guide 固化动作上下文和单击转换规则 | DONE |
| P0 | Concurrency | start 在任务行锁内判定状态，跨客户端并发只写一次转换和审计 | DONE |
| P0 | Permission | resume 入口接受任一 execution 权限，execution context 拒绝终态 | DONE |
| P0 | Preflight | 状态转换前验证检查项/结果投影，成功后保留已验证子项 | DONE |
| P0 | Field policy | 父任务与嵌套结果分别执行字段策略，禁止浅投影泄露子项原值 | DONE |
| P0 | Freshness | start 后优先采用最新有效子项，响应不可用时才成对回退 preflight | DONE |
| P0 | Protected writes | 跟踪结果值可编辑性，受保护字段不回传；API 缺省保留、显式 null 清空 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他“办理/执行/审批”按钮若只打开抽屉，或为了动作表单调用独立管理列表接口，存在同类权限断链风险。
- **Design Improvement**: 动作接口负责返回最小闭环上下文，普通详情与动作详情分离，避免扩大只读投影。
- **Process Improvement**: 修复交互故障时必须从按钮一直验证到服务状态转换和最终可操作表单，而不是以“不白屏”为完成标准。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/api/backend/index.md`
- [x] 更新 `.trellis/spec/web/frontend/index.md`
- [x] 更新 `.trellis/spec/guides/cross-layer-thinking-guide.md`
- [x] 新增 API/Web 防复发测试
- [x] 项目不存在 `src/templates/markdown/spec/`，无可同步模板
