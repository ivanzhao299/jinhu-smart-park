# 技术设计
- 普通 CI 保持快速 contract/unit 层；深度 E2E 放 release-smoke 或显式手动 workflow。
- 测试环境通过唯一 run ID 隔离端口、数据库、fixture 前缀和 idempotency key。
- finally 路径统一清理并执行 residual query；失败日志脱敏并上传 artifact。
- 文档状态与目标 UAT 分离：机器门全绿不自动升级 uat_pending。
