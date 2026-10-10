# 本地验证与业务边界

- Web interaction: 31/31 PASS（新台账5、既有培训操作11、员工选择15）；复查后新台账5/5 PASS。
- HR unit contracts: 238/238 PASS，包含新增根目录培训序列化器3/3，已进入既有CI测试入口。
- Web typecheck: final PASS；targeted ESLint and diff check PASS。
- Web build: final PASS (207 pages). Existing unrelated canteen lint warning retained.
- 实际HrTrainingClient编译、本地合成读取接口，桌面参训记录导出1条与390px计划全页101条导出PASS，手机clientWidth=scrollWidth=385；实际字段白名单和CSV内容另由测试核对。
- 独立check角色修复：参与记录组件自身绑定计划/启用/本人/团队/费用上下文，调用者contextKey不变也会中止旧请求；详情读取时禁止翻页。

复用现有正式读取接口及权限，无API/数据库迁移/生产业务写入，未重跑历史导入。费用只按既有权限提供，未计算费用或薪资。CSV为实时读取，不承诺数据库原子快照、法定报表或旧版打印格式完全等价。生产登录实际回到登录页，真实岗位验收尚未完成，不阻断开发。此改动需等待PR925生产版本验证后按最新主分支整合发布。
