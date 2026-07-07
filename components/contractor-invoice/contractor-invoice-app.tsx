"use client";

import { BookOpen, FileText, History, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContactPanel } from "@/components/contractor-invoice/contact-panel";
import { InvoiceForm } from "@/components/contractor-invoice/invoice-form";
import { InvoiceHistory } from "@/components/contractor-invoice/invoice-history";
import { NotificationPanel } from "@/components/contractor-invoice/notification-panel";
import { ProfileForm } from "@/components/contractor-invoice/profile-form";
import {
  addDaysIso,
  calculateInvoice,
  createInitialDraft,
  getInvoiceRecipientEmail,
  validateForPdf
} from "@/lib/contractor-invoice/calculations";
import {
  addHistoryRecord,
  clearHistory,
  loadCustomBillTo,
  loadDraft,
  loadHistory,
  loadProfile,
  peekNextInvoiceNumber,
  reserveNextInvoiceNumber,
  saveCustomBillTo,
  saveDraft,
  saveProfile
} from "@/lib/contractor-invoice/local-storage";
import type {
  BillToDetails,
  ContractorProfile,
  GeneratedInvoiceRecord,
  InvoiceDraft
} from "@/lib/contractor-invoice/types";

type Tab = "invoice" | "profile" | "history" | "contact";
type PdfAction = "download" | "share";
type ActionStatus = {
  message: string;
  tone: "success" | "error" | "info" | "warning";
};

export function ContractorInvoiceApp() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("invoice");
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [customBillTo, setCustomBillTo] = useState<BillToDetails>(emptyCustomBillTo);
  const [history, setHistory] = useState<GeneratedInvoiceRecord[]>([]);
  const [savedStatus, setSavedStatus] = useState("Saved locally");
  const [errors, setErrors] = useState<string[]>([]);
  const [pdfAction, setPdfAction] = useState<PdfAction | null>(null);
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [showSecureContextWarning, setShowSecureContextWarning] = useState(false);
  const [isSecureBrowserContext, setIsSecureBrowserContext] = useState(true);
  const processingRef = useRef(false);
  const actionStatusTimerRef = useRef<number | null>(null);
  const actionStatusTokenRef = useRef(0);

  useEffect(() => {
    const secureContext = window.isSecureContext;
    const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
    setIsSecureBrowserContext(secureContext);
    setShowSecureContextWarning(!secureContext && !localHostnames.has(window.location.hostname));

    const loadedProfile = loadProfile();
    const loadedCustomBillTo = loadCustomBillTo();
    const initialDraft = createInitialDraft(loadedProfile.defaultRatePerTonne);
    initialDraft.invoiceNumber = peekNextInvoiceNumber();
    const restoredDraft = loadDraft(initialDraft);
    if (!restoredDraft.invoiceNumber.trim()) {
      restoredDraft.invoiceNumber = peekNextInvoiceNumber();
    }
    setProfile(loadedProfile);
    setCustomBillTo(loadedCustomBillTo);
    setDraft(restoredDraft);
    setHistory(loadHistory());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (actionStatusTimerRef.current !== null) {
        window.clearTimeout(actionStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!profile || !ready) return;
    saveProfile(profile);
    setSavedStatus("Saved locally");
    const timeout = window.setTimeout(() => setSavedStatus("Autosaved"), 800);
    return () => window.clearTimeout(timeout);
  }, [profile, ready]);

  useEffect(() => {
    if (!draft || !ready || draft.billTo.option !== "other") return;
    setCustomBillTo(draft.billTo);
    saveCustomBillTo(draft.billTo);
  }, [draft, ready]);

  useEffect(() => {
    if (!draft || !ready) return;
    saveDraft(draft);
  }, [draft, ready]);

  useEffect(() => {
    if (!profile || !draft || !ready) return;
    if (draft.ratePerTonne.trim() || !profile.defaultRatePerTonne.trim()) return;
    setDraft({ ...draft, ratePerTonne: profile.defaultRatePerTonne });
  }, [draft, profile, ready]);

  const calculation = useMemo(() => {
    if (!profile || !draft) return null;
    return calculateInvoice(draft, profile.gstRegistered);
  }, [draft, profile]);

  function changeDraft(nextDraft: InvoiceDraft) {
    if (draft && nextDraft.issueDate !== draft.issueDate) {
      nextDraft = { ...nextDraft, dueDate: addDaysIso(nextDraft.issueDate, 14) };
    }
    setDraft(nextDraft);
  }

  function updateActionStatus(status: ActionStatus | null) {
    actionStatusTokenRef.current += 1;
    const token = actionStatusTokenRef.current;

    if (actionStatusTimerRef.current !== null) {
      window.clearTimeout(actionStatusTimerRef.current);
      actionStatusTimerRef.current = null;
    }

    setActionStatus(status);

    if (status?.tone === "success" || status?.tone === "info") {
      actionStatusTimerRef.current = window.setTimeout(() => {
        if (actionStatusTokenRef.current === token) {
          setActionStatus(null);
          actionStatusTimerRef.current = null;
        }
      }, 3000);
    }
  }

  async function generatePdfBlob(recordOverride?: GeneratedInvoiceRecord) {
    const sourceProfile = recordOverride?.profile ?? profile;
    const sourceDraft = recordOverride?.draft ?? draft;
    const sourceCalculation = recordOverride?.calculation ?? calculation;
    if (!sourceProfile || !sourceDraft || !sourceCalculation) return null;

    const validation = validateForPdf(sourceProfile, sourceDraft, sourceCalculation);
    setErrors(validation.errors);
    if (!validation.ok) return null;

    const response = await fetch("/api/contractor-invoice/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: sourceProfile, draft: sourceDraft })
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { errors?: string[]; error?: string } | null;
      setErrors(result?.errors ?? [result?.error ?? "PDF could not be generated."]);
      return null;
    }

    const blob = await response.blob();
    return blob;
  }

  async function downloadPdf(recordOverride?: GeneratedInvoiceRecord) {
    if (processingRef.current) return;
    const sourceDraft = recordOverride?.draft ?? draft;
    if (!sourceDraft) return;
    processingRef.current = true;
    setPdfAction("download");
    updateActionStatus(null);
    try {
      const blob = await generatePdfBlob(recordOverride);
      if (!blob) {
        updateActionStatus({
          message: isSecureBrowserContext
            ? "PDF download failed. Please try again."
            : "PDF download failed. Try the live secure site or download from desktop.",
          tone: "error"
        });
        return;
      }
      const downloaded = downloadBlob(blob, `invoice-${sourceDraft.invoiceNumber}.pdf`);
      if (!downloaded) {
        updateActionStatus({
          message: isSecureBrowserContext
            ? "PDF download failed. Please try again."
            : "PDF download failed. Try the live secure site or download from desktop.",
          tone: "error"
        });
        return;
      }
      if (!recordOverride) recordCurrentInvoice();
      updateActionStatus({ message: "PDF downloaded.", tone: "success" });
    } catch {
      updateActionStatus({
        message: isSecureBrowserContext
          ? "PDF download failed. Please try again."
          : "PDF download failed. Try the live secure site or download from desktop.",
        tone: "error"
      });
    } finally {
      setPdfAction(null);
      processingRef.current = false;
    }
  }

  async function sharePdf() {
    if (processingRef.current) return;
    if (!profile || !draft || !calculation) return;
    processingRef.current = true;
    setPdfAction("share");
    updateActionStatus(null);
    try {
      if (!isSecureBrowserContext) {
        updateActionStatus({
          message: "Sharing needs HTTPS on this phone. Please download the PDF and attach it manually, or use the live secure site.",
          tone: "warning"
        });
        return;
      }

      const blob = await generatePdfBlob();
      if (!blob) {
        updateActionStatus({
          message: "Could not share PDF. Please download the PDF and attach it manually.",
          tone: "error"
        });
        return;
      }

      const file = new File([blob], `invoice-${draft.invoiceNumber}.pdf`, {
        type: "application/pdf"
      });
      const shareData = {
        title: `Invoice ${draft.invoiceNumber}`,
        text: getInvoiceRecipientEmail(draft)
          ? `Invoice ${draft.invoiceNumber} for ${profile.fullName} to ${getInvoiceRecipientEmail(draft)}`
          : `Invoice ${draft.invoiceNumber} for ${profile.fullName}`,
        files: [file]
      };

      if (!navigator.share || (navigator.canShare && !navigator.canShare(shareData))) {
        updateActionStatus({
          message: "Sharing is not supported on this browser. Please download the PDF and attach it manually.",
          tone: "warning"
        });
        return;
      }

      await navigator.share(shareData);
      recordCurrentInvoice();
      updateActionStatus({ message: "Share opened.", tone: "success" });
    } catch {
      updateActionStatus({
        message: "Could not share PDF. Please download the PDF and attach it manually.",
        tone: "error"
      });
    } finally {
      setPdfAction(null);
      processingRef.current = false;
    }
  }

  function recordCurrentInvoice() {
    if (!profile || !draft || !calculation) return;

    const record: GeneratedInvoiceRecord = {
      id: crypto.randomUUID(),
      invoiceNumber: draft.invoiceNumber,
      generatedAt: new Date().toISOString(),
      profile,
      draft,
      calculation
    };
    addHistoryRecord(record);
    setHistory(loadHistory());
    if (draft.invoiceNumber === peekNextInvoiceNumber()) {
      reserveNextInvoiceNumber();
    }
    setErrors([]);
  }

  function startNewInvoice() {
    if (!profile || !draft) return;

    if (hasMeaningfulDraftValues(draft, profile.defaultRatePerTonne)) {
      const confirmed = window.confirm("Clear this invoice draft and start a new invoice?");
      if (!confirmed) return;
    }

    const freshDraft = createInitialDraft(profile.defaultRatePerTonne);
    freshDraft.invoiceNumber = peekNextInvoiceNumber();
    setDraft(freshDraft);
    setErrors([]);
    updateActionStatus({
      message: "New invoice draft ready.",
      tone: "success"
    });
  }

  function clearLocalHistory() {
    if (!window.confirm("Clear local invoice history on this device?")) return;
    clearHistory();
    setHistory([]);
  }

  if (!ready || !profile || !draft || !calculation) {
    return (
      <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-950">
        <p className="text-sm font-bold">Loading Still Partners Invoice...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-100 pb-24 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950 px-4 py-4 text-white shadow-sm">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-xs font-black uppercase text-slate-300">Still Partners Invoice</p>
          <h1 className="mt-1 text-2xl font-black">Contractor invoice</h1>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-4">
        <NotificationPanel />

        {tab === "invoice" ? (
          <InvoiceForm
            profile={profile}
            draft={draft}
            calculation={calculation}
            customBillTo={customBillTo}
            errors={errors}
            pdfAction={pdfAction}
            actionStatus={actionStatus}
            showSecureContextWarning={showSecureContextWarning}
            onDraftChange={changeDraft}
            onDownloadPdf={() => {
              void downloadPdf();
            }}
            onSharePdf={() => {
              void sharePdf();
            }}
            onStartNewInvoice={startNewInvoice}
          />
        ) : null}

        {tab === "profile" ? (
          <ProfileForm profile={profile} onChange={setProfile} savedStatus={savedStatus} />
        ) : null}

        {tab === "history" ? (
          <InvoiceHistory
            records={history}
            onDownload={(record) => {
              void downloadPdf(record);
            }}
            onClear={clearLocalHistory}
          />
        ) : null}

        {tab === "contact" ? <ContactPanel /> : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
          <TabButton active={tab === "invoice"} label="Invoice" icon={<FileText />} onClick={() => setTab("invoice")} />
          <TabButton active={tab === "profile"} label="Profile" icon={<UserRound />} onClick={() => setTab("profile")} />
          <TabButton active={tab === "history"} label="History" icon={<History />} onClick={() => setTab("history")} />
          <TabButton active={tab === "contact"} label="Contact" icon={<BookOpen />} onClick={() => setTab("contact")} />
        </div>
      </nav>
    </main>
  );
}

const emptyCustomBillTo: BillToDetails = {
  option: "other",
  companyName: "",
  abn: "",
  email: "",
  address: ""
};

function TabButton({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean;
  label: string;
  icon: React.ReactElement<{ className?: string; "aria-hidden"?: boolean }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-black ${
        active ? "bg-slate-950 text-white" : "text-slate-600"
      }`}
      onClick={onClick}
    >
      {icon && (
        <span className="[&>svg]:size-5" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  let url: string | null = null;

  try {
    url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => {
      if (url) URL.revokeObjectURL(url);
    }, 2000);
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
  }

  try {
    const fallbackUrl = URL.createObjectURL(blob);
    const opened = window.open(fallbackUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(fallbackUrl), 10000);
    return Boolean(opened);
  } catch {
    return false;
  }
}

function hasMeaningfulDraftValues(draft: InvoiceDraft, defaultRatePerTonne: string) {
  const freshDraft = createInitialDraft(defaultRatePerTonne);
  const hasHours = Object.values(draft.dailyHours).some((hours) => Number(hours) > 0);
  const hasProject = draft.projectSite.trim().length > 0;
  const hasCustomBillTo =
    draft.billTo.option === "other" ||
    draft.billTo.companyName !== "Still Partners Pty Ltd" ||
    draft.billTo.abn !== "62 687 072 420" ||
    draft.billTo.email !== "work@stillpartners.net" ||
    draft.billTo.address.trim().length > 0;
  const hasEditedRate = draft.ratePerTonne.trim() !== defaultRatePerTonne.trim();
  const hasEditedDates =
    draft.weekMonday !== freshDraft.weekMonday ||
    draft.issueDate !== freshDraft.issueDate ||
    draft.dueDate !== freshDraft.dueDate;

  return hasHours || hasProject || hasCustomBillTo || hasEditedRate || hasEditedDates;
}
