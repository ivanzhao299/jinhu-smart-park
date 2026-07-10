# Engineering Terminal Click-Through UAT

Date: 2026-07-10

Scope: mobile engineering terminal primary actions.

Preview:
- Web: http://127.0.0.1:4320
- API: http://127.0.0.1:4330/api/v1
- Viewport: 390 x 844

Result:
- Users checked: 7
- Primary actions checked: 21
- Link navigation failures: 0
- Drawer action failures: 0
- Permission or login redirects: 0
- Status: PASS

No passwords or secret values are recorded in this report.

## Role Action Matrix

| User | Role Surface | Actions Verified | Result |
| --- | --- | --- | --- |
| admin | 管理员总控 | 工程看板 / 整改闭环 / 工程验收 | PASS |
| chen_guohui | 安全协同 | 新建巡检 / 整改闭环 / 工程看板 | PASS |
| li_rongjie | 安全协同 | 新建巡检 / 整改闭环 / 工程看板 | PASS |
| liu_hantao | 财务观察 | 工程看板 / 项目台账 / 验收状态 | PASS |
| shao_minghong | 现场工程 | 新建巡检 / 快速日报 / 整改待办 | PASS |
| song_qianchang | 招商协同 | 关联工程 / 交付计划 / 工程看板 | PASS |
| zheng_ziyong | 现场工程 | 新建巡检 / 快速日报 / 整改待办 | PASS |

## Verified Destinations

Link actions reached these pages without login redirects, 403 pages, blank pages, or Next.js runtime errors:

- `/engineering/dashboard`
- `/engineering/rectifications`
- `/engineering/acceptances`
- `/engineering/inspections/new`
- `/engineering/projects`
- `/engineering/plans`

Button actions:

- `快速日报` opens the mobile quick daily report drawer.

## Automation

Reusable command:

```bash
pnpm go-live:uat-engineering-terminal-click -- \
  --web-base http://127.0.0.1:4320 \
  --api-base http://127.0.0.1:4330/api/v1 \
  --screenshots-dir /tmp/jinhu-engineering-terminal-click-uat
```

Machine-readable local report:

- `database/import-reports/engineering-terminal-click-uat-report.local.json`

Screenshot evidence:

- `/tmp/jinhu-engineering-terminal-click-uat/admin.png`
- `/tmp/jinhu-engineering-terminal-click-uat/chen_guohui.png`
- `/tmp/jinhu-engineering-terminal-click-uat/li_rongjie.png`
- `/tmp/jinhu-engineering-terminal-click-uat/liu_hantao.png`
- `/tmp/jinhu-engineering-terminal-click-uat/shao_minghong.png`
- `/tmp/jinhu-engineering-terminal-click-uat/song_qianchang.png`
- `/tmp/jinhu-engineering-terminal-click-uat/zheng_ziyong.png`

## Implementation Notes

- Primary action elements now expose stable `data-testid` attributes so future UAT can click real controls instead of relying on brittle text matching.
- The quick daily report drawer also exposes a stable test id.
- The click UAT script retries the terminal load once if a development preview cold start briefly redirects to login or renders too little content.

## Next Recommended UAT

1. Form-level mobile UAT for `新建巡检` and `快速日报` validation errors.
2. Production mobile UAT after deployment to confirm the same role matrix on the live domain.
3. Repeat for `/operations/terminal` customer-facing role workbench.
