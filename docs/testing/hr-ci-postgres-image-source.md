# CI PostgreSQL 镜像来源

HR Refresh Scope PostgreSQL任务和Release Smoke测试环境使用Google的Docker Hub公共缓存，固定镜像为`mirror.gcr.io/library/postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`。缓存说明：https://cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images 。2026-10-10曾因Docker Hub匿名下载限流改用Amazon ECR Public；2026-10-12 CI 38170479659又在初始化容器时遇到ECR `Data limit exceeded`。本次仅更换测试下载源，不增加仓库登录或修改检查条件。

HR任务直接使用该摘要；Release Smoke下载同一摘要后标记本地`postgres:16-alpine`，继续沿用现有生产Compose定义。生产Compose、数据库、权限与发版模式均不因此改变。更换摘要前核对官方发布者、平台清单与实际PostgreSQL版本；保留工作流变更自动触发的完整Release Smoke。

验证：2026-10-12按固定摘要查询Docker Hub官方源与Google缓存，两者返回的OCI平台清单内容完全一致。实际镜像下载和运行版本由CI验证，现有HR PostgreSQL工具前置合同继续执行。实际CI及Release Smoke结果另见对应运行记录，不能以本地验证冒充CI通过。
