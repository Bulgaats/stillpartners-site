"use client";

import { type Role } from "@/lib/auth/roles";

const roleOptions: { label: string; value: Role }[] = [
  { label: "Contractor", value: "worker" },
  { label: "Project Lead", value: "leading_hand" },
  { label: "Admin", value: "admin" }
];

export function DemoModeBanner({
  role,
  onRoleChange
}: {
  role: Role;
  onRoleChange: (role: Role) => void;
}) {
  return (
    <section className="rounded-xl border border-orange-300 bg-orange-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-700">
            Demo Mode
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            Supabase is not configured. This dashboard is using local mock data
            and client-side state. Project Lead is a project/date responsibility,
            not a permanent contractor type.
          </p>
        </div>
        <label className="grid gap-1 text-sm font-bold text-gray-800 sm:min-w-52">
          Test role
          <select
            className="min-h-11 rounded-lg border border-orange-300 bg-white px-3 py-2 shadow-sm outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15"
            onChange={(event) => onRoleChange(event.target.value as Role)}
            value={role}
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
