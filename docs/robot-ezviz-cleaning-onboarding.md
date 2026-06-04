# 萤石清洁机器人接入说明

本文用于把现场已部署的萤石清洁机器人接入金湖智慧园区系统。

## 前置条件

1. 当前租户已启用 `robot` 模块。
2. 当前用户具备：
   - `robot:read`
   - `robot:control`
   - `robot_platform_config:read`
   - `robot_platform_config:update`
3. 已从萤石开放平台取得：
   - `appKey`
   - `appSecret`
4. 已取得现场机器人：
   - 设备序列号 `deviceSerial`
   - 设备验证码 `validateCode`，仅在需要把设备添加到萤石账号时使用。

## 接入步骤

1. 打开后台页面：
   - `/robots/cleaning`

2. 点击「萤石配置」，保存平台配置：
   - 配置名称：建议填写 `金湖萤石清洁机器人`
   - API 地址：默认 `https://open.ys7.com`
   - AppKey：填写萤石开放平台 `appKey`
   - AppSecret：填写萤石开放平台 `appSecret`
   - 回调 Token：如萤石平台配置了事件回调，则填写同一 token

3. 点击「读取设备」：
   - 系统调用萤石设备列表接口。
   - 页面展示萤石平台设备及本地同步状态。

4. 如果设备还未加入萤石账号，点击「添加设备」：
   - 填写设备序列号。
   - 填写设备验证码。
   - 可填写设备名称、安装位置和备注。

5. 对目标设备点击「同步」：
   - 系统读取萤石设备详情。
   - 自动在 `biz_iot_device` 中创建或更新本地清洁机器人台账。
   - 本地字段包括设备序列号、平台类型、厂家、型号、在线状态、位置和萤石详情快照。

6. 同步完成后，在「本地清洁机器人」列表中验证：
   - 设备名称
   - 萤石序列号
   - 在线状态
   - 最近同步信息

7. 选择机器人执行基础联调：
   - 查询任务
   - 开始 / 暂停 / 停止 / 回充
   - 设置清洁模式
   - 查询路径
   - 区域清洁或临时区域清洁

## 后端接口

- `GET /api/v1/robots/cleaning/ezviz-configs`
- `POST /api/v1/robots/cleaning/ezviz-configs`
- `GET /api/v1/robots/cleaning/ezviz-devices`
- `POST /api/v1/robots/cleaning/ezviz-devices/add`
- `POST /api/v1/robots/cleaning/ezviz-devices/sync`
- `POST /api/v1/robots/cleaning/:id/sync-info`
- `POST /api/v1/robots/cleaning/:id/query-task`
- `POST /api/v1/robots/cleaning/:id/clean-control`
- `POST /api/v1/robots/cleaning/:id/set-clean-mode`
- `GET /api/v1/robots/cleaning/:id/path`
- `POST /api/v1/robots/cleaning/:id/start-region-clean`
- `POST /api/v1/robots/cleaning/:id/start-temp-region-clean`

## 数据落点

- 平台配置：`iot_protocol_config`
- 本地机器人台账：`biz_iot_device`
- 命令审计：`biz_robot_command_log`
- 操作审计：`sys_op_log`

## 注意事项

1. `appSecret`、回调 token 和 access token 均加密保存，不在前端明文回显。
2. 设备同步以萤石 `deviceSerial` 为唯一关联口径，重复同步会更新同一台本地机器人，不会重复建档。
3. 真实控制前，建议先执行「查询任务」验证 token、设备序列号和萤石在线状态。
4. 如果页面提示未启用模块，请先执行最新 migration / seed，确保 `robot` 模块和权限已经写入当前租户。
