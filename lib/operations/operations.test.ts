import { describe, expect, it } from "vitest";
import { canAccessOperations } from "@/lib/auth/roles";
import { addIsoDays } from "@/lib/operations/dates";

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
});
