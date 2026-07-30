# PR192 C 架构与可靠性

## 1. 目标

在 Track A 页面/契约和 Track B 安全执行均完成后，以不改变外部业务行为为前提，拆分民宿、住房前后端巨型实现，补齐弱网、上传、性能和证据可靠性。

## 2. 唯一前置依赖

```text
B-technical handoff SHA
```

不依赖：

- 真人岗位 UAT。
- 业务/财务/安全签署。
- Production Readiness Gate。

Human lane 可以与本任务并行或长期 awaiting，不阻止本任务达到 technical PASS 和 `codex_complete`。

## 3. In Scope

- Homestay/Housing façade 后按完整 transaction closure 拆 command/query service。
- Property port 单次切换，消除 domain 对旧 service 与新 port 的双 DI。
- A 阶段 feature 层的进一步整理和重复 contract 删除。
- 单一 response contract 的消费者收敛。
- `MobileTerminalReliability` 真实能力和文案一致。
- IndexedDB 非敏感草稿、账号/tenant/park 隔离和 TTL。
- 上传队列、上下文绑定、失败恢复和敏感文件策略。
- 可复现性能 profile、evidence 和 cleanup。
- 在行为测试覆盖后删除对应源码正则测试。
- Complexity machine gate。

## 4. Out of Scope

- 新增产品页面或业务状态。
- 修改 approval/identity/occupancy/finance 语义。
- 新财务表或账务迁移。
- 通用离线业务 mutation。
- service worker 后台自动提交财务或生命周期动作。
- 修改外部 URL、DTO、response shape。
- 等待或替代真人 UAT。

## 5. 核心要求

- 先 characterization，后移动完整 transaction closure。
- façade 保持 controller/API 兼容。
- 一个 closure 不得同时注入旧 property service 和新 port。
- 不 dual read、dual write 或 shadow 执行财务命令。
- 每个提交只迁移一个可回退闭包。
- 页面和 hooks 不重新复制 response interface。
- Offline 只保存允许的非敏感 draft；敏感身份和支付资料默认不落本地。
- 权限、账号、tenant、park、entity context 变化立即清理缓存和 draft。
- 当前弱网组件在持久化完成前不得声称数据已保存。

## 6. Machine Acceptance

- [ ] C 基线等于 B technical handoff SHA。
- [ ] 外部 URL/DTO/response/状态机 contract snapshot 无差异。
- [ ] Domain effect 和 approval/outbox tests 无回归。
- [ ] 无旧 service + 新 port 双 DI。
- [ ] 无新旧 UI 双实现。
- [ ] route client、component、function 和 complexity Gate 通过。
- [ ] 弱网、刷新、logout、tenant/park 切换、TTL 和 conflict tests 通过。
- [ ] 上传恢复、上下文变化、权限组合和清理通过。
- [ ] 固定资源性能 5 runs、样本、CI 和错误率通过。
- [ ] L0–L6 evidence 具有 SHA、失败日志和 cleanup proof。
- [ ] C technical PASS 不依赖 human readiness。

## 7. 人工 Gate 边界

Codex 可以完成 C technical Gate 和 UAT 环境准备。真实岗位 UAT 属于独立外部泳道，只阻止 Production Readiness，不阻止本任务完成。
