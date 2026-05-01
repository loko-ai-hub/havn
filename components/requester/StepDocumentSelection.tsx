import { useState } from "react";
import {
  PORTAL_DOCUMENTS,
  formatCurrency,
  type RequesterType,
} from "@/lib/portal-data";
import { ArrowRight, Check, FileText, Loader2, Upload } from "lucide-react";

import { uploadThirdPartyForm } from "@/app/r/[slug]/actions";
import { usePortalOrg } from "@/components/requester/RequesterPortalOrgContext";

// Maps the requester-portal `docId` (e.g. "demand_letter", "resale_cert")
// to the canonical `master_type_key` used by document_request_fees and the
// rest of the platform. Mirrors DOC_TYPE_MAP in app/r/[slug]/actions.ts —
// keep them in sync.
const PORTAL_ID_TO_MASTER_TYPE: Record<string, string> = {
  resale_cert: "resale_certificate",
  resale_cert_update: "certificate_update",
  lender_questionnaire: "lender_questionnaire",
  custom_company_form: "lender_questionnaire",
  estoppel: "estoppel_letter",
  governing_docs: "governing_documents",
  demand_letter: "demand_letter",
};

export type CustomFormUpload = {
  path: string;
  filename: string;
  mimeType: string;
};

interface StepDocumentSelectionProps {
  requesterType: RequesterType;
  selected: string[];
  primaryColor: string;
  /** If provided, only show documents whose id is in this list */
  availableDocIds?: string[];
  /** Most recent 3P upload descriptor — null when nothing uploaded yet. */
  customFormUpload: CustomFormUpload | null;
  onToggle: (docId: string) => void;
  onCustomFormUploaded: (upload: CustomFormUpload | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

const RESALE_IDS = ["resale_cert", "resale_cert_update"];
const LENDER_DOC_IDS = ["lender_questionnaire", "custom_company_form"] as const;
const TITLE_DOC_IDS = ["demand_letter", "custom_company_form"] as const;

const StepDocumentSelection = ({ requesterType, selected, primaryColor, availableDocIds, customFormUpload, onToggle, onCustomFormUploaded, onContinue, onBack }: StepDocumentSelectionProps) => {
  const isHomeowner = requesterType === "homeowner";
  const isLender = requesterType === "lender_title";
  const isTitleCompany = requesterType === "title_company";
  const isFormUploadFlow = isLender || isTitleCompany;

  // Org-configured fees from document_request_fees, exposed via the portal
  // org context. Falls back to the static defaults in PORTAL_DOCUMENTS only
  // when the org hasn't set a price yet for that doc type.
  const portalOrg = usePortalOrg();
  const feesByMasterType = portalOrg?.feesByMasterType ?? {};
  const feeFor = (portalDocId: string, fallback: number): number => {
    const masterKey = PORTAL_ID_TO_MASTER_TYPE[portalDocId];
    if (!masterKey) return fallback;
    const cfg = feesByMasterType[masterKey];
    if (cfg && typeof cfg.base_fee === "number") return cfg.base_fee;
    return fallback;
  };
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(customFormUpload?.filename ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFilePick = async (file: File | null) => {
    setUploadError(null);
    if (!file) {
      setUploadedFileName(null);
      onCustomFormUploaded(null);
      return;
    }
    setUploadedFileName(file.name);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadThirdPartyForm(formData);
      if ("error" in result) {
        setUploadError(result.error);
        setUploadedFileName(null);
        onCustomFormUploaded(null);
        return;
      }
      onCustomFormUploaded(result.upload);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
      setUploadedFileName(null);
      onCustomFormUploaded(null);
    } finally {
      setUploading(false);
    }
  };

  const availableDocs = isLender
    ? [
        {
          id: "lender_questionnaire",
          name: "Havn Lender Questionnaire",
          description:
            "Use Havn's standard lender questionnaire form, accepted by most lenders and agencies.",
          fee: feeFor("lender_questionnaire", 150),
          required: false,
          availableTo: ["lender_title"] as RequesterType[],
        },
        {
          id: "custom_company_form",
          name: "Upload Your Own Form",
          description:
            "Use your company's specific questionnaire. Upload a PDF or DOCX file.",
          fee: feeFor("custom_company_form", 200),
          required: false,
          availableTo: ["lender_title"] as RequesterType[],
        },
      ]
    : isTitleCompany
      ? [
          {
            id: "demand_letter",
            name: "Demand / Payoff Letter",
            description:
              "Payoff statement covering current dues, transfer fees, and amounts owed at closing.",
            fee: feeFor("demand_letter", 100),
            required: false,
            availableTo: ["title_company"] as RequesterType[],
          },
          {
            id: "custom_company_form",
            name: "Upload Your Own Form",
            description:
              "Use your title company's specific payoff/status format. Upload a PDF or DOCX file.",
            fee: feeFor("custom_company_form", 200),
            required: false,
            availableTo: ["title_company"] as RequesterType[],
          },
        ]
      : PORTAL_DOCUMENTS.filter((d) => {
          if (!d.availableTo.includes(requesterType)) return false;
          if (!isHomeowner && d.id === "resale_cert_update") return false;
          if (availableDocIds && !availableDocIds.includes(d.id)) return false;
          return true;
        }).map((d) => ({
          ...d,
          fee: feeFor(d.id, d.fee),
        }));

  const handleToggle = (docId: string) => onToggle(docId);

  // Sum fees from `availableDocs` directly — they already incorporate the
  // org's configured prices via `feeFor()` so the running total matches what
  // the requester sees per row.
  const total = availableDocs.reduce(
    (sum, doc) => (selected.includes(doc.id) ? sum + doc.fee : sum),
    0
  );

  const headingTitle = isLender
    ? "Lender Questionnaire"
    : isTitleCompany
      ? "Payoff Letter"
      : "Select Documents";
  const headingSubtitle = isLender
    ? "Choose which questionnaire format you'd like us to complete for this transaction."
    : isTitleCompany
      ? "Choose which payoff format you'd like us to complete for this closing."
      : "Choose the documents you need for this transaction.";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{headingTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{headingSubtitle}</p>
      </div>

      <div className="space-y-2">
        {availableDocs.map((doc) => {
          const isSelected = selected.includes(doc.id);
          const isResale = isHomeowner && RESALE_IDS.includes(doc.id);
          const isLenderSingleSelect =
            (isLender && (LENDER_DOC_IDS as readonly string[]).includes(doc.id)) ||
            (isTitleCompany && (TITLE_DOC_IDS as readonly string[]).includes(doc.id));
          const isRequired = doc.required && !isResale;
          const isCustomCompanyForm = doc.id === "custom_company_form";
          return (
            <div key={doc.id} className="space-y-3">
              <button
                onClick={() => !isRequired && handleToggle(doc.id)}
                className={`w-full flex items-center gap-4 rounded-xl border-2 border-border bg-white p-5 text-left transition-all ${
                  isRequired ? "cursor-default" : "cursor-pointer"
                } ${isSelected ? "" : "hover:border-muted-foreground/40"}`}
                style={isSelected ? ({ "--card-border": primaryColor, "--card-bg": `${primaryColor}08`, borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)" } as React.CSSProperties) : undefined}
              >
                {isResale || isLenderSingleSelect ? (
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected ? "" : "border-muted-foreground/30"
                    }`}
                    style={isSelected ? { borderColor: primaryColor } : undefined}
                  >
                    {isSelected && (
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                    )}
                  </div>
                ) : (
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      isSelected ? "" : "border-muted-foreground/30"
                    }`}
                    style={isSelected ? { borderColor: primaryColor, backgroundColor: primaryColor } : undefined}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{doc.name}</p>
                    {(isResale || isLenderSingleSelect) ? (
                      <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        Select one
                      </span>
                    ) : null}
                    {isLender && doc.id === "lender_questionnaire" ? (
                      <a
                        href="/sample-lender-questionnaire.pdf"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-havn-navy underline underline-offset-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Preview
                      </a>
                    ) : null}
                    {isRequired && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Required</span>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(doc.fee)}</p>
              </button>
              {isCustomCompanyForm && isSelected ? (
                <div className="rounded-lg border-2 border-dashed border-border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <p>Click to upload PDF or DOCX</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Additional fee applies for custom form processing: +$50 over
                    the Havn Lender Questionnaire.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="mt-2 block w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                    disabled={uploading}
                    onChange={(event) => {
                      const picked = event.target.files?.[0] ?? null;
                      void handleFilePick(picked);
                    }}
                  />
                  {uploading ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Uploading…
                    </p>
                  ) : uploadedFileName && customFormUpload ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Uploaded: {uploadedFileName}
                    </p>
                  ) : uploadedFileName ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selected: {uploadedFileName}
                    </p>
                  ) : null}
                  {uploadError ? <p className="mt-2 text-xs text-destructive">{uploadError}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {isHomeowner && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">What&apos;s included in a Resale Certificate?</p>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 ml-6 list-disc">
            <li>Current account balance and assessment amounts</li>
            <li>Outstanding fees, fines, or special assessments on the unit</li>
            <li>Association financial health and reserve fund status</li>
            <li>Pending or anticipated special assessments</li>
            <li>Any violations or compliance issues on record</li>
            <li>Pending litigation involving the association</li>
            <li>Insurance coverage summary</li>
            <li>Move-in/move-out fees and procedures</li>
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">Document total</p>
        <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(total)}</p>
      </div>

      <div className="flex flex-row gap-3">
        <button onClick={onBack} className="h-12 flex-1 rounded-lg border border-border px-6 text-base font-medium text-foreground transition-colors hover:bg-secondary">
          Back
        </button>
        <button
          onClick={() => {
            if (isFormUploadFlow && selected.includes("custom_company_form")) {
              if (uploading) {
                setUploadError("Please wait for your file to finish uploading.");
                return;
              }
              if (!customFormUpload) {
                setUploadError(
                  isTitleCompany
                    ? "Please upload your payoff form to continue."
                    : "Please upload your questionnaire to continue."
                );
                return;
              }
            }
            setUploadError(null);
            onContinue();
          }}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg px-8 text-base font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
          disabled={uploading}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default StepDocumentSelection;
