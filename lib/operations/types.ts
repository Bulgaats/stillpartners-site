export type OperationsClient = {
  id: string;
  name: string;
};

export type OperationsProject = {
  id: string;
  clientId: string;
  name: string;
  location: string;
  status: string;
};

export type OperationsContractor = {
  id: string;
  fullName: string;
};

export type OperationsWorkEntry = {
  id: string;
  workerId: string;
  jobId: string;
  workDate: string;
  hours: number;
  tonnes: number;
  approved: boolean;
  locked: boolean;
  updatedAt: string;
};

export type OperationsClientInvoice = {
  id: string;
  clientId: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  gstApplied: boolean;
  dueOn?: string;
  localArchiveStatus: string;
};

export type OperationsWorkspaceData = {
  currentUserId: string;
  isFinanceAdmin: boolean;
  rangeStart: string;
  rangeEnd: string;
  clients: OperationsClient[];
  projects: OperationsProject[];
  contractors: OperationsContractor[];
  workEntries: OperationsWorkEntry[];
  clientInvoices: OperationsClientInvoice[];
};
