# IoT 告警规则选择设备崩溃

## Confirmed Root Cause

`GET /iot/devices/:deviceId/points` 返回点位数组，前端错误地按 `PaginatedResult` 读取 `response.data.items`，导致 `points` 变成 `undefined` 并在渲染 `.map` 时崩溃。

## Acceptance Criteria

- [ ] 前端按数组契约读取点位。
- [ ] 选择指定设备后页面不崩溃。
- [ ] 点位下拉正常显示并可回填指标编码。
- [ ] API 契约保持不变。
