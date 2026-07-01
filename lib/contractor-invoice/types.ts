export type ContractorProfile = {
  fullName: string;
  abn: string;
  phone: string;
  email: string;
  bankName: string;
  bsb: string;
  accountNumber: string;
  defaultRatePerTonne: string;
  gstRegistered: boolean;
};

export type DailyHours = {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
};

export type BillToOption = "still-partners" | "other";

export type BillToDetails = {
  option: BillToOption;
  companyName: string;
  abn: string;
  email: string;
  address: string;
};

export type InvoiceDraft = {
  weekMonday: string;
  projectSite: string;
  dailyHours: DailyHours;
  ratePerTonne: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  billTo: BillToDetails;
};

export type InvoiceCalculation = {
  totalHours: number;
  tonnesDelivered: number;
  subtotal: number;
  gst: number;
  total: number;
  periodStart: string;
  periodEnd: string;
  weekDates: Record<keyof DailyHours, string>;
  hasHours: boolean;
};

export type GeneratedInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  generatedAt: string;
  profile: ContractorProfile;
  draft: InvoiceDraft;
  calculation: InvoiceCalculation;
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export const dayKeys = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const satisfies readonly (keyof DailyHours)[];

export const dayLabels: Record<keyof DailyHours, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

export const emptyProfile: ContractorProfile = {
  fullName: "",
  abn: "",
  phone: "",
  email: "",
  bankName: "",
  bsb: "",
  accountNumber: "",
  defaultRatePerTonne: "",
  gstRegistered: false
};

export const emptyDailyHours: DailyHours = {
  monday: "",
  tuesday: "",
  wednesday: "",
  thursday: "",
  friday: "",
  saturday: "",
  sunday: ""
};

export const stillPartnersBillTo: BillToDetails = {
  option: "still-partners",
  companyName: "Still Partners Pty Ltd",
  abn: "62 687 072 420",
  email: "work@stillpartners.net",
  address: ""
};

export const emptyCustomBillTo: BillToDetails = {
  option: "other",
  companyName: "",
  abn: "",
  email: "",
  address: ""
};
