# Engineering Attachment Capability

## 定位

EngineeringAttachment 是 EPDR Phase 1 的统一附件边界，用于让工程项目、计划、施工日报、巡检、问题、整改和验收都能引用现场照片、PDF、CAD、Word、Excel 等资料。

Phase 1 不重复实现文件上传存储，而是复用现有 Files Runtime。工程 Runtime 只保存 `attachment_ids` 引用，并在写入前校验文件是否属于当前 `tenantId` 与 `parkId`。

## 当前实现

- `EngineeringAttachmentService` 统一处理附件引用。
- 输入字段使用 `attachment_ids?: string[]`。
- 内部字段保存为 `attachmentIds: string[] | null`。
- 写入前通过 `FilesService.detail(scope, fileId)` 校验文件存在且在当前租户/园区范围内。
- 重复 `attachment_ids` 会自动去重。
- 非法或越权文件引用会返回明确业务错误。

## 已接入对象

- EngineeringProject
- EngineeringPlan
- EngineeringDailyReport
- EngineeringInspection
- EngineeringIssue
- EngineeringRectification
- EngineeringAcceptance

## 数据库

Task 025 为工程项目和工程计划补齐附件引用列：

- `biz_engineering_project.attachment_ids jsonb`
- `biz_engineering_plan.attachment_ids jsonb`

施工日报、巡检、问题、整改、验收在各自模型中已包含 `attachment_ids`。

## API 规则

创建或更新工程对象时可传入：

```json
{
  "attachment_ids": ["file-id-1", "file-id-2"]
}
```

服务端保证：

1. 不保存真实文件内容。
2. 不绕过租户和园区边界。
3. 不接受不存在的文件引用。
4. 不在工程对象表内存储文件 URL、路径或外部凭证。

## 前端边界

Phase 1 前端保留附件引用字段和类型能力。真实上传、预览、删除、批量附件管理将在统一文件中心页面中完成。

## 后续扩展

- 附件预览与图片墙。
- CAD/PDF 在线预览。
- 文件版本与签章。
- 验收资料归档。
- 物业移交资料包。
- AI 识图与质量安全问题识别。
