import { describe, expect, it } from "vitest";
import { canAccessOperations } from "@/lib/auth/roles";
import { addIsoDays, getInclusiveIsoDayCount } from "@/lib/operations/dates";
import { calculateClientRateGroups } from "@/lib/operations/invoice-calculations";

describe("operations access", () => {
  it("allows finance and operations admins", () => {
    expect(canAccessOperations("admin")).toBe(true);
    expect(canAccessOperations("operations_admin")).toBe(true);
  });

  it("does not grant operations access to contractor roles", () => {
    expect(canAccessOperations("worker")).toBe(false);
    expect(canAccessOperations("leading_hand")).toBe(false);
  });
});

describe("fortnight dates", () => {
  it("uses an inclusive 14-day period", () => {
    expect(addIsoDays("2026-08-01", 13)).toBe("2026-08-14");
  });

  it("handles month and leap-year boundaries", () => {
    expect(addIsoDays("2028-02-25", 4)).toBe("2028-02-29");
  });

  it("allows a single-day client invoice period", () => {
    expect(getInclusiveIsoDayCount("2026-08-02", "2026-08-02")).toBe(1);
  });

  it("allows a manually selected multi-day client invoice period", () => {
    expect(getInclusiveIsoDayCount("2026-08-02", "2026-08-04")).toBe(3);
  });

  it("rejects an end date before the start date", () => {
    expect(getInclusiveIsoDayCount("2026-08-04", "2026-08-02")).toBe(0);
  });
});

describe("client invoice worker rate groups", () => {
  it("groups production by contractor billing rate instead of project", () => {
    const groups = calculateClientRateGroups(
      [
        { workerId: "worker-700-a", hours: 10, tonnes: 1 },
        { workerId: "worker-700-a", hours: 83.75, tonnes: 8.375 },
        { workerId: "worker-650-a", hours: 200, tonnes: 20 },
        { workerId: "worker-650-b", hours: 250, tonnes: 25 }
      ],
      [
        { workerId: "worker-700-a", ratePerTonne: 700 },
        { workerId: "worker-650-a", ratePerTonne: 650 },
        { workerId: "worker-650-b", ratePerTonne: 650 }
      ]
    );

    expect(groups).toEqual([
      {
        ratePerTonne: 700,
        workerCount: 1,
        hours: 93.75,
        tonnes: 9.375,
        subtotal: 6562.5
      },
      {
        ratePerTonne: 650,
        workerCount: 2,
        hours: 450,
        tonnes: 45,
        subtotal: 29250
      }
    ]);
  });
});
