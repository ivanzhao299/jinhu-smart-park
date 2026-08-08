# 上传文件中文名称编码修复

## Requirement

上传包含中文的文件名后，文件列表、预览和下载使用正确原始名称，不出现 multipart 编码乱码；ASCII 文件名保持不变。

## Acceptance Criteria

- [ ] API 在保存文件名和计算扩展名前规范化 multipart 原始文件名。
- [ ] 中文 UTF-8 文件名正确恢复。
- [ ] ASCII 和已正确解码的 Unicode 名称不被破坏。
- [ ] 单元测试覆盖三类名称。
