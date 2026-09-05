# 玉舟 HR 独立文件访问叶子模块

## 目标

`HrFilesModule` 与现有集成版 `FilesModule` 复用同一套 `FilesController`、`FilesService`、文件存储、审计和 HR 业务授权逻辑。独立 HR 启动图不再装载 `PropertyOperationsModule` 或 `PropertyUnitAccessService`。

## 组合边界

- 集成版继续导入 `FilesModule`。它通过 `FILE_PROPERTY_UNIT_ACCESS_PORT` 注入 `IntegratedPropertyUnitAccessAdapter`，原样委托现有物业单元范围校验。
- 独立 HR 版导入 `HrFilesModule`。它通过同一端口注入拒绝型叶子适配器，且只允许明确登记的 HR 受保护 `biz_type`。
- 两个组合模块互斥选择，均由 `FilesKernelModule` 组装同一个文件内核；不得在同一个应用启动图中同时加载。
- HR 叶子对缺失 `biz_type`、通用文件、物业文件、品牌 Logo 和身份材料默认拒绝。它不会因为相关表存在、通用文件权限或超级用户身份而放行非 HR 文件。
- HR 文件仍执行现有 tenant/park、park/team/self、精确权限、敏感投影和必需审计规则。本切片不新增企业范围、不改数据库结构，也不改变集成版物业文件行为。

## 启动选择

集成 Smart Park 继续使用既有 `FilesModule`，无需调用方改动。未来独立 HR 组合根只应选择 `HrFilesModule`；该组合根不属于本切片，不能通过同时导入两个模块来模拟独立运行。

## 验证边界

- 真实 Nest provider graph 必须证明 `HrFilesModule` 可解析文件服务、存储和 HR 访问服务，同时不存在物业服务 provider。
- HR 正向访问、跨租户/园区或员工范围拒绝、非 HR 零查询拒绝必须由行为测试覆盖。
- 集成适配器必须由端口 token 解析，并继续委托现有 `PropertyUnitAccessService` 的授权结果；不得用表存在检查替代物业范围校验。
