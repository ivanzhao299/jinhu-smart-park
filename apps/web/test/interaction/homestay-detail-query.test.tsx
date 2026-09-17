import { describe, expect, it, vi } from "vitest";
import { loadHomestayDetail } from "@/app/homestay/_components/homestay-detail-query";

const response = (status: number, data: unknown) => new Response(JSON.stringify({ code: status, data }), {
  status, headers: { "content-type": "application/json" }
});

describe("stay detail terminal readback", () => {
  it("reads the real booking projection for no-show after stay 404", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(404, null))
      .mockResolvedValueOnce(response(200, { booking: { id: "id", status: "no_show" } }));
    const result = await loadHomestayDetail("stay", "id", "token", true);
    expect(result.data).toEqual({ booking: { id: "id", status: "no_show" } });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      "/api/v1/homestay/stays/id", "/api/v1/homestay/bookings/id"
    ]);
  });

  it.each([[404, false], [403, true], [503, true]])("does not broaden the read boundary (%s, authorized=%s)", async (status, authorized) => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(status as number, null));
    await expect(loadHomestayDetail("stay", "id", "token", authorized as boolean)).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not make a draft booking reachable through a stay URL", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(404, null))
      .mockResolvedValueOnce(response(200, { booking: { status: "draft" } }));
    await expect(loadHomestayDetail("stay", "id", "token", true)).rejects.toMatchObject({ status: 404 });
  });
});
