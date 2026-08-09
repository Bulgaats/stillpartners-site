import { type OperationsContractor, type OperationsProject } from "@/lib/operations/types";

const inactiveProjectStatuses = new Set(["archived", "cancelled", "completed", "inactive"]);

export function isOperationsContractorActive(contractor: OperationsContractor) {
  return contractor.isActive && contractor.accountEnabled;
}

export function isOperationsProjectActive(project: OperationsProject) {
  return isOperationsProjectStatusActive(project.status);
}

export function isOperationsProjectStatusActive(status: string) {
  return !inactiveProjectStatuses.has(status.trim().toLowerCase());
}
