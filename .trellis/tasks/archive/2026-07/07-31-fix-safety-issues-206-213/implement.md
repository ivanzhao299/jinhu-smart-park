# Implementation Plan

## Steps

1. 将所有 `apps/web/app/safety` 下通过 `/dict-types` 间接查字典的页面迁移到 `loadDictMapByCodes`。
2. 提取巡检执行表单边界归一化函数，替换附件 `.join` 与 GPS 直接赋值。
3. 提取隐患新增草稿逻辑，使强制超期页默认 `overdueFlag=true`。
4. 添加安全字典加载契约、巡检输入归一化和超期新增语义回归测试，并接入 Web 单元测试命令。
5. 运行格式/静态搜索、目标单测、Web lint、typecheck、build；检查 390px 移动布局和桌面布局。
6. 执行 Trellis quality check 与 break-loop 复盘，必要时更新规范。

## Validation

- `pnpm --filter @jinhu/web test:unit:safety`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/web build`
- `pnpm typecheck`
- `rg -n '\"/dict-types|/dict-types\\?' apps/web/app/safety`

## Validation Results

- `test:unit:safety`: 4/4 passed.
- Web lint: passed; `components/safety` targeted lint also passed.
- Web typecheck: passed.
- Web production build: passed; 136 routes generated.
- Static safety scan: no production safety page references `/dict-types`.
- `git diff --check`: passed.
- Browser desktop/mobile inspection: skipped because the Chrome connector rejected
  the sandbox cwd URI before opening a tab; no layout or CSS changed.
- Root workspace typecheck and API/shared checks: skipped because the change is
  confined to Web source/specs and the Web typecheck/build passed.

## Risk And Rollback Points

- 批量迁移字典加载：逐页保持原 code 列表不变，并由回归测试覆盖。
- 巡检字段策略边界：仅归一化到表单值，不改变 API payload contract。
- 超期新增：只在 `forcedOverdueOnly` 场景默认勾选，不影响普通隐患页。
