# 本地验证

基线main cc01c96418dfa374a60bad46df84c89daa1e92d2；独立codex/hr-feedback-reference-selection-20261009候选。2026-10-09，本片没有重跑历史导入、生产测试写入、DDL、种子或角色修改。

- API新旧契约整合25项通过，API typecheck、相关eslint通过。先前同片实际PostgreSQL查询夹具606员工/602办理对象、31页、601搜索、组织树/本人范围、字面通配符、空页总数和并发新增快照通过；随机DB删除、专用容器移除。Web-only改动后不重复该PG夹具。
- `pnpm --filter @jinhu/web exec vitest run --config vitest.config.ts test/interaction/hr-feedback-operation-continuity.test.tsx test/interaction/hr-feedback-operation-api.test.tsx test/interaction/hr-feedback-reference-picker.test.tsx`：23项通过。覆盖跨页/搜索保留多选及真实提交载荷、候选失败单独恢复、500选择上限、未知结果同键同载荷重试、慢查询取消、重复/错误响应阻止办理、精确角色读取和发布成功后的刷新失败。
- `pnpm --filter @jinhu/web test:unit:hr`：222项通过。
- `pnpm --filter @jinhu/web typecheck`、相关eslint、`pnpm --filter @jinhu/web build`：通过。构建既有Next ESLint插件提示及无关canteen-peripherals未使用disable警告，未作无关修改。
- 实际HrFeedbackClient本地合成接口：桌面分页多选保留；390px时document.scrollWidth385、按钮最小44px；提名对象和评价人搜索分页使用DS，未出现竖排挤压。手机显式viewport输入调度两次超时，键盘分页成功；独立390px iframe正常鼠标搜索并保存截图。临时tab/server关闭、viewport恢复。

证据：/Users/mac/.codex/artifacts/hr-feedback-reference-selection-20261009。此为本地代码和合成/查询验证，不代替完整CI、生产运行版本、真实HR/负责人/员工签署或原Windows/GroupWeb业务等价验收。协作方权威关系来源仍未实现。
