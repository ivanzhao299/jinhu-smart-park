# 实际来源证据
基线 aec767ba398563689fe253fdb248cba1793a188d。
- HrLifecycleClient原load请求employees(1,100)，并与checklists/templates/directoryOptions同Promise.all。第101员工不能选择，目录失败阻塞列表。
- 全局globals.css .ds-mobile-record-list默认display:none，手机breakpoint才display:grid；该页待办只提供这个列表，没有desktop counterpart。实际候选组件桌面合成已有任务在DOM存在但innerText不含任务，界面隐藏。
- 现有事件API为授权员工范围读取，不修改权限与后端业务状态。
- 真实HR生产UAT另记，合成页面不代表实际人员操作。
