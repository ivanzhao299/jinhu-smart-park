# Design: PMA L-02 长租边界 ADR

## Decision shape

- 新增一份 repository-native architecture ADR，不创建新的 ADR 目录或编号体系。
- 以当前双上下文为 adopted 决策；共享能力采用 port/identity/constraint，不共享合同 aggregate 或财务 ledger。
- 合并触发条件是必要条件清单，不是已批准的实施计划；满足后仍需新 ADR、迁移方案和独立发布门禁。

## Evidence model

- 当前态：canonical blueprint、current-state index、shared property foundation。
- 可执行锚点：shared ABI、housing/leasing entities、occupancy port、eligibility 与数据库约束。
- 历史审计仅用于解释风险，不覆盖当前代码与架构权威。

## Compatibility and rollback

- 文档改动不改变 API、权限、schema 或 runtime。
- 若决策表述存在误差，回滚 ADR 与三个索引链接即可；不涉及数据回滚。
