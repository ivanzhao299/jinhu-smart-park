# Issue #272 民宿住房 API E2E 发布门禁

## 目标
让两套真实 API E2E 成为可重复、可诊断、清理归零的 CI/release gate，并同步权威证据。

## 要求
- 新增民宿 package 命令，复用现有两套 E2E。
- 隔离 PostgreSQL、正式 migration/production seed、真实 Nest HTTP。
- fixture 可识别，成功失败都 cleanup，residual=0。
- 覆盖权限/模块/scope/field/file、占用互斥、幂等、金额、终态和附件保护。

## 验收
- 两个命令在干净环境重复通过，workflow 失败时 fail-closed 并保留诊断证据。
- 文档绑定 commit/环境/时间，不再声称民宿没有真实 API E2E。
- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/272
