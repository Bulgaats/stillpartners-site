import { determineCurrentWeekPeriod } from "@/lib/business";
import { type DashboardData } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const week = determineCurrentWeekPeriod(today);

export const demoUserIds = {
  worker: "worker-1",
  leadingHand: "worker-2",
  admin: "admin-1"
};

export const mockDashboardData: DashboardData = {
  currentUserId: demoUserIds.worker,
  profiles: [
    {
      id: demoUserIds.worker,
      role: "worker",
      fullName: "Jack Turner",
      email: "jack@example.com",
      phone: "0400 111 222",
      abn: "12 345 678 901",
      bankDetails: "BSB 066-000 · Account ****321",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: "worker-2",
      role: "worker",
      fullName: "Mason Reid",
      email: "mason@example.com",
      phone: "0400 333 444",
      abn: "22 345 678 901",
      bankDetails: "BSB 086-111 · Account ****882",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: "worker-3",
      role: "worker",
      fullName: "Liam O'Connor",
      email: "liam@example.com",
      phone: "0400 777 111",
      abn: "33 345 678 901",
      bankDetails: "BSB 036-222 · Account ****120",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: "worker-4",
      role: "worker",
      fullName: "Noah Singh",
      email: "noah@example.com",
      phone: "0400 777 222",
      abn: "44 345 678 901",
      bankDetails: "BSB 066-333 · Account ****410",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: "worker-5",
      role: "worker",
      fullName: "Ethan Brown",
      email: "ethan@example.com",
      phone: "0400 777 333",
      abn: "55 345 678 901",
      bankDetails: "BSB 086-444 · Account ****905",
      agreementSigned: false,
      agreementReviewedNotice: false,
      isActive: true
    },
    {
      id: "worker-6",
      role: "worker",
      fullName: "Sarah Collins",
      email: "sarah@example.com",
      phone: "0400 555 666",
      abn: "66 345 678 901",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: "worker-7",
      role: "worker",
      fullName: "Daniel Wright",
      email: "daniel@example.com",
      phone: "0400 555 777",
      abn: "77 345 678 901",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    },
    {
      id: demoUserIds.admin,
      role: "admin",
      fullName: "Still Partners Admin",
      email: "admin@stillpartners.com.au",
      agreementSigned: true,
      agreementReviewedNotice: true,
      isActive: true
    }
  ],
  certificates: [
    {
      id: "cert-1",
      workerId: demoUserIds.worker,
      title: "White Card",
      status: "approved",
      expiresOn: "2028-04-26"
    },
    {
      id: "cert-2",
      workerId: "worker-2",
      title: "Working at Heights",
      status: "pending"
    },
    {
      id: "cert-3",
      workerId: "worker-3",
      title: "Public liability insurance",
      status: "approved",
      expiresOn: "2027-10-01"
    },
    {
      id: "cert-4",
      workerId: "worker-4",
      title: "Trade certificate",
      status: "rejected"
    }
  ],
  clients: [
    {
      id: "client-1",
      name: "Perth Main Contractors",
      billingEmail: "accounts@pmc.example"
    },
    {
      id: "client-2",
      name: "West Coast Builds",
      billingEmail: "ap@westcoast.example"
    }
  ],
  sites: [
    {
      id: "site-1",
      clientId: "client-1",
      name: "East Perth Apartments",
      address: "88 Adelaide Terrace, East Perth WA"
    },
    {
      id: "site-2",
      clientId: "client-1",
      name: "Osborne Park Warehouse",
      address: "12 Hutton Street, Osborne Park WA"
    },
    {
      id: "site-3",
      clientId: "client-2",
      name: "Canning Vale Industrial",
      address: "44 Baile Road, Canning Vale WA"
    }
  ],
  jobs: [
    {
      id: "job-1",
      siteId: "site-1",
      clientId: "client-1",
      title: "Level 4 steel fixing",
      trade: "Steelfixer",
      workDate: today,
      startTime: "06:30",
      leadingHandId: "worker-2",
      notes: "Meet at gate B. PPE and White Card required."
    },
    {
      id: "job-2",
      siteId: "site-2",
      clientId: "client-1",
      title: "Formwork prep",
      trade: "Carpenter",
      workDate: tomorrow,
      startTime: "07:00",
      leadingHandId: "worker-5",
      notes: "Tomorrow schedule draft."
    },
    {
      id: "job-3",
      siteId: "site-3",
      clientId: "client-2",
      title: "Carpentry install",
      trade: "Carpenter",
      workDate: today,
      startTime: "07:00",
      leadingHandId: "worker-3",
      notes: "Use north entry."
    }
  ],
  assignments: [
    {
      id: "assign-1",
      jobId: "job-1",
      workerId: demoUserIds.worker,
      leadingHandId: "worker-2"
    },
    {
      id: "assign-2",
      jobId: "job-1",
      workerId: "worker-2",
      leadingHandId: "worker-2"
    },
    {
      id: "assign-3",
      jobId: "job-3",
      workerId: "worker-3",
      leadingHandId: "worker-3"
    },
    {
      id: "assign-4",
      jobId: "job-3",
      workerId: "worker-4",
      leadingHandId: "worker-3"
    },
    {
      id: "assign-5",
      jobId: "job-2",
      workerId: "worker-5",
      leadingHandId: "worker-5"
    }
  ],
  timesheets: [
    {
      id: "ts-1",
      jobId: "job-1",
      workerId: demoUserIds.worker,
      submittedBy: demoUserIds.worker,
      workDate: today,
      tonnesCompleted: 1.4,
      estimatedHours: 8,
      hours: 8,
      breakMinutes: 30,
      status: "submitted",
      siteName: "Elizabeth Quay Tower",
      notes: "Rebar install zone A"
    },
    {
      id: "ts-2",
      jobId: "job-1",
      workerId: "worker-2",
      submittedBy: "worker-2",
      workDate: today,
      tonnesCompleted: 1.65,
      estimatedHours: 9.5,
      hours: 9.5,
      breakMinutes: 30,
      status: "approved",
      lockedAt: `${today}T09:00:00.000Z`,
      approvedAt: `${today}T09:00:00.000Z`,
      siteName: "Elizabeth Quay Tower",
      notes: "Approved crew entry"
    },
    {
      id: "ts-3",
      jobId: "job-1",
      workerId: demoUserIds.worker,
      submittedBy: demoUserIds.worker,
      workDate: week.start,
      tonnesCompleted: 1.25,
      estimatedHours: 7.5,
      hours: 7.5,
      breakMinutes: 30,
      status: "approved",
      lockedAt: `${week.start}T09:00:00.000Z`,
      approvedAt: `${week.start}T09:00:00.000Z`,
      siteName: "Elizabeth Quay Tower"
    },
    {
      id: "ts-4",
      jobId: "job-3",
      workerId: "worker-3",
      submittedBy: "worker-3",
      workDate: today,
      tonnesCompleted: 1.8,
      estimatedHours: 10,
      hours: 10,
      breakMinutes: 30,
      status: "approved",
      lockedAt: `${today}T10:00:00.000Z`,
      approvedAt: `${today}T10:00:00.000Z`,
      siteName: "Fremantle Apartments"
    },
    {
      id: "ts-5",
      jobId: "job-3",
      workerId: "worker-4",
      submittedBy: "worker-3",
      workDate: today,
      tonnesCompleted: 0.95,
      estimatedHours: 6.5,
      hours: 6.5,
      breakMinutes: 30,
      status: "submitted",
      siteName: "Fremantle Apartments"
    }
  ],
  correctionRequests: [
    {
      id: "corr-1",
      timesheetId: "ts-2",
      workerId: "worker-2",
      requestedTonnes: 1.75,
      requestedHours: 10,
      reason: "Tonnes need adjustment after end-of-day measure",
      status: "requested"
    }
  ],
  workerRates: [
    {
      id: "wr-1",
      workerId: demoUserIds.worker,
      ratePerTonne: 620,
      effectiveFrom: week.start,
      status: "approved"
    },
    {
      id: "wr-2",
      workerId: "worker-2",
      ratePerTonne: 590,
      effectiveFrom: week.start,
      status: "approved"
    },
    {
      id: "wr-3",
      workerId: "worker-3",
      ratePerTonne: 610,
      effectiveFrom: week.start,
      status: "approved"
    },
    {
      id: "wr-4",
      workerId: "worker-4",
      ratePerTonne: 575,
      effectiveFrom: week.start,
      status: "approved"
    }
  ],
  clientRates: [
    {
      id: "cr-1",
      clientId: "client-1",
      trade: "Steelfixer",
      ratePerTonne: 920,
      effectiveFrom: week.start
    },
    {
      id: "cr-2",
      clientId: "client-2",
      trade: "Carpenter",
      ratePerTonne: 880,
      effectiveFrom: week.start
    }
  ],
  rateChangeRequests: [
    {
      id: "rate-demo-1",
      workerId: "worker-4",
      proposedRatePerTonne: 600,
      status: "pending_worker_approval",
      addendumCreated: true
    }
  ],
  workerInvoices: [
    {
      id: "winv-1",
      invoiceNumber: "WINV-DEMO-0001",
      workerId: demoUserIds.worker,
      periodStart: week.start,
      periodEnd: week.end,
      status: "approved",
      approvedAt: `${today}T08:00:00.000Z`,
      items: [
        {
          id: "wi-1",
          timesheetId: "ts-3",
          description: "Approved output completed",
          workDate: week.start,
          siteName: "Elizabeth Quay Tower",
          hours: 7.5,
          tonnes: 1.25,
          rate: 620,
          total: 775
        }
      ],
      total: 775,
      storagePath: "worker/worker-1/WINV-DEMO-0001.pdf"
    },
    {
      id: "winv-2",
      invoiceNumber: "WINV-DEMO-0002",
      workerId: "worker-3",
      periodStart: week.start,
      periodEnd: week.end,
      status: "paid",
      approvedAt: `${today}T08:00:00.000Z`,
      submittedAt: `${today}T09:00:00.000Z`,
      items: [],
      total: 610,
      storagePath: "worker/worker-3/WINV-DEMO-0002.pdf"
    }
  ],
  clientInvoices: [
    {
      id: "cinv-1",
      invoiceNumber: "CINV-DEMO-0001",
      clientId: "client-1",
      periodStart: week.start,
      periodEnd: week.end,
      status: "paid",
      items: [],
      total: 1450,
      storagePath: "client/client-1/CINV-DEMO-0001.pdf"
    },
    {
      id: "cinv-2",
      invoiceNumber: "CINV-DEMO-0002",
      clientId: "client-2",
      periodStart: week.start,
      periodEnd: week.end,
      status: "pending",
      items: [],
      total: 880,
      storagePath: "client/client-2/CINV-DEMO-0002.pdf"
    }
  ],
  recurringExpenses: [
    {
      id: "exp-1",
      name: "Payroll software",
      amount: 85,
      frequency: "monthly"
    },
    {
      id: "exp-2",
      name: "Vehicle fuel",
      amount: 240,
      frequency: "fortnightly"
    },
    {
      id: "exp-3",
      name: "Insurance",
      amount: 180,
      frequency: "weekly"
    }
  ]
};
