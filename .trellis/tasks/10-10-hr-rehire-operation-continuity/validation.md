# 回聘连续办理验证记录

当前状态：独立前端复核与负例补齐中，尚未完成构建、浏览器、CI、发布及真实岗位验收。

- API public version：6/6通过。公共list选取实际a.version并带范围过滤；create/update/action/review/confirm使用实际RETURNING版本，而非客户端推算；保留application action与employment event。
- API adapter：2/2通过，覆盖全部五个onboarding写包装器自定义key/旧默认key、身份token、方法、结构化body和返回version。
- 真实隔离PostgreSQL：既有回聘完整业务测试10/10通过；新增create/list/submit/review/confirm/update版本断言，确认值与数据库持久化值一致。使用独立127.0.0.1:55498、随机临时密码与专属容器；容器及volume已删除，未触及生产或其他本地数据库。
- 父新增测试的API类型检查、限定Web/API lint通过。
- 实施代理页面13项交互/类型lint通过仅为阶段证据，待独立check完整负例复核；不视为最终交付。
- 历史导入无重跑，生产人事测试写为0。

私有完整验证输出：/Users/mac/.codex/artifacts/hr-rehire-operation-continuity-20261010/。

## 最终本地候选（基于 main 2330f7c7c）

父代理补齐完整保存体校验、稳定列表刷新与收据覆盖、所有待确认控件锁定以及晚身份回调隔离；独立check已对最终源文件重新只读复核，无未修复发现。

- 真实组件交互24/24 + 五adapter合同2/2通过；覆盖网络/5xx/精确两个409、普通冲突、错误回执、刷新失败、同/高版本、晚身份及互斥控件。
- 原招聘结果与完整候选检索25/25通过，旧onboarding调用兼容。
- API public version 6/6、真实隔离PG 10/10通过；API构建通过。
- 整合最新main后API/Web类型、限定lint、Web构建、240/240 HR回归通过。
- 实际组件+合成API浏览器：桌面退回修改→保存→提交→批准→确认完整办理；手机390px重新提交→批准→确认，html clientWidth=scrollWidth=385，无横向溢出。批准与确认状态分离，展示真实返回审核/确认时间，0月试用保留。
- 构建与浏览器未代替生产真实岗位验收；CI/部署/实际运行SHA待回执。
