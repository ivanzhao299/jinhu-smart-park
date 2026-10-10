# 社保期间更正原输入连续性

## 1. Scope / Trigger

HR从已关账当前版本进入更正，沿用该版本已确认的六项缴费基数及公积金汇总口径，并对照原结果与新预览。新建期间仍要求显式输入。

## 2. Signatures

现有 `Editor({ target, saved, busyChange })`，target为 `HrInsuranceOwnedPeriodListItem`；原输入取 `target.calculation.items[].insuranceKind/contributionBase` 和明确的 `calculation.includeFund`。持久化仍通过现有预览及correct请求。

## 3. Contracts

- 按险种键绑定，不依赖数组顺序。保留精确十进制字符串，不使用Number/parseFloat格式化或推算基数；缺失、重复或非法项不能自动用零补齐。
- 只有明确boolean汇总口径可沿用。原记录不完整时给出可见说明，操作员须补齐；缺失原金额不冒充完整对照。
- 原版本、月份、输入及金额为只读核对依据；新版本须明确选择当前可用员工/政策、重新预览及确认，不猜原政策或自动选最新政策。
- 目标id切换重置更正草稿，新建不继承上一目标。原月份锁定，原revision/version和新preview/hash仍绑定既有更正请求。
- 任一核算输入编辑撤销旧预览；同内容失败重试复用原key；保留权限、上下文取消和版本冲突规则。
- 显示原与新独立结果和公积金是否计入汇总；不前端重新计算金额。费率说明复用policy-rate百分比格式化。
- 共享DS、桌面及390px无横向溢出，按钮至少44px触控高度。

## 4. Error Matrix

原基数缺失/重复/非法→提示缺项并保留其他可信字段，不猜值；无明确fund→要求显式选择；政策读取失败→既有可见错误，不生成预览；写失败→保留输入及原请求重试；409→保留业务说明并要求重新预览；权限变化→旧上下文取消，不显示旧结果。

## 5. Good / Base / Bad

Good：更正带入原六项精确基数和exclude口径，修改一项后预览并核对；Base：新建为空；Bad：按险种数组位置绑定、金额Number转换、缺失即零、拿最新政策代替原政策、旧预览直接生效。

## 6. Tests / Evidence

交互检查正常/大额精确值、乱序与缺失重复非法项、原/新对照、新建及目标切换、预览失效、失败原key重试和权限取消。运行Web focused interaction、HR合同、lint/typecheck/build；实际编译组件桌面390px。真实角色及实际金额核对独立待验收。

## 7. Wrong vs Correct

Wrong：更正打开空表重新抄写或自动猜零；Correct：复用已确认原输入作为可编辑草稿，原结果只读，新预览和明确确认才追加下一版本。后端active/probation规则、暂停/离职追溯差距保持原边界，本片不能声称完整业务等价。
