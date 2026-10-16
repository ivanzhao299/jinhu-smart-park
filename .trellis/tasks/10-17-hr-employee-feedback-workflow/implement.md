# 执行与验证

1. 完整阅读相关AGENTS、层spec索引与必要规范，检查真实表/角色/幂等/审计模式；先确定HR_PAGE与self/park_review权限组合和当前最大迁移编号，禁止杜撰列/命令。
2. Shared合同、前向迁移、DTO/service/controller、HrModule注册；实现正式状态与同事务审计/幂等，真实隔离PG及HTTP权限/并发/失败回滚测试。
3. 现代页面/hr/employee-feedback、API client、导航入口、DS/mobile；交互测试覆盖写失败/未知结果重试/写成功刷新失败/身份和选择漂移/完整分页。
4. 聚焦旧审批/HR权限回归及API/Web/shared lint/typecheck/build；新代码输入不变复用结果，不重复全库导入或大范围测试。
5. 独立Trellis检查和实际组件桌面/390浏览器检查。生产真实身份仍需登录，不因该项等待冻结其他开发。
6. 最新远端同步，精确diff审查，PR/CI/合并/部署/health/Docker清理/运行SHA证明；生产只读，禁止合成投诉或假员工。本地通过不等于生产角色/旧端业务等价完成。

长任务与完整范围保持active；工资2026年7月/全部93已导入记录/吴恩国/只算不发不变。采用单实现者+串行复核，不新建重复工作区，不调整供应商或凭据。

## 实现交接（2026-10-17）

Shared/376SQL/API/页面/导航/4菜单锚点已完成本地实现。Shared合同2、真实完整迁移PG/HTTP1、Webfeature+adapter14、既有审批9、menu22、source-role11全部通过且0skip；API和Web lint/type/build固定exit0。旧函数OID/ACL/定义和工资/source表指纹守恒，ownedPG容器精确清理。完整哈希与结果见私有implementation/manifest.json。任务仍in_progress，独立审查/实际桌面390浏览器/发布以及生产岗位验收待根代理执行。没有生产合成数据、提交或部署；旧规则/真实角色等价仍未证明。

## 独立复核修复

复核修复context失败恢复与服务端范围变化清理、历史翻页/失败覆盖未保存草稿、同记录重新选择不重读，以及PG fixture硬编码本机证据路径。修复后的聚焦证据及完整文件哈希在私有review/manifest.json；原API/SQL/shared业务实现未改，复用记录与新运行明确区分。桌面/390浏览器及发布仍由根代理继续。
