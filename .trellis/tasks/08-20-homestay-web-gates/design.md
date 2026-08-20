# 技术设计

按工作流分批从 route _components 抽到 features/homestay，每批旧实现同变更删除；不新增离线 mutation queue。

兼容现有 API/DTO 时优先增量修复；任何 schema 变化使用新 forward-only migration。失败可按子任务 PR 独立 revert，已应用 migration 只做 forward fix。
