# Issue #336 技术 UAT 证据

## 候选与环境

- 基线 SHA：`f267215aab9ef7cd36c26529b86e013afc549ba3`
- 验证代码候选 SHA：`fe904e5aa182a1eeca0ffedab1532bd7075919eb`
- 最终 PR head SHA：`60f2b6e8c1e938e5a5d1191836f8d177ce9dbb62`
- main merge SHA：`ed8cfd2450c6320e6e0be7dfc773db698d4c9303`
- 验证时间：2026-08-21（Asia/Singapore）
- 一次性数据库：`jinhu_property_api_e2e_issue336`
- 一次性 Compose project：`property-api-e2e-issue336`
- API：`127.0.0.1:33061`；Web：`127.0.0.1:33060`
- 隔离：独立 PostgreSQL 命名卷、独立 API 文件命名卷、独立审批账号与转收费审批账号

## 自动化验证

| 门禁 | 结果 | 摘要 |
|---|---|---|
| Housing Web unit/static | PASS | 15 tests（包含高风险失败保留、刷新失败分流与分页回归断言） |
| Housing API unit | PASS | 124 tests：122 pass，2 个 PostgreSQL 专项因该轮命令未注入 `DATABASE_URL` skip；真实 DB 链路由下方 E2E 覆盖 |
| Shared contracts | PASS | 31 tests |
| API/Web/Shared typecheck | PASS | 无类型错误 |
| API/Web/Shared lint | PASS | 无 lint 错误 |
| workspace production build | PASS | API 与 169 个 Web routes 构建成功 |
| Housing real API E2E | PASS | `property-api-1787243088758-0fc6e47d`，租客到退租完整链路 |
| cleanup | PASS | `remaining_containers=`；`remaining_volumes=` |
| PR head CI/Release Smoke | PASS | GitHub Actions run `32395805698` |
| main CI/Release Smoke | PASS | GitHub Actions run `32398415997` |
| Deploy Production | PASS | GitHub Actions run `32398416019`；健康检查、公开生产保护账号校验、Release Smoke 与 Docker cleanup 成功 |
| Codex Review | PASS | PR #337 最新复审结论：`Didn't find any major issues.` |

真实 API E2E 覆盖：登录、分离审批人、长租合格房源、跨权限拒绝、租客、租约提交/审批/签署/生效、占用、周期账单、409 防重复、押金、附件、报修与工单、采购审批/付款、两个明细分批转收费、财务结清、退租审批执行和终态写拒绝。

首次 E2E 调用因执行命令遗漏本轮临时管理员环境变量，在登录前返回 401；核对数据库账号与 fixture 正确后补齐变量重跑，正式业务用例全部通过。该前置命令错误不计为产品失败。

## 浏览器 UAT

| 场景 | 结果 | 证据 |
|---|---|---|
| desktop 1440×1000 采购列表 | PASS | 正常列表、分页、详情深链；[截图](../../../../artifacts/issue-336-uat/desktop-purchases.png) |
| URL 越界页 | PASS | `/housing/purchases?page=9` 自动收敛为 `/housing/purchases`，显示 `1/1` |
| 高风险确认 | PASS | 采购审批先打开共享模态框；展示稳定对象、后果、结果状态和必填原因；未填原因时确认按钮 disabled |
| 键盘/焦点 | PASS | Escape 关闭模态框，焦点恢复到“提交审批”触发按钮 |
| mobile 390×844 列表 | PASS | `visibleTables=0`、`visibleMobileRecords=2`、无横向溢出；[截图](../../../../artifacts/issue-336-uat/mobile-purchases.png) |
| mobile 390×844 详情/模态框 | PASS | document 无横向溢出；dialog `left=0,right=356,width=356`，完整位于 390px viewport；[截图](../../../../artifacts/issue-336-uat/mobile-purchase-detail.png) |
| 浏览器网络/console | PASS with note | 业务 document/fetch 均 200；无 error；仅 Next.js CSS preload 未使用警告 |
| Lighthouse mobile snapshot | PASS | Accessibility 100，Best Practices 100；SEO 83、Agentic Browsing 50 不属于本次住房业务阻断 |

浏览器创建了一个仅存在于一次性数据库的采购草稿，用于验证高风险确认框；环境已连同数据库和文件卷销毁。

截图已随候选版本保存在 `artifacts/issue-336-uat/`，完整性摘要如下：

- `desktop-purchases.png`: `21253d5ad79e58f4443e690daa19dcdbbfc981c5dcfcdc0733661e29e5db7934`
- `mobile-purchases.png`: `b895ab3d05c3df15c9cf70a65c498cf060b966bb5a197edfad0a6df034254d08`
- `mobile-purchase-detail.png`: `603c167b0d8e02a6daacada98eeff643bcc4a194f5807bb57b7c65a31fb179dd`

## 状态边界

- 本文只证明 Codex 技术核查、自动化 API E2E 和浏览器技术 UAT。
- PR192 真人业务、财务、安全、发布岗位样本与具名签署仍为 `awaiting_human_gate`。
- 不因本次技术通过将住房模块标记为 `production_ready`，也未启用任何生产模块开关。
- GitHub Issue #336 已关闭；PR #337 已合并到 `main`。本证据只关闭 Issue #336 技术闭环，不关闭 PR192 人工 UAT 生产就绪门禁。
