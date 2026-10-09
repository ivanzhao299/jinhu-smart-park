# 设计

在独立codex/hr-reward-category-versions-20261009候选，初始基线cc01c9641，现已整合PR901最终main bd486e60a。PR901观察器拥有其独立发布工作区。仅父任务children清单冲突，保留两个子任务；hr-api不同领域新增行自动合并。

GET categories/:id/versions 使用MANAGE原子和actor scope；page/page_size沿用严格标量分页元数据（PickType，不接受keyword），REPEATABLE READ内返回category:{id,code,status,currentVersionNo}和items/total/page/page_size。版本items含id/versionNo/kind/name/impactLevel/description/createdAt，倒序稳定分页。配置读取required metadata audit不含字段值。禁用类别可读历史、删除/foreign不可读。

POST既有versions DTO增optional expectedVersionNo整数1..2147483647；现代表单必传，FOR UPDATE后比对409，再插入新版本、移动指针。保留旧调用兼容，不改变旧事项category_version_id。版本历史可回看，当前版本初始化说明后再允许编辑，避免缺失说明误清空。

前端独立版本工作区复用现有类别目录与DS。选择类别/关闭/身份切换取消旧请求并重置目标草稿，失败保留；同期发布与父页面其他写入共用同步锁。未知结果重试保持key和payload；成功先结束草稿再刷新目录/历史，刷新失败单独提示。真实岗位验收不以合成测试替代。
