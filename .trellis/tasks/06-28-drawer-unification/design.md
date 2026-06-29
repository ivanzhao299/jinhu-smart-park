# 技术设计 — 抽屉统一

## 1. 现状边界

- 共享组件:`packages/ui/src/components/Drawer/Drawer.tsx`(+ `Drawer.module.css`),导出
  `Drawer / DrawerHeader / DrawerActions / DrawerTabs / DrawerTabButton / DrawerForm /
  DrawerSection / DrawerFormGrid / DrawerFooter / DrawerDetailGrid / DrawerDetailItem`。
- 66 个页面已 `import ... from "@jinhu/ui"` 且使用 Drawer,但用法不一(见 prd #1–#8)。
- 7 个页面未用共享组件(裸 overlay / 全局类 / AntD-free 自定义),需迁移。
- 全局辅助:`apps/web/app/globals.css` 提供 `.primary-button/.secondary-button`、
  `input[type=checkbox]` 样式、`.checkbox-list/.checkbox-row`、`.drawer-*` 遗留类、
  `.form-stack`、`.ds-compact-drawer`(组件 CSS 内有 `:global(.ds-compact-drawer)` 分支)。
- 上传:`components/files/FileUploader.tsx`(props: `bizType`,`bizId?`,policy 驱动 accept/maxSize)。

## 2. 唯一规范(Canonical Drawer Pattern)

每个抽屉(表单类)统一为:

```tsx
<Drawer size="md|lg|xl" onClose={close}>
  <DrawerHeader
    eyebrow="<域名,如 视频点位 / 招商租赁 / 系统管理>"
    title={editing ? "编辑X" : "新增X"}
    description="<一句话说明该抽屉用途>"
    onClose={close}
    closeIcon={<X size={18} />}
  />
  <DrawerForm onSubmit={submit}>
    <DrawerFormGrid>{/* 成对字段 */}</DrawerFormGrid>
    <DrawerFormGrid single>{/* 整宽字段:备注/上传/多选 */}</DrawerFormGrid>
    <DrawerFooter>
      <button className="secondary-button" type="button" onClick={close}>取消</button>
      <button className="primary-button" type="submit">保存</button>
    </DrawerFooter>
  </DrawerForm>
</Drawer>
```

详情类(只读)抽屉:`DrawerHeader` + `DrawerDetailGrid/DrawerDetailItem`(+ 可选 `DrawerTabs`)。

### 规范细则
- **R2 头部**:必须传 `eyebrow + title + description + onClose + closeIcon={<X/>}`。
  eyebrow 文案按域取统一词表(见 §5)。
- **R3 宽度档**:
  - `md`(≈720):字段 ≤ 6、单列为主(状态变更、简单新增、导入)。
  - `lg`(≈840):标准 CRUD 表单(默认档,多数页面)。
  - `xl`(≈960):字段密集 / 含子表 / 多 Tab 详情(合同详情、巡检计划)。
  - 移除页面级 `ds-compact-drawer`、`contract-drawer`、内联 width;统一走 size 档。
- **R4 栅格**:成对字段用 `DrawerFormGrid`;整宽(备注、上传、多选、长描述)用
  `DrawerFormGrid single`;不手写 grid 列数 / 不用裸 `.form-stack` 当主体。
- **R5 底部**:`取消`(secondary)在前,`保存/提交`(primary)在后,均带 lucide 图标可选但顺序固定。
- **R6 选择控件**:复选框统一包 `.checkbox-row`(或 `.checkbox-list>.checkbox-row`),
  依赖既有全局 `input[type=checkbox]` 样式;多选优先用 `.checkbox-list` 卡片化,
  避免裸原生 `<select multiple>`(溢出/错位)。
- **R7 文件字段**:凡"文件 ID/扫描件 ID/附件"语义,改用 `<FileUploader bizType=... bizId=.../>`
  + 附件列表预览,移除裸文本 ID 输入。**若后端仅接受 fileId 字符串**,前端用 uploader 产出
  的 fileId 回填隐藏值,不改后端契约;无法在不动后端的情况下完成的,记入风险并保留原输入但
  标注 TODO(不在本任务改财务/认证相关后端)。

## 3. 组件层强化(B0,先做,降低 73 页改动风险)

在 `Drawer.tsx` / `Drawer.module.css` 做"默认即正确"的收敛,使后续页面改动更小、回归更稳:

- `DrawerHeader`:`closeIcon` 默认改为 lucide `X`(目前默认是 `×` 字符)——但需避免在
  组件包内引入 lucide 依赖耦合;**决策**:保持组件默认 `×`,在页面统一传 `closeIcon={<X/>}`
  (lucide 已是 web 依赖,组件包不强依赖)。记录于实现说明。
- `DrawerFooter`:CSS 已 sticky;补充"按钮等高/最小宽度/移动端等分"一致性(已有,核对)。
- 复选框:确认全局样式覆盖到抽屉内;如个别错位来自缺 `.checkbox-row` 包裹,统一在页面修。
- 移除/弱化 `:global(.ds-compact-drawer)` 的页面依赖:保留 class 以兼容,但页面不再使用;
  最终若无引用可在末批清理(谨慎,避免影响 login-panel 等复用)。

> 原则:组件层只做"加强默认 + 不破坏现有 API"的改动;结构性收敛在页面层完成。

## 4. 分批架构(每批独立可验收)

| 批次 | 范围 | 文件数(约) |
|---|---|---|
| B0 | 组件/规范加固 + 范本固化(以 cameras 为黄金范本) | 2–3 |
| B1 | system/*(users,roles,permissions,tenants,dicts,code-rules,data-scopes,field-policies,modules,branding) | 10 |
| B2 | leasing/*(contracts,tenants,receivables,payments,invoices,waivers,leads,lead-pool,checkouts,contract-changes) | 12 |
| B3 | assets/*(units 组件群,buildings,floors,parks,unit-status-board)+ AssetCrudPage | 10 |
| B4 | safety/*(inspect-plans,inspect-points,inspect-templates,inspect-tasks,work-permits,emergencies,emergency-contacts,emergency-plans,hazards) | 9 |
| B5 | workorders/*(list 组件群,[id],detail/form/assign/close/process dialogs,sla-rules) | 9 |
| B6 | energy/*(7)+ iot/*(5)+ admin/iot(4)+ admin/video-security(3,黄金范本已合规) | 19 |
| B7 | operations(QuickWorkOrder,InspectionExecution)+ tenant-service + files/FilePreview + video/VideoEvidencePanel | 5 |

迁移 7 文件分散在 B1(branding)、B3(AssetCrudPage,UnitStatusActions)、B5(workorders [id],
WorkOrderStatusActionPanel)、B7(FilePreview,VideoEvidencePanel)。

## 5. eyebrow 域词表(R2)

- system → `系统管理`;leasing/contracts/finance → `招商租赁`;assets → `资产空间`;
  safety → `现场安全`;workorders → `工单运维`;energy → `能源管理`;
  iot → `物联设备`;video-security → `视频点位`;operations → `运营终端`;tenant → `租户服务`。

## 6. 验证策略

- 每批后用 `scratchpad/shot.mjs` 对该批代表页桌面(1440)+ 移动(390)截图,
  人工核对头部/宽度/栅格/按钮顺序/复选/上传/溢出。
- 每批后:`pnpm lint`、`pnpm typecheck`、`pnpm --filter @jinhu/web build`(或集中在批末)。
- 末批:全量 14+ 抽屉重截一次做一致性总览;抽样提交/编辑回填功能验证。

## 7. 兼容性 / 回滚

- 纯前端表现层改动,按批提交,单批可 revert。
- 不改后端契约;#7 涉及后端处单独标注、不阻塞其余批次。
- 保留遗留全局类直至确认无引用再清理,避免误伤 login-panel 等复用点。

## 8. 取舍

- 不引入新 UI 库 / 不改技术栈(遵守 AGENTS.md:仅 lucide、仅 CSS Variables)。
- 不为个别页面新增页面级抽屉 CSS;特例只允许域内布局微调,不重定义颜色/阴影/边框/按钮系统。
