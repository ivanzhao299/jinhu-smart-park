# HCD shared 与 Web 展示层修复

## Goal

交付 PR1：建立封闭枚举中文 label 与 Web presentation 单一来源，修复 19 项 C 类及 HCD-021 A 类。

## Requirements

- shared 穷尽覆盖封闭枚举；租约补 expiring/terminated；经营模式复用既有三值中文。
- presentation 负责 variant、未知值与名称回退；StatusPill 消费中文资产。
- 筛选与展示同源但 query value 不变；开放字典不硬编码。
- 用户可见处禁止 UUID/内部 ID。

## Acceptance Criteria

- [ ] HCD-001—004、006、008—010、013—014、016—019、021—025、029 修复。
- [ ] shared 穷尽/无多余键与 Web HCD 编号测试通过。
- [ ] shared/Web lint、typecheck、test、build 通过。
- [ ] PR1 review ≤3、CI、squash merge、main 双绿。
