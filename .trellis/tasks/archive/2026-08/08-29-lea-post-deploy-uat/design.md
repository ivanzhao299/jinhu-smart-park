# LEA post-deploy UAT design

## Boundary

使用仓库现有 property control-plane UAT/browser harness 与隔离 Docker/数据库能力；浏览器采用独立 profile/端口。优先在可精确清理的隔离环境验证数据链，生产只使用既有部署门禁证据，不直连数据库或写业务数据。

## Evidence model

- 一个唯一 run-id 贯穿 fixture、API、截图、Network、DB snapshot 与 cleanup。
- 报告只记录脱敏 ID、状态、断言与相对证据路径。
- DB before/after 由隔离容器内只读查询采集；业务变更必须走真实 API/UI。
- manifest 对每张截图记录场景、viewport、URL、时间与断言；Network 记录请求方法、路径、状态码和脱敏响应摘要。

## Rollback and cleanup

失败即冻结现场证据，不做模糊清理；随后按 run-id 反向依赖精确清理。teardown 负责独立浏览器进程、隔离容器与临时文件，绝不操作非本轮资源。
