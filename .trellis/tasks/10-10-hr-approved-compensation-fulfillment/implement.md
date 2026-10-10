# 实施
1. API shared transaction primitive、scoped source/employee queries、DTO/controller与forward-only关联DDL；实际隔离PG验证新增/替换/多源及普通入口竞争、source/replacement CAS、范围/计划/金额边界、越域权限、audit failure原子回滚、冻结工资无变动。
2. Web shared editor、完整候选/定薪分页、来源队列、严格receipt和原attempt重试、页面互斥/身份隔离；普通入口复用，方案桌面可见，审批页链接。
3. API/Web lint/typecheck/build与相关单元/交互，已有HR回归；实际fresh full migrations（独立fixture）/原355升级到356/不兼容identity index反例；实际组件desktop1280/390px浏览器。
4. 最终独立full-scope check与规格同步，fetch最新main、冲突复验、提交PR、完整CI（DDL需ReleaseSmoke）。
5. root串行合并部署、健康、Docker清理、独立actual API/Web运行SHA证据。真实岗位/UAT/吴恩国latest完整工资期间及规则仍单列，不假称全目标完成。
