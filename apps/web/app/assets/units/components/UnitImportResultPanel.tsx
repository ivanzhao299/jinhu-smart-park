import { Card, DataTable } from "@jinhu/ui";
import type { ImportResult } from "../types";

export function UnitImportResultPanel({ importResult }: { importResult: ImportResult }) {
  return (
    <Card >
      <div className="task-item">
        <span>导入结果</span>
        <strong>总计 {importResult.total}，成功 {importResult.success_count}，失败 {importResult.fail_count}</strong>
      </div>
      <DataTable >
        <thead>
          <tr><th>行号</th><th>房源编码</th><th>错误原因</th></tr>
        </thead>
        <tbody>
          {importResult.rows.filter((row) => !row.success).map((row) => (
            <tr key={row.row_no}>
              <td>{row.row_no}</td>
              <td>{row.unit_code || "-"}</td>
              <td>{row.errors.join("；")}</td>
            </tr>
          ))}
          {importResult.rows.every((row) => row.success) ? <tr><td colSpan={3}>全部导入成功</td></tr> : null}
        </tbody>
      </DataTable>
    </Card>
  );
}
