# 工程模块生产部署执行

## Goal

制定并执行金湖智慧园区**首发**生产部署计划,把工程模块推进到生产可用:工程门禁 →
生产初始化预演 → 全量回归 → Go/No-Go 证据 → 生产割接交付。其中真实生产割接需生产密钥/
主机,由发布负责人在目标环境执行(本沙箱无法触及生产凭据,见约束)。

## 范围

- 首发模块(开放):认证/RBAC/菜单、系统管理、资产、租户、招商租赁、财务、工单、文件、
  安全巡检+隐患整改。
- 二期模块(代码在、菜单隐藏/未全验收):IoT、能耗、视频、机器人、安全应急/作业许可——
  本次首发**不开放**,各自需独立验收回归后再单独上线。

## 硬约束(必须诚实记录)

- 真实生产割接依赖 `deploy-production.yml`(GitHub Actions 手动触发,使用 `PROD_SSH_*`、
  `JWT_SECRET`、DB 密码等 Secrets)或在生产主机执行 `pnpm prod:deploy`。这些凭据本执行
  环境无权也不应接触;最终割接由发布负责人执行。
- 不提交真实密钥;生产 `AUTH_SMS_FIXED_CODE` 空、`AUTH_SMS_CODE_VISIBLE=false`、
  `AUTH_WECHAT_MOCK_ENABLED=false`;不擅自改 auth/财务/迁移/seed 行为。

## Requirements

- R1 工程门禁(lint/typecheck/build/CI verify)全绿。
- R2 生产初始化序列可在全新库上无错执行:migrate → seed:prod → check:init →
  bootstrap-admin → check:init → 登录验证。
- R3 首发全量回归(first-release-regression + test:e2e + 财务/安全 smoke)在**生产 auth 姿态**
  下通过;失败项分类为 P0 阻塞 / 可接受。
- R4 文件存储路径/挂载/权限/备份在目标环境确认。
- R5 备份(DB+文件)、回滚 tag、回滚演练就绪。
- R6 发布后 smoke(/health /ready /login + 文件 + 只读抽样)通过。

## Acceptance Criteria（Go 条件)

- [ ] AC1 lint/typecheck/build 全绿(本地已验证)。
- [ ] AC2 全新库生产初始化序列 PASS,admin 可登录。
- [ ] AC3 first-release-regression 全 PASS(或剩余项非 P0 且发布负责人接受)。
- [ ] AC4 目标环境 `.env.production` 密钥/auth 姿态核验通过。
- [ ] AC5 DB+文件备份、上一版镜像 tag、回滚负责人就绪。
- [ ] AC6 部署后健康检查 + 登录 + 文件抽样通过,观察期无 P0。

## 已知发布项(dress rehearsal 暴露)

- F1【auth,需决策】首发要求仅密码登录;但关闭 mock 后 `/auth/mobile/send-code` 与
  `/auth/wechat/authorize` 仍返回 200(无禁用开关),`first-release-auth-health` 因此 FAIL。
  实际登录已不可能(`mobile/login` 401、`wechat/callback` 400)。需在"为首发禁用这两个
  端点(加 feature flag)"与"调整回归口径"之间二选一。属 auth 敏感项,待发布负责人决策。
- F2【文件】文件中心为单机本地存储,非对象存储;生产需确认持久化目录与备份(R4/R5)。
