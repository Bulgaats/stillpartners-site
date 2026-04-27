// The production access model is worker/admin. `leading_hand` remains only as a
// legacy/demo view label; daily leading-hand authority is derived from job
// assignment data, not from a permanent profile role.
export const roles = ["worker", "leading_hand", "admin"] as const;

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
