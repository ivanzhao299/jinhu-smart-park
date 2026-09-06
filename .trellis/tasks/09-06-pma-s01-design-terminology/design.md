# Design

## Authority Structure

新增一个当前态设计索引作为唯一导航入口。它不复制全部实现细节，而是把稳定领域模型、可执行 spec、共享 ABI 与真实 UAT 证据按主题绑定：

1. `docs/architecture`：稳定实体、领域边界、状态/投影概要。
2. `.trellis/spec`：controller、事务、scope、幂等、identity/consent 等可执行约束，冲突时优先。
3. `packages/shared`：跨 API/Web 的 code、enum、显示字典、权限/角色 ABI。
4. `docs/uat`：特定提交与环境下的历史证据，不自动升级为当前 main 的浏览器证明。

## Terminology Contract

- 根业务：`long_rent` → “长租经营”。
- bounded context：housing（住房长租）与传统 leasing（招商租赁/合同财务）并存。
- 住宅/办公资格由 `usage_type`、`rental_segment` 和 mode×usage 矩阵表达。
- 历史旧称保留，首次相关位置追加“现称长租经营”的非破坏性注记。

## Compatibility

- 不更改任何 code、枚举值、permission code、role signature 或 API shape。
- 不修改 migration、seed 或运行时行为。
- 对 `pending_signature`、`signed`、`expiring`、`renewed` 只按当前 enum/API/DB 事实分类；未被当前实现/UAT证明的状态不写成已支持主链。
- `biz_party.consent_status` 保留兼容投影身份，不恢复为写入 authority。

## Rollback

本批仅文档与显示标签。回滚 PR 即可恢复；若共享标签变更导致契约断言变化，回滚相同共享文件，不涉及数据回滚。
