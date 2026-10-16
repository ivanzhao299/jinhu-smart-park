# 正式绩效逐条明细评语

目标：将每条评分明细的评语作为正式办理字段，按真实阶段/角色政策编辑、修订和回读，保留同item不同detail的独立性，为父D来源正式启用提供完整承载。

用户授权：持续现代化和功能复现已批准；每字段按权限正常操作，不重做历史分析。来源source_appraisal为200字，正式输入尚无逐detail正文。此任务只补该真实差距，不代替父D receipt/link/一次baseline/完整来源资格与真实岗位验收。

需求：可选、明确的逐明细评语政策；未开启的旧workflow与input JSON完全兼容；启用后每条detail有独立appraisal cell，保留UNPROVIDED/EXPLICIT_NULL/VALUE和真实作者/时间/依据。正文最多200个Unicode码点，不改变评分数学。政策明确阶段/actor/required/allowExplicitNull/申诉许可；DB和API均执行现有stage/真实成员/live permission/CAS规则，不新增授予权限。

验收：真实PG/HTTP旧无扩展与新扩展生命周期、同item两个detail各自正文、200/201字边界、必填空白与NULL、阶段与撤权、同head并发/幂等、当前/历史自评掩码、申诉、确认后不可覆盖、源/math/旧dimension保持；真组件编辑/历史/政策/390px、API/shared/Web所需检查，CI/ReleaseSmoke/运行版本另验。
