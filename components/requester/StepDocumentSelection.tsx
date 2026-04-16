import { useState } from "react";
import {
  PORTAL_DOCUMENTS,
  formatCurrency,
  getDocumentFee,
  type RequesterType,
} from "@/lib/portal-data";
import { ArrowRight, Check, FileText, Upload } from "lucide-react";

interface StepDocumentSelectionProps {
  requesterType: RequesterType;
  selected: string[];
  primaryColor: string;
  /** If provided, only show documents whose id is in this list */
  availableDocIds?: string[];
  onToggle: (docId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

const RESALE_IDS = ["resale_cert", "resale_cert_update"];
const LENDER_DOC_IDS = ["lender_questionnaire", "custom_company_form"] as const;

const StepDocumentSelection = ({ requesterType, selected, primaryColor, availableDocIds, onToggle, onContinue, onBack }: StepDocumentSelectionProps) => {
  const isHomeowner = requesterType === "homeowner";
  const isLender = requesterType === "lender_title";
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const availableDocs = isLender
    ? [
        {
          id: "lender_questionnaire",
          name: "Havn Lender Questionnaire",
          description:
            "Use Havn's standard lender questionnaire form, accepted by most lenders and agencies.",
          fee: 150,
          required: false,
          availableTo: ["lender_title"] as RequesterType[],
        },
        {
          id: "custom_company_form",
          name: "Upload Your Own Form",
          description:
            "Use your company's specific questionnaire. Upload a PDF or DOCX file.",
          fee: 200,
          required: false,
          availableTo: ["lender_title"] as RequesterType[],
        },
      ]
    : PORTAL_DOCUMENTS.filter((d) => {
        if (!d.availableTo.includes(requesterType)) return false;
        if (!isHomeowner && d.id === "resale_cert_update") return false;
        if (availableDocIds && !availableDocIds.includes(d.id)) return false;
        return true;
      });

  const handleToggle = (docId: string) => onToggle(docId);

  const total = isLender
    ? availableDocs.reduce(
        (sum, doc) => (selected.includes(doc.id) ? sum + doc.fee : sum),
        0
      )
    : getDocumentFee(selected.filter((id) => id !== "custom_company_form"));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          {isLender ? "Lender Questionnaire" : "Select Documents"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isLender
            ? "Choose which questionnaire format you'd like us to complete for this transaction."
            : "Choose the documents you need for this transaction."}
        </p>
      </div>

      <div className="space-y-2">
        {availableDocs.map((doc) => {
          const isSelected = selected.includes(doc.id);
          const isResale = isHomeowner && RESALE_IDS.includes(doc.id);
          const isLenderSingleSelect = isLender && LENDER_DOC_IDS.includes(doc.id as (typeof LENDER_DOC_IDS)[number]);
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
                    onChange={(event) => {
                      setUploadedFileName(event.target.files?.[0]?.name ?? null);
                      if (uploadError) setUploadError(null);
                    }}
                  />
                  {uploadedFileName ? (
                    <p className="mt-2 text-xs text-muted-foreground">Selected: {uploadedFileName}</p>
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

      <div className="flex flex-col items-center gap-3">
        <button onClick={onBack} className="h-12 w-full rounded-lg border border-border px-6 text-base font-medium text-foreground transition-colors hover:bg-secondary">
          Back
        </button>
        <button
          onClick={() => {
            if (isLender && selected.includes("custom_company_form") && !uploadedFileName) {
              setUploadError("Please upload your questionnaire to continue.");
              return;
            }
            setUploadError(null);
            onContinue();
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-8 text-base font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default StepDocumentSelection;
