import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegacyEmploymentDate } from "../../app/hr/employees/legacy/LegacyEmploymentDate";
import { HrEmploymentHistory } from "../../app/hr/employees/components/HrEmploymentHistory";
import type { HrEmploymentEvent, HrLegacyArchiveRecord } from "../../lib/hr-api";

const source = (value: unknown): HrLegacyArchiveRecord => ({
  id: "synthetic-source", employeeId: "synthetic-employee", mappingStatus: "mapped",
  recordType: "employee_profile", sourceTable: "dbo.person.core_residue", occurredOn: null,
  displayTitle: "Synthetic profile", hasSensitiveSource: true,
  projection: { legacyFields: { formaldate: value } },
});
const event = (id: string, provenance?: HrEmploymentEvent["provenance"]): HrEmploymentEvent => ({
  id, eventNo: null, eventType: "confirm_employment", effectiveDate: "2026-10-01",
  reason: null, createTime: "2026-10-01T00:00:00.000Z", provenance,
});

describe("employment dates keep source and effect separate", () => {
  it("preserves the exact authorized original timestamp without timezone conversion", () => {
    render(<LegacyEmploymentDate record={source("2020-02-29T00:00:00.000+08:00")} canReadSensitive />);
    expect(screen.getByRole("heading", { name: "原玉舟转正日期" })).toBeVisible();
    expect(screen.getByText("2020-02-29T00:00:00.000+08:00")).toBeVisible();
  });
  it("does not render a restricted, missing, or foreign-table source fact", () => {
    const view = render(<LegacyEmploymentDate record={source("2020-02-29")} canReadSensitive={false} />);
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
    view.rerender(<LegacyEmploymentDate record={{ ...source("2020-02-29"), sourceTable: "other_source" }} canReadSensitive />);
    expect(screen.queryByText("2020-02-29")).toBeNull();
    view.rerender(<LegacyEmploymentDate record={{ ...source("2020-02-29"), projection: {} }} canReadSensitive />);
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
  });
  it("distinguishes source null from invalid dates and never substitutes a modern plan", () => {
    const view = render(<LegacyEmploymentDate record={source(null)} canReadSensitive />);
    expect(screen.getByText("源记录未登记")).toBeVisible();
    view.rerender(<LegacyEmploymentDate record={source("2021-02-29")} canReadSensitive />);
    expect(screen.getByText("原日期值需核对")).toBeVisible();
    expect(screen.getByText("2021-02-29")).toBeVisible();
    view.rerender(<LegacyEmploymentDate record={source("2020-02-29T25:00:00+08:00")} canReadSensitive />);
    expect(screen.getByText("原日期值需核对")).toBeVisible();
    expect(screen.getByText("2020-02-29T25:00:00+08:00")).toBeVisible();
    view.rerender(<LegacyEmploymentDate record={{ ...source(null), projection: { probationEndDate: "2026-12-01" } }} canReadSensitive />);
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
  });
  it("retains multiple events with different origins and effects instead of choosing one confirmation date", () => {
    render(<HrEmploymentHistory events={[
      event("history", { origin: "historical_import", effect: "unconfirmed" }),
      event("modern", { origin: "modern_business", effect: "effective" }),
      event("void", { origin: "modern_business", effect: "voided" }),
      event("old-response"),
    ]} />);
    expect(screen.getAllByText("2026-10-01")).toHaveLength(4);
    expect(screen.getByText("历史导入")).toBeInTheDocument();
    expect(screen.getAllByText("现代业务")).toHaveLength(2);
    expect(screen.getByText("已生效")).toBeInTheDocument();
    expect(screen.getByText("已作废")).toBeInTheDocument();
    expect(screen.getByText("来源未提供")).toBeInTheDocument();
    expect(screen.getAllByText("生效状态未确认")).toHaveLength(2);
  });
});
