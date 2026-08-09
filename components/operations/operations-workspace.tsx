"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
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
  RotateCcw,
  Save,
  ShieldCheck,
  UserPlus,
  Users
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import {
  createOperationsClientAction,
  createOperationsContractorAction,
  createOperationsLocationAction,
  generateOperationsClientInvoiceAction,
  inviteOperationsAdminAction,
  saveOperationsDailyRecordsAction,
  setOperationsContractorActiveAction,
  setOperationsLocationStatusAction,
  type OperationsActionResult
} from "@/app/actions/operations";
import { addIsoDays, getInclusiveIsoDayCount } from "@/lib/operations/dates";
import { calculateClientRateGroups } from "@/lib/operations/invoice-calculations";
import {
  isOperationsContractorActive,
  isOperationsProjectActive
} from "@/lib/operations/lifecycle";
import { type OperationsWorkspaceData } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

type OperationsTab =
  | "daily"
  | "history"
  | "contractors"
  | "locations"
  | "finance"
  | "access";

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
  const activeContractors = useMemo(
    () => initialData.contractors.filter(isOperationsContractorActive),
    [initialData.contractors]
  );
  const activeProjects = useMemo(
    () => initialData.projects.filter(isOperationsProjectActive),
    [initialData.projects]
  );
  const firstClientId = initialData.clients[0]?.id ?? "";
  const firstProjectId =
    activeProjects.find((project) => project.clientId === firstClientId)?.id ?? "";
  const [dailyDate, setDailyDate] = useState(today);
  const [dailyClientId, setDailyClientId] = useState(firstClientId);
  const [dailyProjectId, setDailyProjectId] = useState(firstProjectId);
  const [hoursByContractor, setHoursByContractor] = useState<Record<string, string>>({});

  const dailyProjects = useMemo(
    () => activeProjects.filter((project) => project.clientId === dailyClientId),
    [activeProjects, dailyClientId]
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
      activeContractors.map((contractor) => [
        contractor.id,
        selectedEntryByWorker.get(contractor.id)?.hours.toString() ?? ""
      ])
    );
    setHoursByContractor(nextValues);
  }, [activeContractors, selectedEntryByWorker]);

  useEffect(() => {
    if (dailyProjectId && activeProjects.some((project) => project.id === dailyProjectId)) {
      return;
    }
    setDailyProjectId(
      activeProjects.find((project) => project.clientId === dailyClientId)?.id ?? ""
    );
  }, [activeProjects, dailyClientId, dailyProjectId]);

  function changeDailyClient(clientId: string) {
    setDailyClientId(clientId);
    setDailyProjectId(
      activeProjects.find((project) => project.clientId === clientId)?.id ?? ""
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
        records: activeContractors.map((contractor) => ({
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
          { id: "contractors" as const, label: "Contractors", icon: Users },
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
          <StatCard icon={Users} label="Active contractors" value={activeContractors.length} />
          <StatCard icon={MapPin} label="Active locations" value={activeProjects.length} />
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
            contractors={activeContractors}
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
        {tab === "contractors" && initialData.isFinanceAdmin ? (
          <ContractorsPanel data={initialData} isPending={isPending} runAction={runAction} />
        ) : null}
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

function ContractorsPanel({
  data,
  isPending,
  runAction
}: {
  data: OperationsWorkspaceData;
  isPending: boolean;
  runAction: (action: () => Promise<OperationsActionResult>) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("Steelfixer");
  const activeContractors = data.contractors.filter(isOperationsContractorActive);
  const archivedContractors = data.contractors.filter(
    (contractor) => !isOperationsContractorActive(contractor)
  );

  function createContractor() {
    runAction(async () => {
      const result = await createOperationsContractorAction({ fullName, email, phone, trade });
      if (result.ok) {
        setFullName("");
        setEmail("");
        setPhone("");
        setTrade("Steelfixer");
      }
      return result;
    });
  }

  function setContractorActive(contractorId: string, isActive: boolean) {
    runAction(() => setOperationsContractorActiveAction({ contractorId, isActive }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div className="dashboard-icon"><UserPlus className="size-5" /></div>
          <div>
            <h2 className="dashboard-card-title">Add contractor</h2>
            <p className="dashboard-muted">
              Internal production record only. The contractor invoice app remains separate.
            </p>
          </div>
        </div>
        <div className="grid gap-4">
          <Field label="Full name">
            <input
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Contractor name"
              value={fullName}
            />
          </Field>
          <Field label="Trade">
            <input onChange={(event) => setTrade(event.target.value)} value={trade} />
          </Field>
          <Field label="Phone (optional)">
            <input onChange={(event) => setPhone(event.target.value)} value={phone} />
          </Field>
          <Field label="Email (optional)">
            <input onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
          </Field>
          <button
            className="dashboard-button dashboard-button-primary"
            disabled={isPending || fullName.trim().length < 2 || trade.trim().length < 2}
            onClick={createContractor}
            type="button"
          >
            {isPending ? "Adding…" : "Add contractor"}
          </button>
        </div>
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-black">One-day contractor</p>
          <p className="mt-1 leading-6">
            Add the person here, record only their worked date and hours, then archive them after
            saving the record. Their name remains available for history and client invoicing.
          </p>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div className="dashboard-icon"><Users className="size-5" /></div>
          <div>
            <h2 className="dashboard-card-title">Contractors</h2>
            <p className="dashboard-muted">
              Only active contractors appear on the daily entry screen.
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          {activeContractors.map((contractor) => (
            <ContractorCard
              actionLabel="Archive"
              contractor={contractor}
              disabled={isPending}
              icon={Archive}
              key={contractor.id}
              onAction={() => setContractorActive(contractor.id, false)}
            />
          ))}
          {activeContractors.length === 0 ? (
            <EmptyState text="No active contractors are available." />
          ) : null}
        </div>

        {archivedContractors.length > 0 ? (
          <div className="mt-6 border-t border-gray-200 pt-5">
            <h3 className="font-black text-blue-950">Archived contractors</h3>
            <p className="mt-1 text-sm text-gray-500">
              Kept for production and invoice history. Reactivate when they return.
            </p>
            <div className="mt-3 grid gap-3">
              {archivedContractors.map((contractor) => (
                <ContractorCard
                  actionLabel="Reactivate"
                  contractor={contractor}
                  disabled={isPending || !contractor.accountEnabled}
                  icon={RotateCcw}
                  key={contractor.id}
                  onAction={() => setContractorActive(contractor.id, true)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ContractorCard({
  actionLabel,
  contractor,
  disabled,
  icon: Icon,
  onAction
}: {
  actionLabel: string;
  contractor: OperationsWorkspaceData["contractors"][number];
  disabled: boolean;
  icon: typeof Archive;
  onAction: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-black text-blue-950">{contractor.fullName}</p>
        <p className="mt-1 text-sm text-gray-600">
          {contractor.trade ?? "Steelfixer"}
          {contractor.phone ? ` · ${contractor.phone}` : ""}
        </p>
        {!contractor.accountEnabled ? (
          <p className="mt-1 text-xs font-bold text-red-700">Account access is disabled.</p>
        ) : null}
      </div>
      <button
        className="dashboard-button dashboard-button-outline inline-flex items-center justify-center gap-2"
        disabled={disabled}
        onClick={onAction}
        type="button"
      >
        <Icon className="size-4" /> {actionLabel}
      </button>
    </article>
  );
}

function LocationsPanel({ data, isPending, runAction }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const activeProjects = data.projects.filter(isOperationsProjectActive);
  const completedProjects = data.projects.filter((project) => !isOperationsProjectActive(project));
  function submit() {
    runAction(async () => {
      const result = await createOperationsLocationAction({ clientId, name, address });
      if (result.ok) { setName(""); setAddress(""); }
      return result;
    });
  }
  function setLocationStatus(locationId: string, status: "active" | "completed") {
    runAction(() => setOperationsLocationStatusAction({ locationId, status }));
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
    <section className="dashboard-card">
      <div className="dashboard-card-header"><div className="dashboard-icon"><Plus className="size-5" /></div><div><h2 className="dashboard-card-title">Add a location</h2><p className="dashboard-muted">All operations users can add a new work location under an existing client.</p></div></div>
      <div className="grid gap-4"><Field label="Client"><select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Select client</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Location / project name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Tonkin Highway package" /></Field><Field label="Site address"><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street, suburb, WA" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || !clientId || !name.trim() || !address.trim()} onClick={submit} type="button">{isPending ? "Adding…" : "Add location"}</button></div>
    </section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><MapPin className="size-5" /></div><div><h2 className="dashboard-card-title">Current locations</h2><p className="dashboard-muted">Only active locations are available for new daily records.</p></div></div><div className="grid gap-3 sm:grid-cols-2">{activeProjects.map((project) => { const client = data.clients.find((item) => item.id === project.clientId); return <article className="rounded-xl border border-gray-200 bg-gray-50 p-4" key={project.id}><p className="font-black text-blue-950">{project.name}</p><p className="mt-1 text-sm font-bold text-orange-600">{client?.name}</p><p className="mt-2 text-sm text-gray-600">{project.location}</p><button className="dashboard-button dashboard-button-outline mt-4 inline-flex items-center justify-center gap-2" disabled={isPending} onClick={() => setLocationStatus(project.id, "completed")} type="button"><Archive className="size-4" /> Mark completed</button></article>; })}</div>{activeProjects.length === 0 ? <EmptyState text="No active locations are available." /> : null}{completedProjects.length > 0 ? <div className="mt-6 border-t border-gray-200 pt-5"><h3 className="font-black text-blue-950">Completed locations</h3><p className="mt-1 text-sm text-gray-500">History remains available. Reactivate a location if work resumes.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{completedProjects.map((project) => { const client = data.clients.find((item) => item.id === project.clientId); return <article className="rounded-xl border border-gray-200 bg-gray-50 p-4" key={project.id}><p className="font-black text-blue-950">{project.name}</p><p className="mt-1 text-sm font-bold text-gray-600">{client?.name}</p><p className="mt-2 text-sm text-gray-600">{project.location}</p><button className="dashboard-button dashboard-button-outline mt-4 inline-flex items-center justify-center gap-2" disabled={isPending} onClick={() => setLocationStatus(project.id, "active")} type="button"><RotateCcw className="size-4" /> Reactivate</button></article>; })}</div></div> : null}</section>
  </div>;
}

function ClientInvoicesPanel({ data, isPending, runAction, today }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void; today: string }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [periodStart, setPeriodStart] = useState(addIsoDays(today, -13));
  const [periodEnd, setPeriodEnd] = useState(today);
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
  const [gstApplied, setGstApplied] = useState(true);
  const periodDays = getInclusiveIsoDayCount(periodStart, periodEnd);
  const projects = data.projects.filter((project) => project.clientId === clientId);
  const entries = data.workEntries.filter((entry) => projectIds.includes(entry.jobId) && entry.workDate >= periodStart && entry.workDate <= periodEnd && !entry.locked && !entry.approved);
  const involvedWorkerIds = [...new Set(entries.map((entry) => entry.workerId))];
  const workerRates = involvedWorkerIds.map((workerId) => ({
    workerId,
    ratePerTonne: Number(getRateValue(workerId)) || 0
  }));
  const missingRateCount = workerRates.filter((rate) => rate.ratePerTonne <= 0).length;
  const rateGroups = calculateClientRateGroups(entries, workerRates);
  const tonnes = rateGroups.reduce((sum, group) => sum + group.tonnes, 0);
  const subtotal = rateGroups.reduce((sum, group) => sum + group.subtotal, 0);
  const gst = gstApplied ? subtotal * 0.1 : 0;

  function getRateValue(workerId: string) {
    if (Object.prototype.hasOwnProperty.call(rateOverrides, workerId)) {
      return rateOverrides[workerId];
    }
    const savedRate = data.clientWorkerRates.find(
      (rate) => rate.clientId === clientId && rate.workerId === workerId
    );
    return savedRate?.ratePerTonne ? savedRate.ratePerTonne.toString() : "";
  }

  function changeClient(nextClientId: string) {
    setClientId(nextClientId);
    setProjectIds([]);
    setRateOverrides({});
  }
  function toggleProject(projectId: string) { setProjectIds((current) => current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]); }
  function submit() {
    runAction(() =>
      generateOperationsClientInvoiceAction({
        clientId,
        projectIds,
        periodStart,
        periodEnd,
        workerRates,
        gstApplied
      })
    );
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <section className="dashboard-card">
      <div className="dashboard-card-header"><div className="dashboard-icon"><FileText className="size-5" /></div><div><h2 className="dashboard-card-title">Create client invoice</h2><p className="dashboard-muted">The default period is 14 days. Choose any start and end dates, including a single day.</p></div></div>
      <div className="grid gap-4"><Field label="Client"><select value={clientId} onChange={(event) => changeClient(event.target.value)}><option value="">Select client</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Period start"><input value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} type="date" /></Field><Field label="Period end"><input value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} type="date" /></Field></div><div className={cn("rounded-lg px-3 py-3 text-sm font-bold", periodDays > 0 ? "bg-gray-100 text-blue-950" : "bg-red-50 text-red-800")}>{periodDays > 0 ? `${periodDays} day${periodDays === 1 ? "" : "s"} selected` : "End date must be on or after start date"}</div>
        <fieldset><legend className="mb-2 text-sm font-bold text-gray-800">Locations included</legend><div className="grid gap-2">{projects.map((project) => <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold" key={project.id}><input checked={projectIds.includes(project.id)} onChange={() => toggleProject(project.id)} type="checkbox" /> <span>{project.name}<span className="block text-xs font-normal text-gray-500">{project.location}</span></span></label>)}</div>{projects.length === 0 ? <p className="text-sm text-gray-500">No locations for this client.</p> : null}</fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-gray-800">Client billing rate by contractor</legend>
          <div className="grid gap-2">
            {involvedWorkerIds.map((workerId) => {
              const contractor = data.contractors.find((item) => item.id === workerId);
              return <label className="grid min-h-12 grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold" key={workerId}><span>{contractor?.fullName ?? "Contractor"}</span><span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span><input className="pl-7" inputMode="decimal" min="0" onChange={(event) => setRateOverrides((current) => ({ ...current, [workerId]: event.target.value }))} placeholder="0.00" step="0.01" type="number" value={getRateValue(workerId)} /></span></label>;
            })}
          </div>
          {involvedWorkerIds.length === 0 ? <p className="text-sm text-gray-500">Select locations and a period to load contractor rates.</p> : <p className="mt-2 text-xs text-gray-500">Rates are saved for this client and automatically reused on the next invoice.</p>}
          {missingRateCount > 0 ? <p className="mt-2 text-sm font-bold text-red-700">Enter a billing rate for every contractor.</p> : null}
        </fieldset>
        <label className="flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold"><input checked={gstApplied} onChange={(event) => setGstApplied(event.target.checked)} type="checkbox" /> Add GST (10%)</label>
      </div>
      <div className="mt-5 rounded-xl bg-blue-950 p-4 text-white"><p className="text-xs font-black uppercase tracking-wide text-blue-200">Invoice preview</p><div className="mt-3 grid gap-2">{rateGroups.map((group) => <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-sm" key={group.ratePerTonne}><span>{group.workerCount} contractor{group.workerCount === 1 ? "" : "s"} · {group.tonnes.toFixed(3)}t @ {formatMoney(group.ratePerTonne)}</span><strong>{formatMoney(group.subtotal)}</strong></div>)}</div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><SummaryValue label="Records" value={entries.length.toString()} /><SummaryValue label="Contractors" value={involvedWorkerIds.length.toString()} /><SummaryValue label="Rate groups" value={rateGroups.length.toString()} /><SummaryValue label="Tonnes" value={tonnes.toFixed(3)} /><SummaryValue label="Subtotal" value={formatMoney(subtotal)} /><SummaryValue label="GST" value={formatMoney(gst)} /><SummaryValue label="Total" value={formatMoney(subtotal + gst)} strong /></dl></div>
      <button className="dashboard-button dashboard-button-orange mt-4 w-full" disabled={isPending || !clientId || projectIds.length === 0 || periodDays < 1 || entries.length === 0 || missingRateCount > 0} onClick={submit} type="button">{isPending ? "Creating…" : "Create and lock invoice"}</button>
    </section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><DollarSign className="size-5" /></div><div><h2 className="dashboard-card-title">Client invoices</h2><p className="dashboard-muted">Private finance view for Bulgaa and Zaya. Each invoice has two separate PDF files.</p></div></div><div className="grid gap-3">{data.clientInvoices.map((invoice) => { const client = data.clients.find((item) => item.id === invoice.clientId); return <article className="rounded-xl border border-gray-200 p-4" key={invoice.id}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black text-blue-950">{invoice.invoiceNumber}</p><p className="mt-1 text-sm text-gray-600">{client?.name} · {formatDate(invoice.periodStart)}–{formatDate(invoice.periodEnd)}</p><span className="mt-2 inline-block rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">{invoice.status}</span></div><div className="sm:text-right"><p className="text-xl font-black text-blue-950">{formatMoney(invoice.totalAmount)}</p><p className="text-xs text-gray-500">GST {formatMoney(invoice.gstAmount)}</p><div className="mt-3 flex flex-wrap gap-2 sm:justify-end"><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100" href={`/api/operations/client-invoices/${invoice.id}/pdf`}><Download className="size-4" /> Invoice PDF</a><a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-bold text-blue-950 hover:bg-gray-50" href={`/api/operations/client-invoices/${invoice.id}/production-summary`}><Download className="size-4" /> Production summary PDF</a></div></div></div></article>; })}</div>{data.clientInvoices.length === 0 ? <EmptyState text="No client invoices have been created yet." /> : null}</section>
  </div>;
}

function ClientsAndAccessPanel({ data, isPending, runAction }: { data: OperationsWorkspaceData; isPending: boolean; runAction: (action: () => Promise<OperationsActionResult>) => void }) {
  const [name, setName] = useState(""); const [abn, setAbn] = useState(""); const [email, setEmail] = useState(""); const [terms, setTerms] = useState("14"); const [inviteEmail, setInviteEmail] = useState("");
  function createClient() { runAction(async () => { const result = await createOperationsClientAction({ name, abn, billingEmail: email, paymentTermsDays: Number(terms) }); if (result.ok) { setName(""); setAbn(""); setEmail(""); setTerms("14"); } return result; }); }
  function inviteAdmin() { runAction(async () => { const result = await inviteOperationsAdminAction(inviteEmail); if (result.ok) setInviteEmail(""); return result; }); }
  return <div className="grid gap-4 lg:grid-cols-2"><section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><Building2 className="size-5" /></div><div><h2 className="dashboard-card-title">Create client</h2><p className="dashboard-muted">Client setup is restricted to Bulgaa and Zaya.</p></div></div><div className="grid gap-4"><Field label="Client name"><input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="ABN (optional)"><input value={abn} onChange={(event) => setAbn(event.target.value)} /></Field><Field label="Billing email"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></Field><Field label="Payment terms (days)"><input min="0" max="90" value={terms} onChange={(event) => setTerms(event.target.value)} type="number" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || name.trim().length < 2} onClick={createClient} type="button">Create client</button></div><div className="mt-5 grid gap-2">{data.clients.map((client) => <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold" key={client.id}>{client.name}</div>)}</div></section>
    <section className="dashboard-card"><div className="dashboard-card-header"><div className="dashboard-icon"><UserPlus className="size-5" /></div><div><h2 className="dashboard-card-title">Invite operations admin</h2><p className="dashboard-muted">This role can manage locations and records, but receives no finance access.</p></div></div><div className="grid gap-4"><Field label="Email address"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" /></Field><button className="dashboard-button dashboard-button-primary" disabled={isPending || !inviteEmail.includes("@")} onClick={inviteAdmin} type="button">{isPending ? "Sending…" : "Send restricted invite"}</button></div><div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="inline-flex items-center gap-2 font-black text-emerald-900"><ShieldCheck className="size-5" /> Access boundary</p><ul className="mt-3 grid gap-2 text-sm text-emerald-950"><li>✓ May add and complete locations under existing clients</li><li>✓ May record and review contractor hours</li><li>× Cannot create clients or contractors</li><li>× Cannot view rates, GST, invoices or payments</li></ul></div></section></div>;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) { return <article className="dashboard-card flex items-center gap-4"><div className="dashboard-icon"><Icon className="size-5" /></div><div><p className="dashboard-stat-label">{label}</p><p className="dashboard-stat-value">{value}</p></div></article>; }
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="dashboard-label">{label}{children}</label>; }
function EmptyState({ text }: { text: string }) { return <div className="p-6 text-center text-sm text-gray-500">{text}</div>; }
function ActionNotice({ result }: { result: OperationsActionResult }) { return <div className={cn("flex items-start gap-2 rounded-xl border p-4 text-sm font-bold", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900")}>{result.ok ? <CheckCircle2 className="size-5 shrink-0" /> : <ShieldCheck className="size-5 shrink-0" />}<span>{result.message ?? result.error}</span></div>; }
function SummaryValue({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div><dt className="text-xs text-blue-200">{label}</dt><dd className={cn("mt-1 font-bold", strong && "text-xl text-orange-300")}>{value}</dd></div>; }
function formatMoney(value: number) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value); }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; }
