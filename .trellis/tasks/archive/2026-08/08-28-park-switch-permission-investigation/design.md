# Design

## Boundary

本任务是 investigation-only。允许读取源码、文档、迁移/seed、隔离环境数据库与浏览器证据；允许写调查任务工件、证据目录和最终 review 报告。禁止修改产品代码、生产状态、HR 文件或创建修复 Issue。

## Evidence Model

1. 静态链路：controller → auth service/token claims → current scope → users/me role/permission/menu resolution → Web context replacement/route prediction → API guards。
2. 配置链路：用户管理 UI/API → DTO/service transaction → `rel_user_park` / `rel_user_role` 等持久化关系。
3. 动态矩阵：S1 super/bootstrap、S2 access-only、S3 dual-role control；每组以 UI、Network、DB 三角互证。
4. 结论分层：观察事实、根因、产品定性、候选方案、推荐、决策门严格分开。

## Isolation and Safety

- 使用独占 compose project、独立端口/卷/网络和专用 Chrome profile；启动前后核对不得影响 PhenixCode/AiWeiBaby。
- fixture 只经产品 API 创建；仅既有规则允许的取证使用 raw CDP；不直改业务表来制造通过结果。
- 复用上一轮 R5 的园区归属与 16 表冻结基线；任何偏差都在报告中披露。
- 报告只写脱敏 ID/计数/HTTP 状态/语义，不记录密码、token、cookie 或连接秘密。

## Compatibility and Migration Analysis

本轮无迁移。候选方案若涉及 super 跨园区、默认角色或角色复制，报告必须讨论历史用户回填、角色漂移、最小权限、审计性与回滚；若仅 UI 引导/空态，讨论错误归因与切换状态一致性。

## Review Contract

审查重点：证据是否支撑定性、是否把当前设计语义误报为安全缺陷、是否遗漏 super 与 access-only 的不同根因、是否越过“方案待批”边界。
