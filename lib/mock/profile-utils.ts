import { type UserProfile } from "@/lib/types";

export function updateProfileById(
  profiles: UserProfile[],
  profileId: string,
  patch: Partial<UserProfile>
) {
  return profiles.map((profile) =>
    profile.id === profileId ? { ...profile, ...patch, id: profile.id } : profile
  );
}

export function demoUserIdForAccessView(
  role: "worker" | "leading_hand" | "admin",
  ids: { worker: string; leadingHand: string; admin: string }
) {
  if (role === "admin") {
    return ids.admin;
  }

  if (role === "leading_hand") {
    return ids.leadingHand;
  }

  return ids.worker;
}
