# Implementation Plan

1. 移除超期筛选到隐患新增/提交业务状态的传播，超期页隐藏新增入口。
2. 扩展巡检附件投影 normalizer，保留 available 元数据并控制表单和请求字段。
3. 提取 API 打卡附件合并函数，缺省保留、显式数组覆盖。
4. 更新 Web/API 回归测试与相关规范。
5. 运行目标单测、lint、typecheck、build 和 diff 检查。
6. 提交推送，逐条回复并解决 Codex review threads，重新触发 review。

## Validation

- `pnpm --filter @jinhu/web test:unit:safety`
- `pnpm --filter @jinhu/api test:unit`
- `pnpm --filter @jinhu/web lint`
- `pnpm --filter @jinhu/api lint`
- `pnpm --filter @jinhu/web typecheck`
- `pnpm --filter @jinhu/api typecheck`
- `pnpm --filter @jinhu/web build`
- `pnpm --filter @jinhu/api build`

## Validation Results

- Web safety unit tests: 6/6 passed.
- API unit tests: 462/462 passed.
- Web lint and targeted safety-component lint: passed.
- API lint: passed.
- Web/API typecheck: passed.
- API production build: passed.
- Web production build: passed, 136 routes generated. The first attempt hit
  host `/tmp` ENOSPC; rerunning with `.next` mounted to an external temporary
  build directory succeeded.
- `git diff --check`: passed.
- Browser inspection: unavailable because the current Chrome connector rejects
  the sandbox cwd URI before opening a tab; this change removes one action and
  adds one inline fallback message without changing CSS/layout primitives.
