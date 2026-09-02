# Design

父任务管理 Issue #533、三段串行交付与最终 UAT。PR1 建立 shared/Web 基座并修复 A/C 类；PR2 从合入后的 main 补 B 类 API 契约；PR3 再落 D 类临时定名与全量 UAT。

- shared：封闭稳定值域、中文 label、响应契约。
- Web presentation：variant、组合展示、未知值和中文占位。
- `/dict-items`：开放、租户可配置值。
- API projection：在当前授权 scope 内 join 名称，不持久化、不做 Web N+1。

新增响应字段保持 additive nullable；状态值、数据库值、筛选 query 和提交 payload 不变。每 PR 可独立 revert，无 migration。
