export function applicantDetails(form: FormData) {
  const optional = (name: string) => String(form.get(name) ?? "").trim() || undefined;
  return {
    gender: optional("gender"),
    identity_number: optional("identity_number")?.toUpperCase(),
    native_place: optional("native_place"),
    home_address: optional("home_address"),
    health_status: optional("health_status"),
    emergency_contact_relationship: optional("emergency_contact_relationship"),
  };
}

export function ApartmentApplicantFields() {
  return <>
    <label className="form-field"><span>性别</span><select name="gender" defaultValue="" required><option value="" disabled>请选择</option><option value="male">男</option><option value="female">女</option><option value="unspecified">不便透露</option></select></label>
    <label className="form-field"><span>身份证号</span><input name="identity_number" aria-label="身份证号" aria-describedby="apartment-identity-help" autoComplete="off" minLength={15} maxLength={18} pattern="([0-9]{15}|[0-9]{17}[0-9Xx])" placeholder="15位或18位身份证号" required/><small id="apartment-identity-help">加密保存，申请记录仅展示脱敏号码。</small></label>
    <label className="form-field"><span>籍贯</span><input name="native_place" maxLength={200} placeholder="省 / 市 / 区县" required/></label>
    <label className="form-field"><span>家庭住址</span><input name="home_address" autoComplete="street-address" maxLength={500} placeholder="省市区、街道及门牌号" required/></label>
    <label className="form-field"><span>健康状况（可选）</span><textarea name="health_status" maxLength={500} rows={2} placeholder="仅填写与住宿安排、无障碍或应急救助有关的情况"/></label>
    <label className="form-field"><span>紧急联系人与本人关系</span><input name="emergency_contact_relationship" maxLength={100} placeholder="如配偶、父母、子女、朋友" required/></label>
  </>;
}

export function ApartmentApplicantDetails({ row }: { row: Record<string, unknown> }) {
  const gender = ({ male: "男", female: "女", unspecified: "不便透露" } as Record<string, string>)[String(row.gender)] ?? "未登记";
  return <>
    <span>性别：{gender} / 身份证号：{String(row.identity_number_masked || "未登记")}</span>
    <span>籍贯：{String(row.native_place || "未登记")}</span>
    <span>家庭住址：{String(row.home_address || "未登记")}</span>
    <span>健康状况：{String(row.health_status || "未填写")}</span>
    <span>紧急联系人关系：{String(row.emergency_contact_relationship || "未登记")}</span>
  </>;
}
