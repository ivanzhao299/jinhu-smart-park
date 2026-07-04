# Go-Live Role Flow UAT

`scripts/go-live-role-flow-uat.mjs` 用于做一轮真实角色业务链验证，不再只看登录、菜单和页面是否能打开，而是让关键岗位在本地生产环境里实际完成一段安全业务动作。

## 当前覆盖

1. `admin` 创建 `UAT-ROLE-*` 工程项目并推进到 `EXECUTING`
2. `song_qianchang` 创建招商线索并补一条跟进记录
3. `shao_minghong` 创建现场工单
4. `chen_guohui` 将工单派给 `zheng_ziyong`
5. `zheng_ziyong` 创建并提交施工日报
6. `li_rongjie` 审核施工日报
7. `admin` 启动工程巡检
8. `zheng_ziyong` 创建并提交巡检
9. `zheng_ziyong` 基于巡检创建问题
10. `admin` 发起整改并生成整改任务
11. `shao_minghong` 启动并提交整改
12. `chen_guohui` 发起复查并判定通过
13. `admin` 关闭整改，确认问题闭环
14. `admin` 重启巡检后发起验收流程
15. `shao_minghong` 创建并提交验收
16. `li_rongjie` 审核验收
17. `admin` 关闭验收并将项目推进到 `ACCEPTED`
18. `liu_hantao` 验证财务读接口

## 使用方式

```bash
pnpm go-live:uat-role-flow
```

可选参数：

```bash
node scripts/go-live-role-flow-uat.mjs \
  --api-base http://127.0.0.1:4330/api/v1 \
  --credentials database/import-reports/go-live-all-users.local.csv \
  --report-file database/import-reports/go-live-role-flow-report.local.json
```

## 输出

脚本会在本地写入：

- `database/import-reports/go-live-role-flow-report.local.json`

该文件默认仅本地保留，用于确认每个角色动作是否真的走通。

## 安全约束

- 所有写入都使用 `UAT-ROLE-*` 前缀，便于识别
- 不修改密码
- 不输出密码
- 所有写请求自动带 `X-Idempotency-Key`
- 只验证安全业务链，不做危险生产动作

## 下一步建议

在这轮角色 UAT 稳定后，继续补：

1. 角色消息/待办到达验证
2. 附件上传与证据留痕验证
3. 页面级浏览器 UAT 与移动端终端化 UAT 联动
