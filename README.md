# 金湖科创产业园智慧园区管理系统

基于 Next.js App Router、React、TypeScript、NestJS、TypeORM、PostgreSQL 的 monorepo 工程骨架。

## 目录

```text
jinhu-smart-park/
  apps/web
  apps/api
  packages/shared
  packages/ui
  packages/config
  database/migrations
  database/seeds
  docs/prompts
  docs/testing
  infra/docker
  scripts
```

## 产品路线

系统按 S1-S11 迭代推进，完整路线图见 `docs/sprint-roadmap.md`。

当前下一阶段为 S1 系统基础增强，详细设计见 `docs/s1-system-foundation.md`。

## 准备环境

```bash
cp .env.example .env
pnpm install
```

请在 `.env` 中替换 `JWT_SECRET` 与数据库密码。不要在代码里硬编码密钥。

## 启动数据库

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed:dev
```

数据库使用 PostgreSQL，迁移 SQL 位于 `database/migrations`。

Seed 分为两类：

- `pnpm db:seed:dev`：本地开发和 S1 冒烟测试，包含固定测试账号。
- `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`：生产安全 seed，只初始化权限元数据，不创建固定密码账号。

## 启动后端

```bash
pnpm dev:api
```

默认地址：`http://localhost:3001/api/v1`

已预留接口：

- `POST /api/v1/auth/login`
- `GET /api/v1/users/me`

受保护接口通过 JWT Passport Guard 校验。业务查询服务已预留 `tenant_id` 与 `park_id` 隔离条件。

### API 横切约束

- 登录接口使用 `@Public()` 放行，其余接口默认校验 JWT。
- 受保护接口必须声明 `@RequirePermissions()`，超级管理员角色 `SUPER_ADMIN` 或权限 `*` 具备全部权限。
- `POST`、`PUT`、`PATCH`、`DELETE` 写请求必须携带 `X-Idempotency-Key`。
- 写请求会通过审计拦截器记录 `sys_op_log`。
- 列表查询 DTO 位于 `apps/api/src/shared/dto/pagination-query.dto.ts`，统一支持 `page`、`page_size`、`sort`、`keyword`、`status`。

## 启动前端

```bash
pnpm dev:web
```

默认地址：`http://localhost:3000`

前端已接入 `app/globals.css`，使用 Phoenix ERP V3 风格 CSS Variables，并提供 Sidebar、Header、Dashboard 首页与登录页。

前端 API 请求封装位于 `apps/web/lib/api-client.ts`，使用相对 `/api/v1` 前缀，不硬编码绝对地址，并且所有请求统一检查 `res.ok`。

## 一键开发

```bash
sh scripts/dev.sh
```

脚本不包含绝对路径，会安装依赖、启动 PostgreSQL、并并行启动前后端。

## 工程治理与测试

```bash
pnpm lint
pnpm build
pnpm test
```

`pnpm test` 当前执行最小 S1 冒烟 e2e：登录、`/users/me`、权限拒绝、附件上传/下载/软删除、字典新增、用户新增、角色授权、操作日志和登录日志查询。
