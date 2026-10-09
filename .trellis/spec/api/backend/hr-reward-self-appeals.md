# 员工本人奖惩申诉

## 1. Scope / Trigger
现代奖惩本人申诉及本人历史查看；已批准正式事项持续办理，不区分历史导入来源。无新role/schema/import/payroll行为。

## 2. Signatures
GET cases/:id 增加 canAppeal:boolean，仅资格成立时 ownAppeals:[{sequenceNo,type:"appeal",summary,createdAt}]。
POST cases/:id/corrections 使用既有 HrRewardCorrectionDto/type=appeal 和 IdempotencyInterceptor。摘要1..300/原因1..1000（trim后）。HR correction接口兼容。

## 3. Contracts
actor tenant/park等于请求scope（含super/wildcard）。SELF_READ与实际employee.user_id匹配且case approved才canAppeal。SELF只读本人approved最低投影；TEAM+SELF列表为管理树与本人approved并集，树外本人详情降级self并按self审计，不能提升他人范围。READ不代替SELF。
required audit成功后才能读取/返回本人历史；ownAppeals同时过滤scope/case/type=appeal/create_by=actor，仅摘要/时间/序号，不返HR更正、他人申诉、reason/金额/证据。HR受REASON_READ控制的corrections保持原契约。
写入前校验scope、对应actionpermission、非空/长度/类型，事务锁内重新判定approved/owner；FOR UPDATE OF c串行序号，追加correction与action在同一事务，approved保持终态，不更新原事实/制度/证据。前端capability仅UX，不能代替服务端复验。
Web复用RewardCorrections两种模式，独立草稿/幂等键，共享父写锁。SELF permission与canAppeal===true交集显示；缺失/非法ownAppeals阻断提交并可只读重试。未知结果保留原内容原key，成功与历史读取失败分离；identity替换卸载旧状态。

## 4. Validation & Error Matrix
foreign scope ->403 beforeSQL；noSELF/write ->403；其他员工->detail404/write403；非approved->detail404/write409；输入空白/超长/非法type->400；audit失败->无本人历史；缺少capability无表单；成功+读失败仍显示已保存。

## 5. Good / Base / Bad Cases
Good: 部门负责人兼员工可以申诉本人树外已批准事项，只取得self投影。Base: HR仍能追加更正且查看授权历史。Bad: 用账号名猜员工、用manage/read代替SELF、返回所有人的correction history给self、修改原批准事实、读失败重复POST。

## 6. Tests Required
实际service/DTO涵盖scope、owner、状态、audit顺序、历史SQL过滤、混合权限并集。独立loopback15489随机PG库验证并发HR correction/self appeal序号、原批准整行不变、本人才有本人历史与混合权限可达；不是完整migration验收。真实父页面、局部组件和adapter验证失败重试、未知key、非法history、共享锁/独立草稿；HR回归、api/webtypechecklintbuild、桌面/390px检查。真实角色生产UAT、申诉受理/裁决规则与原玉舟原端等价验收仍独立。

## 7. Wrong vs Correct
Wrong: 前端 employeeName===user.name 后显示申诉并请求原记录PUT。
Correct: server actualuser匹配+approved 派生 capability，既有幂等append POST追加记录，原审批不改变。
