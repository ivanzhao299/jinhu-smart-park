# 抽屉页面样式根治与统一

## Goal

消除全站抽屉(Drawer)页面的样式与交互漂移,将所有抽屉收敛到唯一的共享
`@jinhu/ui <Drawer>` 组件与一套统一规范,实现"所有抽屉页面视觉/交互一致、移动端可用、符合设计系统与上传/表单基线"。

## Background（实证)

通过本机起全栈(PostgreSQL 16 + API + Web,admin 登录)并用真实浏览器对 14 个模块
新增抽屉桌面(1440)+ 移动(390)截图,确认以下系统性缺陷(根因:共享组件用法各异 +
全局 `drawer-*`/`form-stack`/`ds-compact-drawer` 辅助类混用):

| # | 缺陷 | 证据页 |
|---|---|---|
| 1 | 头部不统一(eyebrow+标题+描述 vs 纯标题) | 摄像头/巡检 vs 合同/用户 |
| 2 | 宽度不统一(520 vs 680 vs 840) | 合同(ds-compact) vs 摄像头 |
| 3 | 栅格列数不统一(2 vs 3 列) | 合同 vs 摄像头 |
| 4 | 字段竖向间距失控(裸 form-stack) | 新增用户 |
| 5 | 底部按钮顺序相反(取消\|保存 vs 保存\|取消) | 合同 vs 用户 |
| 6 | 复选框裸态/错位 | 巡检点、可访问园区、摄像头启用 |
| 7 | 文件用裸 ID 文本框(违反上传基线) | 合同正文/扫描件 ID、平台设备 ID |
| 8 | 多选用原生 multi-select,溢出难看 | 巡检计划 责任人/责任角色 |

非缺陷(已排除):原生日期控件显示 `mm/dd/yyyy` 是无头测试浏览器区域设置所致,
真实 zh-CN 浏览器正常,不修。

## Scope

- 覆盖**所有**抽屉页:66 个已用共享组件(需收敛用法)+ 7 个未用共享组件(需迁移)。
- 7 个迁移目标:
  - components/video/VideoEvidencePanel.tsx
  - components/assets/AssetCrudPage.tsx
  - components/files/FilePreview.tsx
  - app/system/branding/page.tsx
  - app/workorders/[id]/page.tsx
  - app/workorders/list/components/WorkOrderStatusActionPanel.tsx
  - app/assets/units/components/UnitStatusActions.tsx

## Out of Scope

- 业务逻辑/接口/数据模型变更。
- 抽屉之外的页面排版(列表、看板、仪表盘)除非与抽屉触发直接相关。
- 后端 DTO/校验变更——仅当 #7 改为上传组件且需要后端字段对齐时,单独记录风险,不在本任务擅自改财务/认证/迁移相关后端。

## Requirements

- R1 唯一规范:所有抽屉使用 `Drawer + DrawerHeader + DrawerForm + DrawerFormGrid + DrawerFooter`,
  禁止裸 `<form className="form-stack">` 作为抽屉主体。
- R2 头部三件套:`DrawerHeader` 统一传 `eyebrow`(域)、`title`、`description`、`onClose`、`closeIcon={<X/>}`。
- R3 宽度按内容定档:`size="md|lg|xl"`,移除随意的 `ds-compact-drawer`/页面级宽度覆盖;
  同信息密度的抽屉用同一档。
- R4 栅格统一:多列用 `DrawerFormGrid`,整宽字段用 `DrawerFormGrid single`,不手写列数。
- R5 底部按钮顺序统一:`取消`(secondary)在前、`保存/提交`(primary)在后。
- R6 复选框/单选/多选统一为设计系统样式(组件层提供一致外观,消除裸原生控件错位)。
- R7 文件类字段统一使用共享 `FileUploader`/附件组件,不暴露裸"文件 ID"文本框
  (前端 UX;若涉及后端字段,记录风险,后端改动单独评审)。
- R8 移动端(≤760px / 390px)无横向溢出,头部、表单、sticky 底部按钮、安全区适配正常。
- R9 不破坏现有提交/校验/权限(PermissionButton)/编辑回填行为。

## Acceptance Criteria

- [ ] AC1 所有抽屉页(73)均使用统一的 Drawer 组合结构(无裸 form-stack 抽屉主体)。
- [ ] AC2 头部三件套一致;同域 eyebrow 文案规范。
- [ ] AC3 宽度档位一致,无页面级随意宽度覆盖残留。
- [ ] AC4 底部按钮顺序全部为 取消→保存。
- [ ] AC5 复选/多选/上传控件统一,无裸原生控件错位、无裸文件 ID 文本框。
- [ ] AC6 桌面 1440 + 移动 390 双视口截图回归通过,抽屉间视觉一致、移动端无溢出。
- [ ] AC7 `pnpm lint`、`pnpm typecheck`、`pnpm --filter @jinhu/web build` 通过。
- [ ] AC8 抽样核心链路(合同/用户/工单/巡检/资产)提交与编辑回填功能正常。

## Constraints

- 仅改前端表现层与共享 UI 组件;遵守 AGENTS.md 设计系统、移动端、上传/表单基线。
- 分批进行,每批独立可验收(截图 + lint/typecheck);不做无关重构。
- 不提交密钥;不改 release/auth/migration/seed/financial 后端行为。
