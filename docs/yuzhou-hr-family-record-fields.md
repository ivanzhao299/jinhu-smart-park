# 家庭档案七字段前端接线（2026-09-05）

## 要求与范围

本片补齐已有受权 API 投影在现代员工档案中的展示，不新增数据库写入、来源抽取或生产执行权限。
候选基于 `68d15249da4ba8e680498f0b6c87df56459196de`（PR #630），不表示该提交已部署。

旧字段关系以 `legacy-family-query-parity-v1.json` 的已绑定映射为依据，本片未重新读取个人行值。

| 旧表字段 | 现有 API 字段 | 现代页面标签 |
| --- | --- | --- |
| family.member | fullName / fullNameMasked | 姓名 |
| family.rela | relationship | 关系 |
| family.birthday | birthDate | 出生日期 |
| family.jobunit | workUnit | 工作单位 |
| family.jobname | jobTitle | 职务 |
| family.political | politicalStatus | 政治面貌 |
| family.tel | contact / contactMasked | 联系方式 |

`HrEmployeeFamilyRecord` 补齐可选投影类型；`HrFamilyRecords` 由员工页传入实际 records 和
精确 `HR_EMPLOYEE_FAMILY_READ` 权限。组件不请求额外数据，也不在浏览器解密。
`fieldAccess.family !== true` 时无论数组是否非空均不展示记录；没有完整读取权限时只用脱敏值。
空集明确提示，缺失值显示“未登记”；日期直接使用服务端业务日期，不作时区转换。

独立复核发现原 API 查询直接返回 PostgreSQL DATE，安装的 pg 驱动会将其解析成
JavaScript Date；在本机时区，合成 `1960-02-29` 会序列化为前一天的 UTC 时间戳。
因此本片同时将家庭查询收窄为 `to_char(birth_date, 'YYYY-MM-DD') "birthDate"`，
让驱动接收文本而非日期对象，并保持 null。未改权限、审计、查询范围或存储值。
新增 `hr-family-date-projection.spec.ts` 检查完整/本人投影的 SQL、闰日、空值、作用域和审计；
这是服务桩测试，不是实际 PostgreSQL 或旧数据运行证据。

## 已执行的技术验证

- `pnpm --filter @jinhu/shared build`：通过，使用本候选自己的工作区依赖。
- `pnpm --filter @jinhu/api build`：通过。
- API/Web `typecheck` 与变更文件 scoped ESLint：通过。
- 新日期服务回归与原 materialized-projection 测试：5/5，无跳过；未连接数据库。
- `pnpm --filter @jinhu/web test:unit:hr`：99/99，无跳过，其中新增 React SSR 8 项。
- SSR 覆盖完整/脱敏、越权完整值、拒绝非空数组、空集、空值、Unicode/HTML 转义、多记录同级卡片。
- 本地真实 Next 员工页连接 `127.0.0.1:4207` 合成 API；未连接生产或旧库。
- 完整权限案例：1440px 和 390px 页面均出现七项字段；document scrollWidth 分别等于 1440 和 390。
- 390px 脱敏本人角色：姓名和联系方式仅显示掩码；拒绝角色出现“无家庭成员档案查看权限”。
- 390px 超长字段案例：实测卡片 clientWidth/scrollWidth 均为 317px，页面宽度仍为 390px；截图目视确认换行。
- 空集和空值通过 SSR 验证，本次未单独执行这两项浏览器案例。

复现：显式设置 `HR_FAMILY_VISUAL_UAT=yes` 启动
`node scripts/e2e/hr-family-visual-uat-mock.mjs`，再以
`NEXT_PUBLIC_API_TARGET=http://127.0.0.1:4207 pnpm --filter @jinhu/web exec next dev --hostname 127.0.0.1 --port 3207`
启动真实 Web。合成登录用户名 `full`、`masked`、`denied`、`empty`、`nulls`、`long`；
密码字段填任意非空合成测试文本，服务不验证真实密码。登录后访问 `/hr/employees` 并点击“查看档案”。
此服务仅绑定 loopback、无数据库访问，拒绝除合成登录/退出之外的写请求；不得用于生产。

## 证据同步和边界

家庭验证器由旧内联数组检查改为页面接线、独立组件和 DTO 检查；实际渲染另由 SSR 与浏览器验证。
同步此次页面/API/组件变化影响的 family、knowhow、professional-title、performance print、frozen、employment 引用链。
professional-title 的额外旧 service 引用已经审查：仅共享敏感服务 import 路径变化，无业务语义变化。
五组相关 Node 契约 38/38 通过，包含错误组件 hash 和错误增加兼容积分的拒绝测试。
日期修复完成后，联合运行 family、knowhow、frozen、employment、professional-title、
performance print、progress v2、enterprise roadmap 八组契约：61/61，无跳过。

现代七字段技术接线不能代替旧客户端运行等价、全量逐行校验或业务验收。
`currentModernFamilyPanel` 单独记录本片实现，原 legacy 验收信用不增加，生产仍 HOLD。
其他既存过期合同不因本片自动认可；没有运行全量 A/B、工资提取、生产导入或数据库迁移。
未执行本地完整 Web 生产构建：本片已有实际 Next 页面编译、Web 类型/单元测试和定向 lint，
全量生产构建交由 PR CI；不以本地开发编译冒充发布验证。
浏览器验收结束已退出合成账号、恢复视口，并停止端口 3207/4207 的本片服务。
