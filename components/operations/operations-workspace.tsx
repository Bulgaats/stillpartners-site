"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  FileText,
  LockKeyhole,
  LogOut,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  UserPlus,
  Users
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import {
  createOperationsClientAction,
  createOperationsLocationAction,
  generateOperationsClientInvoiceAction,
  inviteOperationsAdminAction,
  saveOperationsDailyRecordsAction,
  type OperationsActionResult
} from "@/app/actions/operations";
import { addIsoDays, getInclusiveIsoDayCount } from "@/lib/operations/dates";
import { type OperationsWorkspaceData } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

type OperationsTab = "daily" | "history" | "locations" | "finance" | "access";

export function OperationsWorkspace({
  currentUserName,
  initialData,
  today
}: {
  currentUserName: string;
  initialData: OperationsWorkspaceData;
  today: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<OperationsTab>("daily");
  const [notice, setNotice] = useState<OperationsActionResult | null>(null);
  const firstClientId = initialData.clients[0]?.id ?? "";
  const firstProjectId =
    initialData.projects.find((project) => project.clientId === firstClientId)?.id ?? "";
  const [dailyDate, setDailyDate] = useState(today);
  const [dailyClientId, setDailyClientId] = useState(firstClientId);
  const [dailyProjectId, setDailyProjectId] = useState(firstProjectId);
  const [hoursByContractor, setHoursByContractor] = useState<Record<string, string>>({});

  const dailyProjects = useMemo(
    () => initialData.projects.filter((project) => project.clientId === dailyClientId),
    [dailyClientId, initialData.projects]
  );
  const selectedEntries = useMemo(
    () =>
      initialData.workEntries.filter(
        (entry) => entry.jobId === dailyProjectId && entry.workDate === dailyDate
      ),
    [dailyDate, dailyProjectId, initialData.workEntries]
  );
  const selectedEntryByWorker = useMemo(
    () => new Map(selectedEntries.map((entry) => [entry.workerId, entry])),
    [selectedEntries]
  );

  useEffect(() => {
    const nextValues = Object.fromEntries(
      initialData.contractors.map((contractor) => [
        contractor.id,
        selectedEntryByWorker.get(contractor.id)?.hours.toString() ?? ""
      ])
    );
    setHoursByContractor(nextValues);
  }, [initialData.contractors, selectedEntryByWorker]);

  function changeDailyClient(clientId: string) {
    setDailyClientId(clientId);
    setDailyProjectId(
      initialData.projects.find((project) => project.clientId === clientId)?.id ?? ""
    );
  }

  function runAction(action: () => Promise<OperationsActionResult>) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        setNotice(result);
        if (result.ok) {
          router.refresh();
        }
      } catch {
        setNotice({ ok: false, error: "Something went wrong. Please try again." });
      }
    });
  }

  function saveDailyRecords() {
    if (!dailyProjectId) {
      setNotice({ ok: false, error: "Select a client and location first." });
      return;
    }
    runAction(() =>
      saveOperationsDailyRecordsAction({
        jobId: dailyProjectId,
        workDate: dailyDate,
        records: initialData.contractors.map((contractor) => ({
          workerId: contractor.id,
          hours: Number(hoursByContractor[contractor.id] || 0)
        }))
      })
    );
  }

  const selectedHours = Object.values(hoursByContractor).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );

  const tabs = [
    { id: "daily" as const, label: "Daily records", icon: CalendarDays },
    { id: "history" as const, label: "All records", icon: ClipboardList },
    { id: "locations" as const, label: "Locations", icon: MapPin },
    ...(initialData.isFinanceAdmin
      ? [
          { id: "finance" as const, label: "Client invoices", icon: FileText },
          { id: "access" as const, label: "Clients & access", icon: ShieldCheck }
        ]
      : [])
  ];

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell" data-dashboard-busy={isPending}>
        <section className="dashboard-hero bg-blue-950 text-white">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">
                Still Partners · Internal operations
              </p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">Production records</h1>
              <p className="mt-2 text-sm leading-6 text-blue-100">
                {currentUserName} · {initialData.isFinanceAdmin ? "Finance admin" : "Operations admin"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {initialData.isFinanceAdmin ? (
                <Link
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm font-bold hover:bg-white/10"
                  href="/dashboard"
                >
                  Main dashboard
                </Link>
              ) : null}
              <form action={logout}>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-4 py-2 text-sm font-bold hover:bg-white/10"
                  type="submit"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={Users} label="Active contractors" value={initialData.contractors.length} />
          <StatCard icon={MapPin} label="Active locations" value={initialData.projects.length} />
          <StatCard
            icon={ClipboardList}
            label="Records in view"
            value={initialData.workEntries.length}
          />
        </section>

        {!initialData.isFinanceAdmin ? (
          <section className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <p>
              This account is limited to clients, locations, contractor hours and production
              history. Rates, GST, invoice values and payment information are not available.
            </p>
          </section>
        ) : null}

        <nav aria-label="Operations sections" className="dashboard-tabs">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={cn(
                  "dashboard-tab inline-flex items-center gap-2",
                  tab === item.id ? "dashboard-tab-active" : "dashboard-tab-idle"
                )}
                key={item.id}
                onClick={() => {
                  setNotice(null);
                  setTab(item.id);
                }}
                type="button"
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {notice ? <ActionNotice result={notice} /> : null}

        {tab === "daily" ? (
          <DailyRecordsPanel
            clientId={dailyClientId}
            clients={initialData.clients}
            contractors={initialData.contractors}
            date={dailyDate}
            hoursByContractor={hoursByContractor}
            isPending={isPending}
            onClientChange={changeDailyClient}
            onDateChange={setDailyDate}
            onHoursChange={(contractorId, value) =>
              setHoursByContractor((current) => ({ ...current, [contractorId]: value }))
            }
            onProjectChange={setDailyProjectId}
            onSave={saveDailyRecords}
            projectId={dailyProjectId}
            projects={dailyProjects}
            selectedEntryByWorker={selectedEntryByWorker}
            totalHours={selectedHours}
          />
        ) : null}

        {tab === "history" ? <HistoryPanel data={initialData} /> : null}
        {tab === "locations" ? (
          <LocationsPanel data={initialData} isPending={isPending} runAction={runAction} />
        ) : null}
        {tab === "finance" && initialData.isFinanceAdmin ? (
          <ClientInvoicesPanel
            data={initialData}
            isPending={isPending}
            runAction={runAction}
            today={today}
          />
        ) : null}
        {tab === "access" && initialData.isFinanceAdmin ? (
          <ClientsAndAccessPanel
            data={initialData}
            isPending={isPending}
            runAction={runAction}
          />
        ) : null}
      </div>
    </main>
  );
}

function DailyRecordsPanel({
  clientId,
  clients,
  contractors,
  date,
  hoursByContractor,
  isPending,
  onClientChange,
  onDateChange,
  onHoursChange,
  onProjectChange,
  onSave,
  projectId,
  projects,
  selectedEntryByWorker,
  totalHours
}: {
  clientId: string;
  clients: OperationsWorkspaceData["clients"];
  contractors: OperationsWorkspaceData["contractors"];
  date: string;
  hoursByContractor: Record<string, string>;
  isPending: boolean;
  onClientChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onHoursChange: (contractorId: string, value: string) => void;
  onProjectChange: (value: string) => void;
  onSave: () => void;
  projectId: string;
  projects: OperationsWorkspaceData["projects"];
  selectedEntryByWorker: Map<string, OperationsWorkspaceData["workEntries"][number]>;
  totalHours: number;
}) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card-header">
        <div className="dashboard-icon"><CalendarDays className="size-5" /></div>
        <div>
          <h2 className="dashboard-card-title">Daily contractor production</h2>
          <p className="dashboard-muted">Choose the work date and location, then enter each contractor&apos;s hours.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Work date">
          <input onChange={(event) => onDateChange(event.target.value)} type="date" value={date} />
        </Field>
        <Field label="Client">
          <select onChange={(event) => onClientChange(event.target.value)} value={clientId}>
            <option value="">Select client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </Field>
        <Field label="Location / project">
          <select onChange={(event) => onProjectChange(event.target.value)} value={projectId}>
            <option value="">Select location</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name} · {project.location}</option>
            ))}
          </select>
        </Field>
      </div>

      {contractors.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-gray-200">
          <div className="hidden grid-cols-[1fr_160px_130px] gap-4 bg-gray-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-500 sm:grid">
            <span>Contractor</span><span>Hours</span><span>Production</span>
          </div>
          {contractors.map((contractor) => {
            const entry = selectedEntryByWorker.get(contractor.id);
            const locked = Boolean(entry?.locked || entry?.approved);
            const hours = Number(hoursByContractor[contractor.id] || 0);
            return (
              <div className="grid gap-3 border-t border-gray-200 px-4 py-4 first:border-t-0 sm:grid-cols-[1fr_160px_130px] sm:items-center" key={contractor.id}>
                <div>
                  <p className="font-bold text-blue-950">{contractor.fullName}</p>
                  {locked ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><LockKeyhole className="size-3.5" /> Included in invoice</p> : null}
                </div>
                <label className="grid gap-1 text-xs font-bold text-gray-500">
                  <span className="sm:hidden">Hours</span>
                  <input
                    aria-label={`${contractor.fullName} hours`}
                    disabled={locked || isPending || !projectId}
                    inputMode="decimal"
                    max="24"
                    min="0"
                    onChange={(event) => onHoursChange(contractor.id, event.target.value)}
                    placeholder="0.0"
                    step="0.25"
                    type="number"
                    value={hoursByContractor[contractor.id] ?? ""}
                  />
                </label>
                <div className="text-sm font-bold text-gray-700">{(hours / 10).toFixed(3)} t</div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text="No active contractors are available yet." />
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-xl bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Daily total</p>
          <p className="mt-1 text-xl font-black text-blue-950">{totalHours.toFixed(2)} hours · {(totalHours / 10).toFixed(3)} t</p>
        </div>
        <button className="dashboard-button dashboard-button-primary inline-flex items-center justify-center gap-2" disabled={isPending || !projectId || contractors.length === 0} onClick={onSave} type="button">
          <Save className="size-4" /> {isPending ? "Saving…" : "Save daily records"}
        </button>
      </div>
    </section>
  );
}

function HistoryPanel({ data }: { data: OperationsWorkspaceData }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [rangeStart, setRangeStart] = useState(data.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(data.rangeEnd);
  const visibleEntries = data.workEntries.filter(
    (entry) =>
      (!clientId || data.projects.find((project) => project.id === entry.jobId)?.clientId === clientId) &&
      (!projectId || entry.jobId === projectId) &&
      (!contractorId || entry.workerId === contractorId)
  );

  return (
    <section className="dashboard-card">
      <div className="dashboard-card-header">
        <div className="dashboard-icon"><ClipboardList className="size-5" /></div>
        <div><h2 className="dashboard-card-title">All operational records</h2><p className="dashboard-muted">Review recorded dates, locations, contractors and production hours.</p></div>
      </div>
      <div className="mb-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="History from"><input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></Field>
        <Field label="History to"><input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></Field>
        <button className="dashboard-button dashboard-button-outline" onClick={() => router.push(`/operations?from=${rangeStart}&to=${rangeEnd}`)} type="button">Load range</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Client"><select value={clientId} onChange={(event) => { setClientId(event.target.value); setProjectId(""); }}><option value="">All clients</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
        <Field label="Location"><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All locations</option>{data.projects.filter((project) => !clientId || project.clientId === clientId).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label="Contractor"><select value={contractorId} onChange={(event) => setContractorId(event.target.value)}><option value="">All contractors</option>{data.contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.fullName}</option>)}</select></Field>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Contractor</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">Tonnes</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody>
            {visibleEntries.map((entry) => {
              const project = data.projects.find((item) => item.id === entry.jobId);
              const client = data.clients.find((item) => item.id === project?.clientId);
              const contractor = data.contractors.find((item) => item.id === entry.workerId);
              return <tr className="border-t border-gray-200" key={entry.id}><td className="px-4 py-3 font-bold text-blue-950">{formatDate(entry.workDate)}</td><td className="px-4 py-3">{client?.name}</td><td className="px-4 py-3">{project?.name}</td><td className="px-4 py-3">{contractor?.fullName}</td><td className="px-4 py-3 text-right font-bold">{entry.hours.toFixed(2)}</td><td className="px-4 py-3 text-right">{entry.tonnes.toFixed(3)}</td><td className="px-4 py-3">{entry.locked || entry.approved ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800"><LockKeyhole className="size-3" /> Invoiced</span> : <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">Open</span>}</td></tr>;
            })}
          </tbody>
        </table>
        {visibleEntries.length === 0 ? <EmptyState text="No records match these filters." /> : null}
      </div>
    </section>
  );
}

function LocationsPanel({ data, isPending, runAction }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  function submit() {
    runAction(async () => {
      const result = await createOperationsLocationAction({ clientId, name, address });
      if (result.ok) { setName(""); setAddress(""); }
      return result;
    });
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <section className="dashboard-card">
      <div className="dashboard-card-header"><div className="dashboard-icon"><Plus className="size-5" /></div><div><h2 className="dashboard-card-title">Add a location</h2><p className="dashboard-muted">All operations users can add a new work location under an existing client.</p></div></div>
      <div className="grid gap-4"><Field label="Client"><select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Select client</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Location / project name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Tonkin Highway package" /></Field><Field label="Site address"><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, suburb, WA" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || !clientId || !name.trim() || !address.trim()} onClick={submit} type="button">{isPending ? "Adding…" : "Add location"}</button></div>
    </section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><MapPin className="size-5" /></div><div><h2 className="dashboard-card-title">Current locations</h2><p className="dashboard-muted">Locations available for daily records.</p></div></div><div className="grid gap-3 sm:grid-cols-2">{data.projects.map((project) => { const client = data.clients.find((item) => item.id === project.clientId); return <article className="rounded-xl border border-gray-200 bg-gray-50 p-4" key={project.id}><p className="font-black text-blue-950">{project.name}</p><p className="mt-1 text-sm font-bold text-orange-600">{client?.name}</p><p className="mt-2 text-sm text-gray-600">{project.location}</p></article>; })}</div>{data.projects.length === 0 ? <EmptyState text="No locations have been added yet." /> : null}</section>
  </div>;
}

function ClientInvoicesPanel({ data, isPending, runAction, today }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void; today: string }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState(addIsoDays(today, -13));
  const [periodEnd, setPeriodEnd] = useState(today);
  const [rate, setRate] = useState("");
  const [gstApplied, setGstApplied] = useState(true);
  const periodDays = getInclusiveIsoDayCount(periodStart, periodEnd);
  const projects = data.projects.filter((project) => project.clientId === clientId);
  const entries = data.workEntries.filter((entry) => projectIds.includes(entry.jobId) && entry.workDate >= periodStart && entry.workDate <= periodEnd && !entry.locked && !entry.approved);
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const tonnes = entries.reduce((sum, entry) => sum + entry.hours / 10, 0);
  const subtotal = tonnes * (Number(rate) || 0);
  const gst = gstApplied ? subtotal * 0.1 : 0;

  function changeClient(nextClientId: string) { setClientId(nextClientId); setProjectIds([]); }
  function toggleProject(projectId: string) { setProjectIds((current) => current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]); }
  function submit() { runAction(() => generateOperationsClientInvoiceAction({ clientId, projectIds, periodStart, periodEnd, ratePerTonne: Number(rate), gstApplied })); }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <section className="dashboard-card">
      <div className="dashboard-card-header"><div className="dashboard-icon"><FileText className="size-5" /></div><div><h2 className="dashboard-card-title">Create client invoice</h2><p className="dashboard-muted">The default period is 14 days. Choose any start and end dates, including a single day.</p></div></div>
      <div className="grid gap-4"><Field label="Client"><select value={clientId} onChange={(event) => changeClient(event.target.value)}><option value="">Select client</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Period start"><input value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} type="date" /></Field><Field label="Period end"><input value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} type="date" /></Field></div><div className={cn("rounded-lg px-3 py-3 text-sm font-bold", periodDays > 0 ? "bg-gray-100 text-blue-950" : "bg-red-50 text-red-800")}>{periodDays > 0 ? `${periodDays} day${periodDays === 1 ? "" : "s"} selected` : "End date must be on or after start date"}</div>
        <fieldset><legend className="mb-2 text-sm font-bold text-gray-800">Locations included</legend><div className="grid gap-2">{projects.map((project) => <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold" key={project.id}><input checked={projectIds.includes(project.id)} onChange={() => toggleProject(project.id)} type="checkbox" /> <span>{project.name}<span className="block text-xs font-normal text-gray-500">{project.location}</span></span></label>)}</div>{projects.length === 0 ? <p className="text-sm text-gray-500">No locations for this client.</p> : null}</fieldset>
        <Field label="Rate per tonne (AUD)"><input inputMode="decimal" min="0" onChange={(event) => setRate(event.target.value)} placeholder="0.00" step="0.01" type="number" value={rate} /></Field>
        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold"><input checked={gstApplied} onChange={(event) => setGstApplied(event.target.checked)} type="checkbox" /> Add GST (10%)</label>
      </div>
      <div className="mt-5 rounded-xl bg-blue-950 p-4 text-white"><p className="text-xs font-black uppercase tracking-wide text-blue-200">Invoice preview</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><SummaryValue label="Records" value={entries.length.toString()} /><SummaryValue label="Hours" value={totalHours.toFixed(2)} /><SummaryValue label="Tonnes" value={tonnes.toFixed(3)} /><SummaryValue label="Subtotal" value={formatMoney(subtotal)} /><SummaryValue label="GST" value={formatMoney(gst)} /><SummaryValue label="Total" value={formatMoney(subtotal + gst)} strong /></dl></div>
      <button className="dashboard-button dashboard-button-orange mt-4 w-full" disabled={isPending || !clientId || projectIds.length === 0 || periodDays < 1 || entries.length === 0 || Number(rate) <= 0} onClick={submit} type="button">{isPending ? "Creating…" : "Create and lock invoice"}</button>
    </section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><DollarSign className="size-5" /></div><div><h2 className="dashboard-card-title">Client invoices</h2><p className="dashboard-muted">Private finance view for Bulgaa and Zaya. Each invoice has two separate PDF files.</p></div></div><div className="grid gap-3">{data.clientInvoices.map((invoice) => { const client = data.clients.find((item) => item.id === invoice.clientId); return <article className="rounded-xl border border-gray-200 p-4" key={invoice.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black text-blue-950">{invoice.invoiceNumber}</p><p className="mt-1 text-sm text-gray-600">{client?.name} · {formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</p><span className="mt-2 inline-block rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">{invoice.status}</span></div><div className="sm:text-right"><p className="text-xl font-black text-blue-950">{formatMoney(invoice.totalAmount)}</p><p className="text-xs text-gray-500">GST {formatMoney(invoice.gstAmount)}</p><div className="mt-3 flex flex-wrap gap-2 sm:justify-end"><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100" href={`/api/operations/client-invoices/${invoice.id}/pdf`}><Download className="size-4" /> Invoice PDF</a><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-blue-950 hover:bg-gray-50" href={`/api/operations/client-invoices/${invoice.id}/production-summary`}><Download className="size-4" /> Production summary PDF</a></div></div></div></article>; })}</div>{data.clientInvoices.length === 0 ? <EmptyState text="No client invoices have been created yet." /> : null}</section>
  </div>;
}

function ClientsAndAccessPanel({ data, isPending, runAction }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void }) {
  const [name, setName] = useState(""); const [abn, setAbn] = useState(""); const [email, setEmail] = useState(""); const [terms, setTerms] = useState("14"); const [inviteEmail, setInviteEmail] = useState("");
  function createClient() { runAction(async () => { const result = await createOperationsClientAction({ name, abn, billingEmail: email, paymentTermsDays: Number(terms) }); if (result.ok) { setName(""); setAbn(""); setEmail(""); setTerms("14"); } return result; }); }
  function inviteAdmin() { runAction(async () => { const result = await inviteOperationsAdminAction(inviteEmail); if (result.ok) setInviteEmail(""); return result; }); }
  return <div className="grid gap-4 lg:grid-cols-2"><section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><Building2 className="size-5" /></div><div><h2 className="dashboard-card-title">Create client</h2><p className="dashboard-muted">Client setup is restricted to Bulgaa and Zaya.</p></div></div><div className="grid gap-4"><Field label="Client name"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="ABN (optional)"><input value={abn} onChange={(event) => setAbn(event.target.value)} /></Field><Field label="Billing email"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></Field><Field label="Payment terms (days)"><input min="0" max="90" value={terms} onChange={(event) => setTerms(event.target.value)} type="number" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || name.trim().length < 2} onClick={createClient} type="button">Create client</button></div><div className="mt-5 grid gap-2">{data.clients.map((client) => <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold" key={client.id}>{client.name}</div>)}</div></section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><UserPlus className="size-5" /></div><div><h2 className="dashboard-card-title">Invite operations admin</h2><p className="dashboard-muted">This role can manage locations and records, but receives no finance access.</p></div></div><div className="grid gap-4"><Field label="Email address"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || !inviteEmail.includes("@")} onClick={inviteAdmin} type="button">{isPending ? "Sending…" : "Send restricted invite"}</button></div><div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="inline-flex items-center gap-2 font-black text-emerald-900"><ShieldCheck className="size-5" /> Access boundary</p><ul className="mt-3 grid gap-2 text-sm text-emerald-950"><li>✓ May add locations under existing clients</li><li>✓ May record and review contractor hours</li><li>× Cannot create clients</li><li>× Cannot view rates, GST, invoices or payments</li></ul></div></section></div>;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) { return <article className="dashboard-card flex items-center gap-4"><div className="dashboard-icon"><Icon className="size-5" /></div><div><p className="dashboard-stat-label">{label}</p><p className="dashboard-stat-value">{value}</p></div></article>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="dashboard-label">{label}{children}</label>; }
function EmptyState({ text }: { text: string }) { return <div className="p-6 text-center text-sm text-gray-500">{text}</div>; }
function ActionNotice({ result }: { result: OperationsActionResult }) { return <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm font-bold", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900")}>{result.ok ? <CheckCircle2 className="size-5 shrink-0" /> : <ShieldCheck className="size-5 shrink-0" />}<span>{result.message ?? result.error}</span></div>; }
function SummaryValue({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div><dt className="text-xs text-blue-200">{label}</dt><dd className={cn("mt-1 font-bold", strong && "text-xl text-orange-300")}>{value}</dd></div>; }
function formatMoney(value: number) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value); }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
