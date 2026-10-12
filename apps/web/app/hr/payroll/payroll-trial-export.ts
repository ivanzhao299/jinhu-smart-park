import type { PayrollTrialResult, PayrollTrialLineStatus } from "@jinhu/shared";
import { csvDocument } from "../../../lib/scoped-csv-export";
export const trialStatus: Record<PayrollTrialLineStatus, string> = { equal: "一致", different: "有差异", unmapped: "未映射", missing_source: "缺少来源", source_null: "来源为空", nonnumeric: "非数值来源", ambiguous_source: "来源重复", source_only: "仅原项目", unknown_source: "未知来源项目" };
export function payrollTrialCsv(result: PayrollTrialResult): string {
  const rows: unknown[][] = [["月份", "账套", "源记录", "员工编号", "姓名", "项目", "现代用途", "原项目", "状态", "现代值", "原值", "差值(现代减原值)", "来源项目记录", "来源项目版本", "冻结来源", "来源哈希", "来源绑定哈希", "确认输入", "输入版本", "输入哈希", "规则版本", "规则哈希", "计算哈希", "引擎版本", "公式版本", "选择哈希", "结果哈希", "计算时间", "性质"]];
  for (const record of result.records) {
    const evidence = result.evidence.find(row => row.bookId === record.bookId);
    if (!evidence) throw new Error("试算来源证据不完整，无法导出。");
    const common = [result.month, record.bookName, record.sourceRecordId, record.employeeCode, record.fullName];
    const tail = [evidence.sourceId,evidence.sourceHash,evidence.bindingHash,evidence.inputId,evidence.inputVersion,evidence.inputHash,evidence.ruleVersionId,evidence.ruleHash,evidence.calculationHash,evidence.calculationVersion,evidence.formulaEngineVersion,result.selectionHash,result.resultHash,result.calculatedAt,"本次只算不发，待业务核对"];
    rows.push([...common,"净额对照","net","原记录净额",trialStatus[record.net.status],record.net.modernValue,record.net.sourceValue,record.net.difference,"","",...tail]);
    for (const line of record.lines) rows.push([...common,line.modernCode,line.role,line.sourceName,trialStatus[line.status],line.modernValue,line.sourceValue,line.difference,line.sourceItemId,line.sourceItemVersionId,...tail]);
  }
  return csvDocument(rows);
}
