# 同身份多企业引用根因与精确闭合

不可变000001含97个HR三列home外键；源snapshot checksum及全约束/列目录位于database/hr-enterprise/member-reference-manifest.json。007逐个校验target OID、按序attnums、validated/NO ACTION/非deferrable形状后仅换目标为member复合唯一键。user_id-only FK、HR业务字段/状态/函数、集成迁移不变。成员历史存在与当前live资格分开；停用不删除姓名或历史事实。

适配执行点：recruitment requisition owner、requisition owner options/update/current/history、lifecycle reassignment、contract reminders employee/manager/HR recipients；另外candidate profile/interview、job change、attendance leave/calendar历史作者显示在独立分支只匹配tenant/person，不能因home或当前停用消失。以上不复制identity，不引入第二个B-home账号绕过。
