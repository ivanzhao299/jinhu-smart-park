# 验证（2026-10-10）

- Web员工/社保相关交互21项通过，覆盖入口权限、准确员工、分页月份刷新、过期响应和非法URL；adapter检查实际employee_id运输。
- API台账与DTO检查10项通过，覆盖UUID负例及park/team/self原范围与员工条件同时保留，原字段投影/audit行为保持。
- API/Web typecheck通过，受影响API/Web ESLint通过；HR回归222项通过。
- 实际组件与CSS使用合成数据检查桌面及390px iframe；内容宽385=scrollWidth385，无横向溢出，按钮最小44px；手机分页正常。发现原42px后局部修正并重查。
- git diff --check通过；不更改权限、数据库表、金额、导入或生产业务数据。
- 为控制重复成本，本地不重跑全站构建或新起数据库；完整构建/既有数据库回归交由候选CI。新增服务检查为查询构建器范围断言，不能描述成真实角色/生产/完整数据库验收。
- 真实岗位生产验收与工资金额双轨仍未完成，原Windows VM本轮观察为已中止，没有新源端运行等价证明。

浏览器及相关日志：/Users/mac/.codex/artifacts/hr-employee-insurance-context-20261010/。页面服务器和临时页已关闭。发布状态独立记录。
