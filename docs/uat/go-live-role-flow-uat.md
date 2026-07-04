# Go-Live Role Flow UAT

`scripts/go-live-role-flow-uat.mjs` 用于做一轮真实角色业务链验证，不再只看登录、菜单和页面是否能打开，而是让关键岗位在本地生产环境里实际完成一段安全业务动作。

## 当前覆盖

1. `admin` 创建并推进一个 `UAT-ROLE-*` 工程项目到 `EXECUTING`
2. `song_qianchang` 创建招商线索并补一条跟进记录
3. `shao_minghong` 创建现场工单
4. `chen_guohui` 将工单派给 `zheng_ziyong`
5. `zheng_ziyong` 创建并提交施工日报
6. `li_rongjie` 审核施工日报
7. `liu_hantao` 验证财务读接口

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

1. 巡检 -> 问题 -> 整改 -> 复查
2. 工程验收提交流转
3. 角色消息/待办到达验证
