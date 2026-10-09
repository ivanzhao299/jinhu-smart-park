# 验证与边界
- Web交互：21通过（真实父页面14、追加更正组件6、adapter1）。覆盖unknown结果同key重试、改内容阻断、确定400后新key、成功后只读刷新失败、双击、权限/非approved、坏projection、identity switch无晚到读取。
- Web HR回归222通过；Web typecheck、affected ESLint与生产build通过。build保留既有非本次 canteen-peripherals unused-disable/Next lint插件提示。
- in-app browser实际组件+合成API，桌面与390px；clientWidth=scrollWidth=390，按钮44px，失败表单保留，重试显示第2条已保存。临时tab19已关闭，本地18793服务已停止。
- API/数据库未修改，不执行迁移、seed、历史导入或生产业务测试写入；复用既有approved行锁、追加操作和幂等route契约。本地合成检查不等于生产真实角色UAT或玉舟原端规则等价验收。
- 员工本人申诉入口、薪酬/绩效关联界面继续作为下一业务切片，不扩大本次manage读写权。

集成PR902主线 f03ab9d 后：保留双方父任务子项、spec索引和真实父页面测试；更正与类别版本5文件共31项交互通过。最终类型/样式/build复验通过；无重复React key。
