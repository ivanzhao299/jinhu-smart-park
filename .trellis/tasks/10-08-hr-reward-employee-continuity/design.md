# 契约与边界

GET /hr/rewards/employee-options?page=1&page_size=20&keyword=<literal>：标准items/total/page/page_size返回，精确HR_REWARD_MANAGE，直属service校验actor tenant/park后执行绑定参数的稳定employee_code,id排序及计数。复用已验证培训候选DTO/查询思路；避免宽泛新抽象，必要时独立小DTO。未知键/数组/空白或非十进制页码拒绝，keyword修剪长度100并转义LIKE特殊字符。读审计仅metadata不记录keyword/个人行。

GET /hr/rewards/case-options：同权限/范围，返回{categories:现有HrRewardCategory[]}，复用私有范围查询，沿用类别可用性。旧categories/options保留兼容。写入端原员工资格和字段权限继续作为最终权威。

Web独立EmployeePicker或领域表单组件，自有query/page及abort/generation，已选对象独立于当前页。验证候选形状后最小投影。HrRewardsClient按完整身份上下文key重挂，独立cases/category加载，manage-only可打开创建表单但不读事项列表。显式onSubmit+preventDefault替代action，失败不reset；confirmed mutation与可选refresh错误分开。使用原hrApi及幂等键方式。

无DDL、seed/env/workflow改动。单一实现写入者，父负责浏览器/发布；既有清单候选不修改。独立实施允许与清单发布并行；最终审查前整合最新main，按相关代码变化运行本切片验证，生产发布必须等待前一版本取证完成。
