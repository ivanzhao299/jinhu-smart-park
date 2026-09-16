# 设计

沿用公寓申请状态机、权限和 Design System。新增 nullable 申请字段；身份证密文及 key id 放入以申请 ID 为主键的独立私有表，避免现有 SELECT/RETURNING * 泄露。
复用 PartySensitiveDataService；创建申请和写入身份表共用事务。申请响应只携带服务器计算掩码。健康信息仅收集住宿相关情况，不强制提供。
