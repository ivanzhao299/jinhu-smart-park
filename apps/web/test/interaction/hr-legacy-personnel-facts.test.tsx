import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getLegacyPersonnelFacts, LegacyPersonnelFacts } from "../../app/hr/employees/legacy/LegacyPersonnelFacts";
import type { HrLegacyArchiveRecord } from "../../lib/hr-api";

const source = (legacyFields: Record<string, unknown>, overrides: Partial<HrLegacyArchiveRecord> = {}): HrLegacyArchiveRecord => ({
  id: "synthetic-source", employeeId: "synthetic-employee", mappingStatus: "mapped", recordType: "employee_profile",
  sourceSystem: "yuzhou-v10", sourceTable: "dbo.person.core_residue", occurredOn: null,
  displayTitle: "Synthetic profile", hasSensitiveSource: true, projection: { legacyFields }, ...overrides,
});

describe("original Yuzhou personnel facts", () => {
  it("preserves scalar text, wraps long text, and renders script-like input as text", () => {
    const long = `\"><script>${"x".repeat(600)}</script>`;
    render(<LegacyPersonnelFacts record={source({ oldaddr: long, edulevel: "博士" })} canReadSensitive />);
    expect(screen.getByText(long)).toBeVisible();
    expect(screen.getByText("博士")).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
  });

  it("distinguishes explicit null or empty from absent properties and non-scalar values", () => {
    const view = render(<LegacyPersonnelFacts record={source({ oldaddr: null, edulevel: "" })} canReadSensitive />);
    expect(screen.getAllByText("源记录未登记")).toHaveLength(2);
    view.rerender(<LegacyPersonnelFacts record={source({ oldaddr: { value: "hidden" } })} canReadSensitive />);
    expect(screen.getByText("原值无法展示")).toBeVisible();
    expect(screen.queryByText("hidden")).toBeNull();
    expect(screen.queryByText("原玉舟学位")).toBeNull();
  });

  it("requires the source system, record kind, table, and sensitive grant", () => {
    const original = source({ oldaddr: "Private synthetic value" });
    expect(getLegacyPersonnelFacts(original, false)).toEqual([]);
    expect(getLegacyPersonnelFacts({ ...original, sourceSystem: "other" }, true)).toEqual([]);
    expect(getLegacyPersonnelFacts({ ...original, recordType: "other" }, true)).toEqual([]);
    expect(getLegacyPersonnelFacts({ ...original, sourceTable: "other" }, true)).toEqual([]);
    expect(getLegacyPersonnelFacts({ ...original, projection: { legacyFields: [] } }, true)).toEqual([]);
  });
});
