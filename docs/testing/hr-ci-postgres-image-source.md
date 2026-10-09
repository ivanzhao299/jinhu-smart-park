# CI PostgreSQL 镜像来源

HR Refresh Scope PostgreSQL任务和Release Smoke测试环境使用Docker Official Image的Amazon ECR Public分发，固定镜像为`public.ecr.aws/docker/library/postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`。来源目录：https://gallery.ecr.aws/docker/library/postgres 。2026-10-10两次运行在测试启动前遭Docker Hub匿名下载限流，因此只改测试环境下载地址，不增加仓库登录或修改检查条件。

HR任务直接使用该摘要；Release Smoke下载同一摘要后标记本地`postgres:16-alpine`，继续沿用现有生产Compose定义。生产Compose、数据库、权限与发版模式均不因此改变。更换摘要前核对官方发布者、平台清单与实际PostgreSQL版本；保留工作流变更自动触发的完整Release Smoke。

验证：公开OCI清单的SHA-256与引用摘要一致；实际镜像下载和运行版本验证，以及现有HR PostgreSQL工具前置合同。实际CI及Release Smoke结果另见对应运行记录，不能以本地验证冒充CI通过。
