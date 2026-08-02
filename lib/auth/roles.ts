// Finance authority remains exclusive to `admin`. `operations_admin` may use
// the non-financial production workspace. `leading_hand` remains a legacy/demo
// label; daily leading-hand authority is derived from project assignment data.
export const roles = ["worker", "leading_hand", "operations_admin", "admin"] as const;

export type Role = (typeof roles)[number];

export function isWorker(role: Role) {
  return role === "worker";
}

export function canManageCrew(role: Role) {
  return role === "admin";
}

export function canManageAdmin(role: Role) {
  return role === "admin";
}

export function canAccessOperations(role: Role) {
  return role === "admin" || role === "operations_admin";
}
