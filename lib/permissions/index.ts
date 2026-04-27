import { type Role } from "@/lib/auth/roles";
import { type Job, type JobAssignment, type Timesheet } from "@/lib/types";

export function canViewWorkerRate(role: Role) {
  return role === "worker" || role === "admin";
}

export function canViewClientRate(role: Role) {
  return role === "admin";
}

export function canEditTimesheet(role: Role, timesheet: Timesheet) {
  if (timesheet.lockedAt || timesheet.status === "approved") {
    return role === "admin";
  }

  return role === "worker" || role === "admin";
}

export function isDailyLeadingHandForJob({
  date,
  job,
  userId
}: {
  date: string;
  job: Job;
  userId: string;
}) {
  return job.workDate === date && job.leadingHandId === userId;
}

export function canEnterCrewHoursForJob({
  assignments,
  date,
  job,
  role,
  userId,
  workerId
}: {
  assignments: JobAssignment[];
  date: string;
  job: Job;
  role: Role;
  userId: string;
  workerId: string;
}) {
  if (role === "admin") {
    return true;
  }

  if (!isDailyLeadingHandForJob({ date, job, userId })) {
    return false;
  }

  return assignments.some(
    (assignment) => assignment.jobId === job.id && assignment.workerId === workerId
  );
}

export function dailyLeadingHandMustBeAssigned({
  assignments,
  jobId,
  leadingHandWorkerId
}: {
  assignments: Pick<JobAssignment, "jobId" | "workerId">[];
  jobId: string;
  leadingHandWorkerId: string;
}) {
  return assignments.some(
    (assignment) =>
      assignment.jobId === jobId && assignment.workerId === leadingHandWorkerId
  );
}

export function canApproveTimesheet(role: Role) {
  return role === "admin";
}

export function canManageSchedule(role: Role) {
  return role === "admin";
}

export function canGenerateInvoices(role: Role) {
  return role === "admin";
}

export function canViewProfitDashboard(role: Role) {
  return role === "admin";
}
