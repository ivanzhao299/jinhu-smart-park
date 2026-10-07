import type { HrPayrollReconciliationSetup, HrPayrollReconciliationSource } from "../../../lib/hr-api";
import styles from "./payroll.module.css";

export function PayrollInputReadiness({ setup, sourceSelected, frozenSource, attendance, insuranceSelected, canReadAttendance }: {
  setup: HrPayrollReconciliationSetup;
  sourceSelected: boolean;
  frozenSource: HrPayrollReconciliationSource | null;
  attendance: HrPayrollReconciliationSetup["attendanceBatches"][number] | undefined;
  insuranceSelected: boolean;
  canReadAttendance: boolean;
}) {
  const month = frozenSource?.periodMonth.slice(0, 7);
  const matching = setup.attendanceBatches.filter(batch => !month || batch.periodMonth.slice(0, 7) === month);
  return <section className={`ds-panel ${styles.inputReadiness}`} aria-labelledby="payroll-input-readiness-heading">
    <h2 id="payroll-input-readiness-heading">核对输入准备</h2>
    <div className="ds-scene-grid">
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>1. 工资核对来源</h3>
        <p>{sourceSelected ? `已选择${month ? ` ${month} 的冻结来源` : "已发布来源"}。` : "先选择工资核对来源。"}</p>
        {!sourceSelected && !setup.legacyBatches.length && !setup.frozenSources?.length ? <p>尚无可选来源，请由复核人员准备指定账套、月份的核对记录。</p> : null}
      </article>
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>2. 已关账考勤</h3>
        <p>{attendance ? `已选择 ${attendance.periodMonth.slice(0, 7)} 考勤输入。` : !matching.length ? `${month ? `${month} ` : "当前"}没有已关闭且生效的考勤输入，请先完成考勤月结。` : "请选择与工资来源同月的考勤输入。"}</p>
        {canReadAttendance ? <a className="ds-button" href="/hr/attendance">查看考勤与月结</a> : null}
      </article>
      <article className={`ds-scene-card ${styles.inputReadinessCard}`}>
        <h3>3. 逐人社保来源</h3>
        <p>{insuranceSelected ? "本次人员的社保来源已全部选择，可提交模拟核对。" : "工资来源和同月考勤选好后，逐人选择社保来源。"}</p>
      </article>
    </div>
    <p className="ds-inline-note">输入准备完成后仍需核对本期工资规则与人员资料；模拟不会发放工资。</p>
  </section>;
}
