# 修复巡检任务执行白屏

## Goal

消除巡检任务执行抽屉的运行时白屏，并让异常 API 投影保持在局部、可诊断、不可破坏的边界内。

## Requirements

- 执行详情及检查项集合不得直接信任 TypeScript 静态类型。
- 缺失或错误形态的 `items`、`results`、附件和数值投影必须在进入 React 状态前归一化。
- 执行详情加载失败或数据不可用时保留任务列表，并显示可理解的错误信息。
- 不能以吞掉异常的方式伪造成功；有效数据的现有执行、打卡、提交语义保持不变。

## Acceptance Criteria

- [ ] 点击任一合法任务的“执行”可打开执行抽屉。
- [ ] `items`/`results` 为缺失、`null`、字符串或混合错误集合时不会调用不安全的 `.map` 并导致整页崩溃。
- [ ] 正常数组仍保留检查项与已有结果映射。
- [ ] 安全管理单测、Web lint/typecheck/build 通过。

## Notes

- Issue: https://github.com/ivanzhao299/jinhu-smart-park/issues/209
- 既有修复仅覆盖附件/GPS 标量投影，未覆盖执行详情的集合投影与局部渲染失败边界。
