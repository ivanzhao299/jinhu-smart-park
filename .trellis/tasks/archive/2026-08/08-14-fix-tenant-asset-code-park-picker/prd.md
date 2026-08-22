# 修复新租户资产编码与多园区楼栋选择

GitHub Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/282

## Goal

修复生产环境中新租户或新增园区进入资产创建链时的三个关联缺陷：自动生成楼栋编码时缺少当前租户园区的启用规则、楼栋园区选择器退化为“当前园区”占位名称、以及新增园区后用户上下文未刷新导致选择器缺少新园区。形成可验证的“园区 → 楼栋 → 楼层 → 房源”多园区完整链路，并消除其他启用模块在新 scope 下缺少编码规则的同类问题。

## Confirmed Facts

- `CodeRulesService.generateCode()` 只按当前 `(tenant_id, park_id, entity_type)` 查找启用规则；缺失时固定抛出 `Enabled code rule not found`。
- 生产 seed 只向固定平台 scope `10000001/20000001` 写入编码规则；创建新租户默认园区和新增园区均未复制规则。
- 楼栋、楼层、房源在新增时留空编码都会调用当前 scope 的自动编码，因此属于同一缺陷族。
- 最新 `origin/main` 已有楼栋园区选择器和受控 `switch-context`；后端仍按 JWT 当前 scope 创建，不能接受客户端任意 `parkId` 绕过隔离。
- `/users/me` 在用户 home park 缺少历史 `rel_user_park` 关系时会把名称回退为“当前园区”，并返回空的 `accessible_parks`。
- 新增园区事务已创建 `rel_user_park` 绑定，但当前页面保存成功后只刷新园区列表，不刷新 `/users/me`，同一前端会话仍持有旧 `accessible_parks`。
- 本任务只以生产截图作为缺陷证据；开发、自测和浏览器验收均使用本地隔离环境，不连接生产环境。

## Requirements

- 新租户默认园区和新增园区必须在同一事务中幂等初始化所启用模块的标准编码规则，序列从 0 开始且严格隔离到目标 tenant/park scope。
- 租户后续启用套餐/模块时也必须复用同一 provisioning 机制；以后新增标准编码规则的模块不得只更新固定 seed 而遗漏动态 tenant/park scope。
- 必须为已存在且缺少规则的活跃租户园区提供 forward-only 数据迁移；不得覆盖现有有效规则、当前序列、管理员自定义配置、禁用规则或软删除历史。
- 规则来源必须受固定平台标准 scope 约束，不得在运行时回退到任意租户或跨 scope 共用序列；标准 asset 核心规则缺失时应 fail-fast。
- 历史 home park 用户即使缺少 `rel_user_park`，只可对其自身 active home scope 做有界兼容，并返回真实园区编码/名称；不得借此扩大到其他园区。
- 新增园区成功后必须刷新并持久化当前用户上下文，使 `accessible_parks` 在同一会话立即包含新园区。
- 楼栋创建继续通过 `/auth/switch-context` 获取目标园区 JWT 后再提交；后端 DTO 不新增可伪造的目标 `parkId`。
- 用户可见错误信息和园区标签使用中文或真实业务名称，不再把“当前园区”作为可选园区名称。
- 修复后需横向验证 building、floor、unit 及至少一个非 asset 启用模块的规则初始化契约。
- CI 必须包含防复发契约：平台标准 scope 中每个受支持规则都能由 provisioning 按有效 module assignment 投影，且租户/园区/套餐变更入口不能绕过该机制。

## Acceptance Criteria

- [ ] 新租户创建成功后，其默认园区存在当前启用模块的标准编码规则；楼栋、楼层、房源编码留空均能成功自动生成。
- [ ] 同一租户新增园区成功后，新园区规则独立初始化，首个楼栋从目标 scope 的初始序列生成，不复用旧园区序列。
- [ ] 重复执行 provisioning 或迁移不产生重复规则，不重置现有 sequence，不恢复已禁用/软删除规则，不覆盖管理员定制前缀/模板。
- [ ] 在既有 scope 后续启用一个带标准编码规则的模块时，规则自动补齐；未来新增标准规则若未被动态 provisioning 覆盖，契约测试失败。
- [ ] 迁移能补齐现有活跃 scope 的缺失标准规则，并在平台标准 asset 核心规则不完整时明确失败。
- [ ] 历史 home park 账号的 `/users/me` 返回真实 `park_name/current_park/accessible_parks`；不能访问未绑定的其他园区。
- [ ] 不再从同一用户的其他 tenant 关系回退 `accessible_parks`；停用/删除 home park 或未绑定的其他园区均不可见。
- [ ] 新增园区后无需重新登录，楼栋“所属园区”下拉立即显示新增园区及真实名称。
- [ ] 选择不同园区创建楼栋时先安全切换上下文，创建结果只在目标园区可见，原园区列表无串数据。
- [ ] API/Web 单测、迁移契约与真实 PostgreSQL 验证、lint、typecheck、build、相关 E2E 全部通过。
- [ ] 使用本地 Windows Chrome `--headless=new`、随机 CDP 端口和独立临时用户目录完成桌面与 390px 真实 DOM 验收，无根级横向溢出。
- [ ] 中文 Issue/PR 完成 Codex Review 循环，未解决线程为 0，CI/Release Smoke 全绿后自动合并，并监控部署、健康检查与 Docker 清理成功。

## Out of Scope

- 不允许通过连接生产数据库、生产 API 或生产页面完成开发自测。
- 不实现楼栋跨园区搬迁；已创建楼栋的园区保持不可编辑。
- 不把 legacy `/assets/*` 投影 API 与 `/parks`、`/buildings`、`/floors`、`/park-units` 业务链合并。
- 不重构全部认证上下文或引入新的全局状态库。
