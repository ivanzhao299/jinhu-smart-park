# Bug Analysis: PR224 Runner 发布链路审查与部署失败

## 1. Root Cause Category

- **Category**: B - Cross-Layer Contract；D - Test Coverage Gap；E - Implicit Assumption
- **Specific Cause**: `sys_role` 的唯一身份已从园区级演进为租户级，但新 seed SQL 仍复制旧的
  `(tenant_id, park_id, code)` 心智模型；Release Smoke 又依赖人工标签，导致 PR 在未执行真实 migration
  的情况下合并。相同的“只看局部成功路径”还出现在权限 guard、租约生命周期、发布证据、SSH 初始化、
  临时文件/rollback snapshot 清理和 UI 历史分页上。

## 2. Why Fixes Failed

1. PR #224 的单元测试只断言 migration 包含若干字符串，没有运行 PostgreSQL conflict inference，属于同源文本测试。
2. PR 正文写明需要 Release Smoke，但 workflow 把执行责任交给可选 label；流程声明没有变成强制门禁。
3. migration 同时承担 DDL 与账号/权限 baseline，导致 schema 成功与环境数据收敛无法独立验证和重试。
4. review 在合并前已经指出 12 条问题，但没有逐条核验、修复、复审和 CI 稳定通过的闭环。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | migration 仅保留 DDL，Runner baseline 移入幂等 production seed | DONE |
| P0 | Test Coverage | 数据库相关 diff 自动执行 fresh-schema migration + seed Release Smoke | DONE |
| P0 | Contract | ON CONFLICT 与后续 join 使用同一唯一业务键 | DONE |
| P0 | Runtime | claim/renew/triage/result 在数据库写锁内执行完整租约状态矩阵 | DONE |
| P0 | Security | SSH agent/known_hosts、敏感文件与 rollback snapshot 全路径清理 | DONE |
| P1 | UI Contract | 共享 DS surface + 服务端分页 + stale response 防护 | DONE |
| P1 | Code Review | 新 PR 映射并关闭原 12 条反馈后再请求 Codex 复审 | IN PROGRESS |

## 4. Systematic Expansion

- **Similar Issues**: 新增 migration/seed 中所有 partial-index conflict target；所有把租户级 role identity
  又加 park 过滤的后续关系绑定；其他人工 label 才运行的高风险 smoke；所有上传/密钥/rollback 临时文件。
- **Design Improvement**: 以数据库唯一索引作为 upsert 与关系解析的单一身份来源；以状态机而非 token 单字段
  判断 Runner 所有权；把环境基线从不可变 schema 历史中拆出。
- **Process Improvement**: 高风险路径由 diff 自动触发集成门禁；Review 必须经过“成立性核验→同类扫描→回归→
  thread 清零→最新 head 复审→CI 稳定”的闭环。

## 5. Knowledge Capture

- [x] 更新 API backend spec：partial unique conflict、failed migration、Runner lease/evidence。
- [x] 更新 Web frontend spec：全局反馈 DS 复用与历史分页。
- [x] 更新 project operations guide：自动 Release Smoke 与部署产物清理。
- [x] 同步发布/Runner 文档。
- [x] 本项目不存在 `src/templates/markdown/spec/` 模板目录，project-scoped spec 无需模板镜像。
