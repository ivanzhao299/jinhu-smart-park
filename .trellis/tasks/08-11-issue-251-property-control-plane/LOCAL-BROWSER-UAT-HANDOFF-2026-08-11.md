# Issue #251 本地真实浏览器 UAT 交接

## 权威范围

- 分支：`codex/issue-251-property-control-plane`
- 当前代码基线：`0ee588fb6e2fd748fbdb268057bb1ea1ac234dc0` 加本任务未提交差异；浏览器取证前必须改为记录最终提交 SHA。
- 工作树：`/home/jinhuit/JinHuCodebase/jinhu-smart-park-issue-251-property-control`
- GitHub Issue：`https://github.com/ivanzhao299/jinhu-smart-park/issues/251`
- 仅允许本地隔离环境，不得访问生产 URL、账号、密钥或数据。

## 本轮已验证

- 隔离 PostgreSQL：`127.0.0.1:55434`，数据库 `jinhu_issue251_uat`。
- API：`http://127.0.0.1:3313`；`/api/v1/health` 返回 200。
- Web：`http://127.0.0.1:3013`；`/login` 返回 200。
- migration 201/201 通过，开发 seed 仅用于一次性本地数据库。
- 本地授权角色调用以下端点均返回 200：
  - `/api/v1/property/operations`
  - `/api/v1/property/occupancies`
  - `/api/v1/property/mode-transitions`
  - `/api/v1/housing/unit-candidates`
- API 调用只作为运行时补充核验，不能替代真实 Chrome 页面证据。
- 住房租约资格命令在事务内先取得 `lock_property_unit_scope(tenant, park, unit)`，与占用和模式写入串行，避免检查通过后被并发占用的 TOCTOU。

## 真实 Chrome 必测矩阵

最终人工复核仍应使用 Windows Google Chrome 正常用户 Profile，通过 `http://127.0.0.1:3013/login` 登录本地开发账号；凭据从本地 dev seed 文档取得，不写入证据或仓库。2026-08-12 已按用户指定的参考流程，使用 Windows 原生 Chrome 151 `headless=new`、CDP 与临时隔离 Profile 完成同一批本地页面自动取证。

1. 桌面与 390px 分别验证资产菜单仅新增以下三个独立入口，且无横向溢出：
   - `/assets/property-operations`
   - `/assets/property-occupancies`
   - `/assets/property-mode-transitions`
2. 经营配置详情 `/assets/property-operations/{unitId}`：
   - 可更新资产映射、经营状态和备注；刷新后值保持。
   - `none -> long_rent`、`long_rent -> short_stay`、`mode -> none` 均只能提交审批申请；不得出现免审批直切入口。
   - 缺少必填原因、存在 blocker、并发旧版本时显示稳定错误且无误写。
3. 占用控制面：
   - 人工来源只允许 `maintenance`、`operations`。
   - 正常人工占用可由具备 release 权限的角色直接释放。
   - 民宿、住房、商业租赁等业务占用不得普通释放；强制释放必须创建审批申请。
   - 详情、跨园区和受限 unit scope 不泄露数据。
4. 聚合模式审计：
   - 无 `unitId` 也能看到授权范围内的历史和待审批申请。
   - keyword、unit、模式、时间、审批/执行状态筛选和翻页保持稳定；受限 scope 不出现越权房源。
5. 住房租约：
   - 新建租约选择器只展示 `biz_unit.status=1`、`operating_mode=long_rent`、`operating_status=enabled` 的合格房源。
   - 已有不合格草稿仍可查看；列表/详情显示资格原因，提交按钮禁用，并提供经营配置修复入口。
   - 修复房源配置后刷新，资格恢复；create/submit/审批执行/sign/activate 的服务端重验仍生效。
6. 房源详情抽屉：经营配置、占用记录快捷入口携带正确 `unitId`。
7. 用缺页权限、缺动作权限、受限数据范围角色执行负向验证；按钮不可见或禁用，直访/API fail closed。

## 证据与判定

- 每张截图记录最终提交 SHA、Windows/Chrome 版本、Profile、URL、视口和时间。
- 保留桌面、390px、权限负向、经营配置写入、审批申请、人工锁房/释放、历史草稿阻断的独立证据。
- 任何 500、越权、直接模式切换、业务占用普通释放、选择器出现不合格房源均为 P1/P0，不得标记任务完成。
- 2026-08-12 页面矩阵结果为 18 PASS / 0 FAIL，证据根为 `D:\lishuai\JinhuWork\智慧园区UAT测试\2026-08-12\14-issue251-property-control-plane`。执行方式为 Windows 原生 Chrome 151 `headless=new` + CDP + 临时隔离 Profile，目标仅为本地隔离 API/Web；没有使用 Playwright、内置浏览器或 API 结果冒充页面截图。
- 该结果不是人工正常用户 Profile 操作；最终提交 SHA 形成后必须重新绑定证据。它不能替代真人岗位签署、发布审批或生产环境验收。
- 浏览器全通过后仍仅能关闭本任务页面验收门，不代表真人业务签署或 `production_ready`。
