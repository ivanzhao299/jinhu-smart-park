-- Production-safe formal apartment documents and configurable default reason.
BEGIN;

INSERT INTO biz_apartment_setting(tenant_id,park_id,default_application_reason,remark)
VALUES('10000001','20000001','因工作安排及人才保障需要，申请入住集团人才公寓（员工宿舍），本人承诺遵守公寓管理、安全消防及退房交接规定。','公寓入住申请默认理由，可由公寓管理员修改')
ON CONFLICT(tenant_id,park_id) WHERE is_deleted=false DO NOTHING;

CREATE TEMP TABLE apartment_formal_templates(
  document_type varchar(40),title varchar(200),content_html text,variable_schema jsonb
) ON COMMIT DROP;
INSERT INTO apartment_formal_templates VALUES
('application','金湖集团公寓入住申请表',
 '<h1>金湖集团公寓入住申请表</h1><table><tr><th>申请编号</th><td>{{application_code}}</td><th>申请人</th><td>{{applicant_name}}</td></tr><tr><th>所属单位</th><td>{{organization_name}}</td><th>部门/职务</th><td>{{department_job}}</td></tr><tr><th>人员类别</th><td>{{applicant_type}}</td><th>申请房型</th><td>{{requested_room_type}}</td></tr><tr><th>计划入住</th><td>{{requested_start_date}}</td><th>计划退房</th><td>{{requested_end_date}}</td></tr><tr><th>入住理由</th><td colspan="3">{{reason}}</td></tr></table><div class="signature">申请人签字：____________　日期：____年__月__日</div>',
 '{"required":["application_code","applicant_name","reason"]}'::jsonb),
('approval','金湖集团公寓入住审批表',
 '<h1>金湖集团公寓入住审批表</h1><table><tr><th>申请编号</th><td>{{application_code}}</td><th>申请人</th><td>{{applicant_name}}</td></tr><tr><th>入住理由</th><td colspan="3">{{reason}}</td></tr><tr><th>审批结论</th><td>{{approval_decision}}</td><th>审批时间</th><td>{{approval_time}}</td></tr><tr><th>审批意见</th><td colspan="3">{{approval_opinion}}</td></tr></table><div class="signature">审批人签字：____________　日期：____年__月__日</div>',
 '{"required":["application_code","applicant_name","approval_decision"]}'::jsonb),
('fire_commitment','公寓安全消防承诺书',
 '<h1>公寓安全消防承诺书</h1><p>本人 {{applicant_name}} 入住金湖集团公寓期间，郑重承诺：</p><ol><li>遵守国家消防法律法规及园区、公寓各项安全管理制度。</li><li>不私拉乱接电线，不使用明火及大功率违规电器，不存放易燃易爆危险物品。</li><li>爱护消防设施，保持疏散通道畅通，发现隐患立即报告。</li><li>配合安全检查，因违反规定造成损失的，依法依规承担责任。</li><li>退房时完成物品、钥匙及费用交接。</li></ol><p>入住地点：{{room_bed}}</p><div class="signature">承诺人签字：____________　日期：____年__月__日</div>',
 '{"required":["applicant_name"]}'::jsonb),
('move_in_handover','公寓入住物品交接单',
 '<h1>公寓入住物品交接单</h1><table><tr><th>入住编号</th><td>{{stay_code}}</td><th>入住人</th><td>{{applicant_name}}</td></tr><tr><th>房间/床位</th><td>{{room_bed}}</td><th>入住日期</th><td>{{planned_start_date}}</td></tr><tr><th>交接物品</th><td colspan="3">{{handover_items}}</td></tr><tr><th>钥匙</th><td colspan="3">{{handover_keys}}</td></tr><tr><th>异常说明</th><td colspan="3">{{exception_note}}</td></tr></table><div class="signature">入住人：____________　管理员：____________　日期：____年__月__日</div>',
 '{"required":["stay_code","applicant_name","room_bed"]}'::jsonb),
('move_out_acceptance','公寓退房验收单',
 '<h1>公寓退房验收单</h1><table><tr><th>入住编号</th><td>{{stay_code}}</td><th>退房人</th><td>{{applicant_name}}</td></tr><tr><th>房间/床位</th><td>{{room_bed}}</td><th>退房时间</th><td>{{checkout_time}}</td></tr><tr><th>物品验收</th><td colspan="3">{{handover_items}}</td></tr><tr><th>钥匙回收</th><td colspan="3">{{handover_keys}}</td></tr><tr><th>异常/赔付说明</th><td colspan="3">{{exception_note}}</td></tr></table><div class="signature">退房人：____________　验收人：____________　日期：____年__月__日</div>',
 '{"required":["stay_code","applicant_name","room_bed"]}'::jsonb);

INSERT INTO biz_apartment_document_template(tenant_id,park_id,document_type,version_no,status,title,content_html,signature_required,variable_schema,published_at,remark)
SELECT '10000001','20000001',document_type,1,'published',title,content_html,true,variable_schema,now(),'金湖集团公寓正式文书 V1'
FROM apartment_formal_templates
ON CONFLICT(tenant_id,park_id,document_type,version_no) WHERE is_deleted=false
DO UPDATE SET title=EXCLUDED.title,content_html=EXCLUDED.content_html,signature_required=true,variable_schema=EXCLUDED.variable_schema,status='published',published_at=COALESCE(biz_apartment_document_template.published_at,now()),update_time=now(),remark=EXCLUDED.remark;

COMMIT;
