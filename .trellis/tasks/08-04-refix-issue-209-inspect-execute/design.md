# Design

## Root Cause

当前列表“执行”按钮调用 `openExecute`，只加载任务详情和模板检查项，真正的状态启动留给抽屉中的第二个“开始任务”按钮。因此入口语义与用户预期不一致。`mode=all` 还会调用受 `safety_inspect_item:read` 保护的模板检查项接口，使具备任务执行权限的角色因缺少模板管理读取权限而无法打开抽屉；错误只显示在页面消息区，看起来像点击无反应。

## Cross-Layer Contract

1. API 增加任务自有 execution context 投影，启动响应也携带当前模板的 enabled 检查项；该上下文随任务执行权限提供，不要求独立的模板管理权限，普通只读详情保持原边界。
2. Web 根据最新任务状态决定入口行为：pending/overdue 调用 start，in-progress 读取详情，completed 不提供执行入口。
3. Web 使用同步 ref 锁阻止同一渲染周期内的重复点击，并用状态禁用当前按钮；现有 generation 继续阻止过期响应覆盖新目标。
4. API start 对已经 in-progress 的任务返回当前详情，保证入口重试和跨会话状态漂移可恢复；completed 等终态继续拒绝。
5. Codex review 补充：execution context 自身拒绝终态；start 在事务行锁内判定状态；Web 启动前验证完整投影，继续执行入口接受任一 execution 权限。
6. Codex 二轮 review 补充：任务投影对子结果逐项应用独立字段策略；start 后优先使用最新有效子项，仅在响应不可用时原子回退到 preflight。

## Same-Class Risk Prevention

- 业务动作页面不得为了执行上下文拼接另一个管理域的读取接口。
- 列表动作的文案必须对应真实状态转换；若只是打开详情，应使用“查看/继续执行”等明确语义。
- 生命周期入口必须枚举可启动、可继续、终态三类状态，并覆盖快速重复点击。
