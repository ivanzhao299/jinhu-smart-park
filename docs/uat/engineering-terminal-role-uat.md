# Engineering Terminal Role UAT

Date: 2026-07-09

Scope: mobile engineering terminal role routing and first-screen action availability.

Preview:
- Web: http://127.0.0.1:4320
- API: http://127.0.0.1:4330/api/v1
- Viewport: 390 x 844

Result:
- Users checked: 7
- Passed: 7
- Forbidden: 0
- Warnings: 0

No passwords or secret values are recorded in this report.

## Role Matrix

| User | Role Surface | Headline | Primary Actions | Result |
| --- | --- | --- | --- | --- |
| admin | 管理员总控 | 工程总控工作台 | 工程看板 / 整改闭环 / 工程验收 | PASS |
| chen_guohui | 安全协同 | 安全协同工作台 | 新建巡检 / 整改闭环 / 工程看板 | PASS |
| li_rongjie | 安全协同 | 安全协同工作台 | 新建巡检 / 整改闭环 / 工程看板 | PASS |
| liu_hantao | 财务观察 | 工程财务观察台 | 工程看板 / 项目台账 / 验收状态 | PASS |
| shao_minghong | 现场工程 | 现场工程工作台 | 新建巡检 / 快速日报 / 整改待办 | PASS |
| song_qianchang | 招商协同 | 招商交付协同台 | 关联工程 / 交付计划 / 工程看板 | PASS |
| zheng_ziyong | 现场工程 | 现场工程工作台 | 新建巡检 / 快速日报 / 整改待办 | PASS |

## Screenshot Evidence

Screenshots were captured during the local role UAT run:

- `/tmp/jinhu-engineering-terminal-role-uat-v3/admin.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/chen_guohui.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/li_rongjie.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/liu_hantao.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/shao_minghong.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/song_qianchang.png`
- `/tmp/jinhu-engineering-terminal-role-uat-v3/zheng_ziyong.png`

Machine-readable run output:

- `/tmp/jinhu-engineering-terminal-role-uat-v3/report.json`

## Fix Summary

The engineering terminal now resolves non-engineering-but-related roles explicitly:

- Safety roles see safety inspection and rectification actions.
- Property roles see acceptance handover and rectification tracking.
- Finance roles see read-focused project ledger and acceptance status.
- Leasing/investment roles see project delivery coordination.
- IoT roles see equipment inspection and rectification.
- Field engineers keep priority over secondary property or IoT roles, so maintenance users are routed to field execution actions instead of passive observer actions.

## Remaining UAT

Next recommended validation:

1. Click-through UAT for each primary action.
2. Production deployment verification on the real mobile browser.
3. Role matrix expansion for any newly imported users before go-live.
