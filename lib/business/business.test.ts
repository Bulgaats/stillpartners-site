import { describe, expect, it } from "vitest";
import {
  calculateProfit,
  calculateWorkerInvoiceTotal,
  buildInvoiceItem,
  canTimesheetBeEdited,
  getWorkerInvoiceStatusBadge,
  hoursToTonnes
} from "@/lib/business";
import {
  canApproveTimesheet,
  canEnterCrewHoursForJob,
  canViewClientRate,
  canViewWorkerRate,
  dailyLeadingHandMustBeAssigned,
  isDailyLeadingHandForJob
} from "@/lib/permissions";
import { demoUserIdForAccessView, updateProfileById } from "@/lib/mock/profile-utils";

describe("permissions", () => {
  it("worker cannot see client rates", () => {
    expect(canViewClientRate("worker")).toBe(false);
  });

  it("leading hand cannot see worker or client rates", () => {
    expect(canViewWorkerRate("leading_hand")).toBe(false);
    expect(canViewClientRate("leading_hand")).toBe(false);
  });

  it("admin can see rates", () => {
    expect(canViewWorkerRate("admin")).toBe(true);
    expect(canViewClientRate("admin")).toBe(true);
  });

  it("correction approval requires admin authority", () => {
    expect(canApproveTimesheet("admin")).toBe(true);
    expect(canApproveTimesheet("worker")).toBe(false);
    expect(canApproveTimesheet("leading_hand")).toBe(false);
  });

  it("daily leading hand must be one of selected workers", () => {
    expect(
      dailyLeadingHandMustBeAssigned({
        jobId: "job-1",
        leadingHandWorkerId: "worker-2",
        assignments: [
          { jobId: "job-1", workerId: "worker-1" },
          { jobId: "job-1", workerId: "worker-2" }
        ]
      })
    ).toBe(true);
    expect(
      dailyLeadingHandMustBeAssigned({
        jobId: "job-1",
        leadingHandWorkerId: "worker-3",
        assignments: [{ jobId: "job-1", workerId: "worker-1" }]
      })
    ).toBe(false);
  });

  it("daily leading hand access only applies for assigned date and site", () => {
    const job = {
      id: "job-1",
      siteId: "site-1",
      clientId: "client-1",
      title: "Steel",
      trade: "Steelfixer",
      workDate: "2026-04-26",
      startTime: "06:30",
      leadingHandId: "worker-2"
    };

    expect(
      isDailyLeadingHandForJob({
        date: "2026-04-26",
        job,
        userId: "worker-2"
      })
    ).toBe(true);
    expect(
      isDailyLeadingHandForJob({
        date: "2026-04-27",
        job,
        userId: "worker-2"
      })
    ).toBe(false);
  });

  it("non-selected workers cannot enter crew hours", () => {
    const job = {
      id: "job-1",
      siteId: "site-1",
      clientId: "client-1",
      title: "Steel",
      trade: "Steelfixer",
      workDate: "2026-04-26",
      startTime: "06:30",
      leadingHandId: "worker-2"
    };

    expect(
      canEnterCrewHoursForJob({
        assignments: [{ id: "a1", jobId: "job-1", workerId: "worker-1", leadingHandId: "worker-2" }],
        date: "2026-04-26",
        job,
        role: "leading_hand",
        userId: "worker-2",
        workerId: "worker-3"
      })
    ).toBe(false);
  });
});

describe("business rules", () => {
  it("keeps hours conversion as an internal estimating helper", () => {
    expect(hoursToTonnes(10)).toBe(1);
    expect(hoursToTonnes(8)).toBe(0.8);
  });

  it("worker invoice totals are based on tonnes completed, not estimated hours", () => {
    const item = buildInvoiceItem(
      {
        id: "entry",
        jobId: "job",
        workerId: "worker",
        submittedBy: "worker",
        workDate: "2026-04-26",
        tonnesCompleted: 2.5,
        estimatedHours: 8,
        hours: 8,
        breakMinutes: 30,
        status: "approved",
        siteName: "Perth Site"
      },
      "Approved output completed",
      600
    );

    expect(item.tonnes).toBe(2.5);
    expect(calculateWorkerInvoiceTotal([item])).toBe(1500);
  });

  it("locked timesheets cannot be edited", () => {
    expect(
      canTimesheetBeEdited({
        id: "ts",
        jobId: "job",
        workerId: "worker",
        submittedBy: "worker",
        workDate: "2026-04-26",
        tonnesCompleted: 1.2,
        estimatedHours: 8,
        hours: 8,
        breakMinutes: 30,
        status: "approved",
        lockedAt: "2026-04-26T00:00:00.000Z"
      })
    ).toBe(false);
  });

  it("profit uses paid invoices only", () => {
    const profit = calculateProfit({
      clientInvoices: [
        {
          id: "paid-client",
          invoiceNumber: "C1",
          clientId: "client",
          periodStart: "2026-04-01",
          periodEnd: "2026-04-14",
          status: "paid",
          items: [],
          total: 1000
        },
        {
          id: "pending-client",
          invoiceNumber: "C2",
          clientId: "client",
          periodStart: "2026-04-15",
          periodEnd: "2026-04-28",
          status: "pending",
          items: [],
          total: 2000
        }
      ],
      workerInvoices: [
        {
          id: "paid-worker",
          invoiceNumber: "W1",
          workerId: "worker",
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          status: "paid",
          items: [],
          total: 300
        }
      ],
      recurringExpenses: [
        { id: "exp", name: "Software", amount: 100, frequency: "fortnightly" }
      ]
    });

    expect(profit.paidIncome).toBe(1000);
    expect(profit.paidWorkerExpenses).toBe(300);
    expect(profit.netProfit).toBe(600);
  });

  it("worker invoice workflow uses draft approved submitted paid statuses", () => {
    expect(getWorkerInvoiceStatusBadge("draft")).toBe("Draft");
    expect(getWorkerInvoiceStatusBadge("approved")).toBe("Approved");
    expect(getWorkerInvoiceStatusBadge("submitted")).toBe("Submitted");
    expect(getWorkerInvoiceStatusBadge("paid")).toBe("Paid");
  });

  it("worker profile edits do not affect other worker records", () => {
    const profiles = [
      {
        id: "worker-1",
        role: "worker" as const,
        fullName: "Old One",
        email: "one@example.com",
        agreementSigned: true,
        agreementReviewedNotice: true,
        isActive: true
      },
      {
        id: "worker-2",
        role: "worker" as const,
        fullName: "Old Two",
        email: "two@example.com",
        agreementSigned: true,
        agreementReviewedNotice: true,
        isActive: true
      }
    ];
    const updated = updateProfileById(profiles, "worker-1", { fullName: "New One" });

    expect(updated.find((profile) => profile.id === "worker-1")?.fullName).toBe("New One");
    expect(updated.find((profile) => profile.id === "worker-2")?.fullName).toBe("Old Two");
  });

  it("demo access views resolve to separate real people", () => {
    const ids = {
      worker: "worker-1",
      leadingHand: "worker-2",
      admin: "admin-1"
    };

    expect(demoUserIdForAccessView("worker", ids)).toBe("worker-1");
    expect(demoUserIdForAccessView("leading_hand", ids)).toBe("worker-2");
    expect(demoUserIdForAccessView("admin", ids)).toBe("admin-1");
  });

  it("admin profile edits do not affect worker or daily leading hand records", () => {
    const profiles = [
      {
        id: "worker-1",
        role: "worker" as const,
        fullName: "Worker One",
        email: "one@example.com",
        agreementSigned: true,
        agreementReviewedNotice: true,
        isActive: true
      },
      {
        id: "worker-2",
        role: "worker" as const,
        fullName: "Daily Lead Worker",
        email: "lead@example.com",
        agreementSigned: true,
        agreementReviewedNotice: true,
        isActive: true
      },
      {
        id: "admin-1",
        role: "admin" as const,
        fullName: "Admin",
        email: "admin@example.com",
        agreementSigned: true,
        agreementReviewedNotice: true,
        isActive: true
      }
    ];
    const updated = updateProfileById(profiles, "admin-1", { fullName: "Sunny" });

    expect(updated.find((profile) => profile.id === "admin-1")?.fullName).toBe("Sunny");
    expect(updated.find((profile) => profile.id === "worker-1")?.fullName).toBe("Worker One");
    expect(updated.find((profile) => profile.id === "worker-2")?.fullName).toBe("Daily Lead Worker");
  });

  it("signature state is stored on the signed profile only", () => {
    const profiles = [
      {
        id: "worker-1",
        role: "worker" as const,
        fullName: "Worker One",
        email: "one@example.com",
        agreementSigned: false,
        agreementReviewedNotice: false,
        isActive: true
      },
      {
        id: "worker-2",
        role: "worker" as const,
        fullName: "Daily Lead Worker",
        email: "lead@example.com",
        agreementSigned: false,
        agreementReviewedNotice: false,
        isActive: true
      }
    ];

    const updated = updateProfileById(profiles, "worker-2", {
      agreementSigned: true,
      agreementSignedAt: "2026-04-26T08:00:00.000Z",
      agreementVersion: "mvp-placeholder-v1",
      agreementProfileFullName: "Daily Lead Worker",
      signatureImageDataUrl: "data:image/png;base64,signature"
    });

    expect(updated.find((profile) => profile.id === "worker-2")?.signatureImageDataUrl).toBe(
      "data:image/png;base64,signature"
    );
    expect(updated.find((profile) => profile.id === "worker-1")?.signatureImageDataUrl).toBeUndefined();
  });
});
