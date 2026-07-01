"use client";

import type { ContractorProfile } from "@/lib/contractor-invoice/types";

type ProfileFormProps = {
  profile: ContractorProfile;
  onChange: (profile: ContractorProfile) => void;
  savedStatus: string;
};

export function ProfileForm({ profile, onChange, savedStatus }: ProfileFormProps) {
  function update<K extends keyof ContractorProfile>(field: K, value: ContractorProfile[K]) {
    onChange({ ...profile, [field]: value });
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-slate-950">Contractor profile</h2>
          <span className="text-xs font-bold text-emerald-700">{savedStatus}</span>
        </div>
        <div className="mt-4 grid gap-3">
          <Field label="Full name" value={profile.fullName} onChange={(value) => update("fullName", value)} />
          <Field label="ABN" value={profile.abn} onChange={(value) => update("abn", value)} />
          <Field label="Phone" value={profile.phone} onChange={(value) => update("phone", value)} />
          <Field label="Email" type="email" value={profile.email} onChange={(value) => update("email", value)} />
          <Field label="Bank name" value={profile.bankName} onChange={(value) => update("bankName", value)} />
          <Field label="BSB" value={profile.bsb} onChange={(value) => update("bsb", value)} />
          <Field
            label="Account number"
            value={profile.accountNumber}
            onChange={(value) => update("accountNumber", value)}
          />
          <Field
            label="Default rate per tonne"
            type="number"
            value={profile.defaultRatePerTonne}
            onChange={(value) => update("defaultRatePerTonne", value)}
          />
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800">
            GST registered?
            <input
              type="checkbox"
              className="size-5 accent-slate-950"
              checked={profile.gstRegistered}
              onChange={(event) => update("gstRegistered", event.target.checked)}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-800">
      {label}
      <input
        className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-950 outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
