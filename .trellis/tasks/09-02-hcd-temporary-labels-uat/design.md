# Design

六组临时定名集中在 shared，Web 只负责展示；开放字典以 `/dict-items` 为主。UAT 使用独立测试浏览器和非生产合成数据。无迁移，可整体 revert。
