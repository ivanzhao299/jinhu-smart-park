# 民宿与住房出租真实 API E2E 门禁

`pnpm test:e2e:property-api` 是会创建订单、租约、审批、账务和附件的真实 HTTP/API 回归；它不是普通单元测试，也绝不能指向共享 UAT 或生产环境。

运行前必须满足以下条件：

- `PROPERTY_API_E2E_ISOLATED=yes`；
- `POSTGRES_DB` 仅可为 `jinhu_property_api_e2e_*` 或 CI 的 `jinhu_release_smoke`；
- `API_BASE_URL` 只能是 loopback 地址；
- `PROPERTY_API_E2E_API_CONTAINER` 必须指向本机 Docker 中正在运行的目标 API 容器；门禁会通过 Docker control plane 同时核对其发布端口和 `POSTGRES_DB`，不能只相信客户端环境变量；
- `PROPERTY_API_E2E_POSTGRES_CONTAINER` 必须指向同一个一次性 PostgreSQL 容器；门禁会核对 API 容器的 `POSTGRES_HOST` 是否绑定到该容器在共享 Docker 网络里的别名、容器名或 IP；
- `TEST_RUN_ID` 必须存在；aggregate gate 会自动为每个 child suite 注入独立 run id，直接运行 child suite 时需手工设置；
- `APPROVER_USERNAME` / `APPROVER_PASSWORD` 必须是独立的非超级审批账号；住房采购转收费还需要 `APPROVER_2_USERNAME` / `APPROVER_2_PASSWORD`，用于验证付款人与转收费审批人分离；
- API 的 `/health` 和 `/ready` 均成功，且已完成迁移、生产安全 seed 与临时管理员初始化。

本地最小准备方式是：启动一次性 Docker Postgres/API，执行迁移、生产安全 seed、bootstrap admin，再以 `scripts/e2e/property-api-e2e-fixtures.sql` 创建两个审批账号、身份审核队列、审批运行时控制和 `short_stay` / `long_rent` 房源 fixture。随后导出上述环境变量，运行 `pnpm test:e2e:property-api`；若只验证单模块，可运行 `pnpm test:e2e:homestay-api` 或 `pnpm test:e2e:housing-rental-api`。

CI 的 Release Smoke 在一次性 Docker 数据库中运行该门禁。运行前会创建相互分离的申请人与审批人，并用 `scripts/e2e/property-api-e2e-fixtures.sql` 显式启用 disposable scope 的审批/事件运行时控制，在两个独立房源上配置 `short_stay` / `long_rent`；高风险流程必须提交审批、由独立审批人决策并等待执行成功后才能继续。完成或失败后均执行 `docker compose down -v --remove-orphans`，并断言容器与命名卷不存在。日志和 `property-api-e2e-report.json` 会作为 Release Smoke artifact 上传。普通 PR 的 verify 只执行门禁契约测试；当民宿、住房、文件、物业身份、物业审批、工单、API 幂等拦截器、共享导出/共享房产业务契约、迁移、E2E 脚本或 `package.json` 的 E2E 命令变更时，范围检测会自动要求 Release Smoke。

本门禁验证技术契约（真实 Nest API、PostgreSQL、权限、幂等、占用冲突、金额、终态与附件路径），不替代 PR192 的真人岗位 UAT、具名签署或生产发布审批。
