# 验证与边界

- 基线93a695b2，独立工作树、单代理；API/Web @jinhu/shared路径均解析至本工作树。
- shared实际build，API实际ValidationPipe/路由/权限/读失败契约4项通过。
- 当前迁移链全部应用至000361，真实PG5项通过：创建、CAS并发、审计回滚、23版本完整分页、历史禁止修改/删除、园区隔离；临时数据库已整体删除，未禁用触发器。
- Web相关10文件93项实际交互回归通过，包括日期范围顺序提交旧回归、真实父页操作角色与读取角色隔离、网络参数与幂等键。
- API/Web类型与定向lint通过；完整构建和全仓回归交给发布CI，不重复本地全仓构建。
- 实际组件+共享CSS编译后通过in-app browser检查1280/390px壳。内文宽度1275/385，scrollWidth相等，编辑就近展开、DS按钮、桌面/手机历史可见。截图和sourcehash在私有hr-attendance-work-calendar-20261011/browser。合成transport，不代表真实生产岗位验收。
- 无生产业务写入；待CI、合并、部署与运行版本核验。旧GroupWeb公共假日/计薪/假期余额/销假规则未独立证明，不授予旧功能等价完成。

## Cost Summary
Task: HR工作日历维护与排班引用
Status: LOCAL_VALIDATION_COMPLETE_RELEASE_PENDING
Files changed: API/DTO/迁移、共享契约、Web工作日历与排班、测试与任务规范
Tests run: API4、PG5、Web93、shared build、API/Web typecheck及lint、桌面390px浏览器
Retries: 类型/测试断言/历史桌面显示修正后定向验证；不存在环境失败驱动业务绕过
Approx model rounds: 约50，实际token和金额不可用
Repeated scans avoided: COST_GUARD后停止大索引重复读取；单代理、无旧导入重跑、无本地全仓重复构建
Blocked issues: 无全局阻断；原旧功能独立业务取证与真人角色UAT仍待完成
Next step: PR/CI/合并、生产部署健康清理和运行版本核验
