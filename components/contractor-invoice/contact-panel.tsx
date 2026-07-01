"use client";

import { Mail } from "lucide-react";

export function ContactPanel() {
  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Still Partners Pty Ltd</h2>
        <div className="mt-3 grid gap-1 text-sm text-slate-700">
          <p>Reinforcement / steelfixing subcontract services</p>
          <p>Perth, Western Australia</p>
          <p>ABN: 62 687 072 420</p>
          <p>Email: work@stillpartners.net</p>
          <p>Website: stillpartners.net</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          Still Partners coordinates reinforcement subcontract works for construction projects in Western Australia.
        </p>
      </div>

      <div className="grid gap-3">
        <a
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white"
          href="mailto:work@stillpartners.net"
        >
          <Mail className="size-4" aria-hidden="true" />
          Contact Still Partners
        </a>
        <a
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-950"
          href="mailto:work@stillpartners.net?subject=Subcontract%20/%20project%20work%20enquiry"
        >
          <Mail className="size-4" aria-hidden="true" />
          Subcontract / project work enquiry
        </a>
      </div>
    </section>
  );
}
