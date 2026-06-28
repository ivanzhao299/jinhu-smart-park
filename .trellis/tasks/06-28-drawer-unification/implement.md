# 执行计划 — 抽屉统一

黄金范本:`apps/web/app/admin/video-security/cameras/page.tsx`(已合规,作为复制模板)。
验证工具:`/tmp/.../scratchpad/shot.mjs`(已就绪;登录 admin/Jinhu@123456,桌面+移动截图)。
全栈已起:本机 PostgreSQL 16 + API(3001)+ Web(3000)。

## 通用每页改造清单(checklist)
- [ ] 抽屉容器统一为 `<Drawer size onClose>`,移除 `ds-compact-drawer`/页面级宽度/`contract-drawer` 等。
- [ ] `DrawerHeader` 补齐 `eyebrow`(域词表)+ `title` + `description` + `onClose` + `closeIcon={<X/>}`。
- [ ] 抽屉主体改为 `DrawerForm`(替换裸 `<form className="form-stack">`)。
- [ ] 字段用 `DrawerFormGrid` / `DrawerFormGrid single`,删除手写列布局。
- [ ] 底部 `DrawerFooter`:`取消`(secondary)→ `保存`(primary)。
- [ ] 复选框包 `.checkbox-row`/`.checkbox-list`;裸 `<select multiple>` 改卡片化多选。
- [ ] 文件 ID 文本框 → `FileUploader`(bizType/bizId),保留 fileId 回填,不破坏后端契约。
- [ ] 保留 PermissionButton/提交/编辑回填逻辑不变。

## 批次执行(顺序)

### B0 — 组件/规范加固 [foundation]
- [ ] 复核 `Drawer.module.css` footer/复选/移动端,必要的"默认即正确"微调。
- [ ] 不破坏现有 API;以 cameras 为范本确认规范可直接套用。
- [ ] 验证:lint + typecheck;cameras 重截基线图。
- 回滚点:B0 提交。

### B1 — system/*(含迁移 branding)
- [ ] users(重点:去 form-stack、补头部、按钮顺序、可访问园区复选)
- [ ] roles / permissions / tenants / dicts / code-rules / data-scopes / field-policies / modules
- [ ] branding(迁移到共享 Drawer)
- [ ] 验证:截图 users/roles/dicts 桌面+移动;lint+typecheck。

### B2 — leasing/*
- [ ] contracts(去 ds-compact/contract-drawer、补 eyebrow/description、文件ID→上传、定 xl 档)
- [ ] tenants / receivables / payments / invoices / waivers / leads / lead-pool / checkouts / contract-changes
- [ ] 验证:截图 contracts/receivables/tenants;lint+typecheck;合同新增+编辑回填抽样。

### B3 — assets/*(含迁移 AssetCrudPage,UnitStatusActions)
- [ ] units 组件群(FormDialog/DetailDrawer/StatusDrawer/ImportDrawer/StatusActions/AttachmentsPanel)
- [ ] buildings / floors / parks / unit-status-board
- [ ] AssetCrudPage(迁移)
- [ ] 验证:截图 units/buildings;lint+typecheck。

### B4 — safety/*
- [ ] inspect-plans(多选 责任人/责任角色 卡片化、复选点位、定档)
- [ ] inspect-points / inspect-templates / inspect-tasks / work-permits / emergencies /
      emergency-contacts / emergency-plans / hazards
- [ ] 验证:截图 inspect-plans/work-permits 桌面+移动;lint+typecheck。

### B5 — workorders/*(含迁移 [id],WorkOrderStatusActionPanel)
- [ ] list 组件群(DetailDrawer/FormDialog/Assign/Close/Process/Exception/ProcessRecords/StatusAction)
- [ ] [id]/page、sla-rules、StatusActionPanel(迁移)
- [ ] 验证:截图 工单新增/详情;lint+typecheck;工单提交抽样。

### B6 — energy/* + iot/* + admin/iot/* + admin/video-security/*
- [ ] energy:alerts/allocation-rules/billing-adjustments/billing-cycles/billing-items/meters/readings
- [ ] iot:devices/gateways/metrics/alert-rules/alerts
- [ ] admin/iot:rules/scenes/scenes-templates/protocol-configs
- [ ] admin/video-security:cameras(范本,核对)/platform-configs/alerts
- [ ] 验证:截图 meters/iot-devices;lint+typecheck。

### B7 — operations / tenant / files / video(含迁移 FilePreview,VideoEvidencePanel)
- [ ] operations:QuickWorkOrderDrawer / InspectionExecutionDrawer
- [ ] tenant-service:TenantServiceEntryClient
- [ ] files/FilePreview(迁移)、video/VideoEvidencePanel(迁移)
- [ ] 验证:截图 operations 抽屉 桌面+移动;lint+typecheck。

## 收尾(Finish)
- [ ] 全量抽屉重截一次(桌面+移动)做一致性总览,核对 AC1–AC6。
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm --filter @jinhu/web build` 全绿(AC7)。
- [ ] 抽样核心链路提交+编辑回填(合同/用户/工单/巡检/资产)(AC8)。
- [ ] 更新 spec(如沉淀"抽屉唯一规范"到 .trellis/spec/ui/frontend)。
- [ ] 提交 + 推送 `claude/project-overview-architecture-bgzx10` + 建 Draft PR。

## 验证命令
```bash
pnpm lint
pnpm typecheck
pnpm --filter @jinhu/web build
node scratchpad/shot.mjs desktop   # 截图回归(桌面)
node scratchpad/shot.mjs mobile    # 截图回归(移动)
```

## 回滚点
- 每批一个提交;出现回归可单批 revert。
- B0 组件层改动单独成提交,便于隔离。
