import { PORTAL_DOCUMENTS, formatCurrency, getDocumentFee, type RequesterType } from "@/lib/portal-data";
import { Check, FileText } from "lucide-react";

interface StepDocumentSelectionProps {
  requesterType: RequesterType;
  selected: string[];
  primaryColor: string;
  onToggle: (docId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

const RESALE_IDS = ["resale_cert", "resale_cert_update"];

const StepDocumentSelection = ({ requesterType, selected, primaryColor, onToggle, onContinue, onBack }: StepDocumentSelectionProps) => {
  const isHomeowner = requesterType === "homeowner";

  const availableDocs = PORTAL_DOCUMENTS.filter((d) => {
    if (!d.availableTo.includes(requesterType)) return false;
    if (!isHomeowner && d.id === "resale_cert_update") return false;
    return true;
  });

  const handleToggle = (docId: string) => {
    if (isHomeowner && RESALE_IDS.includes(docId)) {
      const otherId = docId === "resale_cert" ? "resale_cert_update" : "resale_cert";
      if (!selected.includes(docId)) {
        if (selected.includes(otherId)) onToggle(otherId);
        onToggle(docId);
      }
      return;
    }
    onToggle(docId);
  };

  const total = getDocumentFee(selected);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Select Documents</h2>
        <p className="text-sm text-muted-foreground mt-1">Choose the documents you need for this transaction.</p>
      </div>

      <div className="space-y-2">
        {availableDocs.map((doc) => {
          const isSelected = selected.includes(doc.id);
          const isResale = isHomeowner && RESALE_IDS.includes(doc.id);
          const isRequired = doc.required && !isResale;
          return (
            <button
              key={doc.id}
              onClick={() => !isRequired && handleToggle(doc.id)}
              className={`w-full flex items-center gap-4 rounded-xl border-2 border-border bg-white p-5 text-left transition-all hover:border-muted-foreground/40 ${
                isRequired ? "cursor-default" : "cursor-pointer"
              }`}
              style={isSelected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
            >
              {isResale ? (
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

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
          Back
        </button>
        <button
          onClick={onContinue}
          className="flex-1 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default StepDocumentSelection;
