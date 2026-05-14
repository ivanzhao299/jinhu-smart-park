# S1 系统基础增强自测清单

## 环境准备

1. 配置 `.env`，确保 PostgreSQL 连接、JWT 密钥和本地文件存储目录可用。
2. 启动数据库后执行 `database/migrations` 下 SQL。
3. 执行 `database/seeds/000001_s1_permissions.sql` 初始化 S1 权限点。
4. 本地自测可执行 `database/seeds/000002_s1_dev_accounts.sql` 初始化两个开发账号：
   - 超级管理员：`admin` / `Jinhu@123456`
   - 普通用户：`s1_user` / `Jinhu@123456`，拥有基础读取和上传权限，不拥有 `audit:read`、`file:download`。

## 后端 API 自测

所有写操作都需要携带 `X-Idempotency-Key`。

| 序号 | 场景 | 请求 | 预期 |
| --- | --- | --- | --- |
| 1 | 登录成功 | `POST /api/v1/auth/login` | 返回统一响应，包含 `accessToken`，写入 `sys_login_log.result=success` |
| 2 | 登录失败 | `POST /api/v1/auth/login` 使用错误密码 | 返回 401，写入 `sys_login_log.result=fail` |
| 3 | 无 token 访问当前用户 | `GET /api/v1/users/me` | 返回 401 |
| 4 | 有效 token 访问当前用户 | `GET /api/v1/users/me` | 返回 `roles`、`permissions`、`tenant_id`、`park_id`、`is_super` |
| 5 | 普通用户访问审计日志 | `GET /api/v1/audit/op-logs` | 返回 403 |
| 6 | 超管访问审计日志 | `GET /api/v1/audit/op-logs` | 返回分页数据 |
| 7 | 上传附件 | `POST /api/v1/files` multipart | `sys_file` 新增记录，返回文件元数据 |
| 8 | 无权限下载附件 | `GET /api/v1/files/{id}/download` | 返回 403，不返回文件流 |
| 9 | 新增用户审计 | `POST /api/v1/users` | `sys_op_log` 记录用户新增 |
| 10 | 角色授权审计 | `POST /api/v1/roles/{id}/permissions` | `rel_role_perm` 写入授权关系，`sys_op_log` 记录权限变更 |
| 11 | 字典新增审计 | `POST /api/v1/dict-types` / `POST /api/v1/dict-items` | `sys_op_log` 记录字典新增 |

## 前端页面自测

| 场景 | 路径 | 预期 |
| --- | --- | --- |
| 登录后进入首页 | `/login` | 登录成功后跳转 `/dashboard` |
| 动态菜单 | 后台任意页 | Sidebar 只展示当前用户拥有权限的菜单，超管展示全部菜单 |
| Header 用户信息 | 后台任意页 | 显示当前用户、角色、园区 |
| 退出登录 | Header 用户菜单 | 调用退出接口并跳转 `/login`，刷新不能再进后台 |
| 无权限页面 | 直接输入受限 URL | 跳转或显示 `/403` |
| 附件上传 | `/system/files` | 可上传 PDF、图片、Excel，失败显示错误 |
| 审计日志 | `/system/audit/op-logs` | 支持筛选、分页、详情 JSON 格式化 |
| 登录日志 | `/system/audit/login-logs` | 支持筛选、分页 |
| 暗色模式 | Header 主题按钮 | 切换后刷新保持主题，页面不闪白 |

## 工程质量命令

```bash
npm run lint
npm run build
npm run test
npm run db:up
```

当前仓库脚本实际委托 `pnpm` 执行；如果使用 npm，请先确认本机已安装 npm/pnpm/corepack 和依赖。
