# PMA L-02 长租边界 ADR

## Goal

以 ADR D-04 固化 housing 与 traditional leasing 的 bounded-context 边界、共存原则、共享基础设施和未来合并触发条件，避免在缺少迁移与审计证据时把两套合同/财务模型误当成同一领域。

## Requirements

- 决定短期维持 housing 与 traditional leasing 双 bounded context。
- 明确各自拥有的 aggregate、状态机、API/权限、合同与财务账本。
- 列出允许共享的基础设施及共享方式，禁止隐式合同/账本转换和双主写。
- 定义跨上下文冲突检测与集成契约，包括 Unit、Party、occupancy、用途与 scope。
- 将任何未来收窄或合并边界的动作约束为满足全部可验证触发条件后的独立 ADR/迁移项目。
- 仅修改决策与架构索引文档；不改运行时代码、schema、migration、HR 或生产配置。

## Acceptance Criteria

- [ ] ADR 包含状态、背景、决策、上下文职责、共享基础设施、禁止事项、后果及合并触发条件。
- [ ] 当前事实均链接到 canonical blueprint、current-state index、共享底座或代码/迁移证据。
- [ ] 合并触发条件覆盖语义、数据对账、金融审计、API/权限兼容、并发与回滚。
- [ ] `docs/index.md`、当前态索引与 canonical blueprint 均链接 ADR。
- [ ] 文档评审不超过 3 轮，相关 lint/link/格式验证及 PR CI 通过。
- [ ] PR/merge/containing-main 证据按 HR smoke 常设豁免如实归档。

## Out of scope

- 不设计或执行数据迁移、双写、回填、路由兼容或模型合并。
- 不改变 financial soft-delete/void、付款应用或审计规则。
- 不修复或改动 HR cutover smoke/fixture。
