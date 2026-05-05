import Link from "next/link";

import {
  getFormTemplateEditorData,
  listRegistryOptions,
} from "../../form-templates-actions";

import FormTemplateEditor from "./editor";

export default async function GodModeFormTemplateEditorPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const [data, registryOptions] = await Promise.all([
    getFormTemplateEditorData(orderId),
    listRegistryOptions(),
  ]);

  if ("error" in data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-12">
        <Link
          href="/god-mode"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          &larr; Back to God Mode
        </Link>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {data.error}
        </div>
      </div>
    );
  }

  return <FormTemplateEditor data={data} registryOptions={registryOptions} />;
}
