"use client";

import { useState } from "react";
import { PipelineSection, type PipelineData } from "@/components/settings/pipeline-section";
import { SchedulerSection, type SchedulerData } from "@/components/settings/scheduler-section";
import { LLMSection, type LLMData } from "@/components/settings/llm-section";
import { EmailSection, type EmailData } from "@/components/settings/email-section";
import { RAGSection, type RAGData } from "@/components/settings/rag-section";
import { ClassificationSection, type ClassificationData } from "@/components/settings/classification-section";
import { PromptsSection, type PromptsData } from "@/components/settings/prompts-section";
import { ReadonlySection } from "@/components/settings/readonly-section";

const TABS = [
  "Pipeline", "Planificateur", "LLM", "Email",
  "RAG", "Classification", "Prompts", "Infrastructure",
] as const;
type Tab = typeof TABS[number];

interface Props {
  sections: Record<string, Record<string, unknown>>;
  readonly: Record<string, Record<string, unknown>>;
}

export function SettingsClient({ sections, readonly }: Props) {
  const [active, setActive] = useState<Tab>("Pipeline");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              active === tab
                ? "border-slate-900 text-slate-900 font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Pipeline" && sections.pipeline && (
        <PipelineSection initialData={sections.pipeline as unknown as PipelineData} />
      )}
      {active === "Planificateur" && sections.scheduler && (
        <SchedulerSection initialData={sections.scheduler as unknown as SchedulerData} />
      )}
      {active === "LLM" && sections.llm && (
        <LLMSection initialData={sections.llm as unknown as LLMData} />
      )}
      {active === "Email" && sections.email && (
        <EmailSection initialData={sections.email as unknown as EmailData} />
      )}
      {active === "RAG" && sections.rag && (
        <RAGSection initialData={sections.rag as unknown as RAGData} />
      )}
      {active === "Classification" && sections.classification && (
        <ClassificationSection initialData={sections.classification as unknown as ClassificationData} />
      )}
      {active === "Prompts" && sections.prompts && (
        <PromptsSection initialData={sections.prompts as unknown as PromptsData} />
      )}
      {active === "Infrastructure" && (
        <div className="space-y-4">
          <ReadonlySection
            title="Base de données"
            fields={[{ label: "URL", value: String(readonly.database?.url ?? "***") }]}
          />
          <ReadonlySection
            title="Stockage MinIO"
            fields={[
              { label: "Endpoint", value: String(readonly.minio?.endpoint ?? "***") },
              { label: "Bucket", value: String(readonly.minio?.bucket_name ?? "***") },
              { label: "Credentials", value: "***" },
            ]}
          />
          <ReadonlySection
            title="SMTP"
            fields={[
              { label: "Hôte", value: String(readonly.smtp?.host ?? "***") },
              { label: "Port", value: String(readonly.smtp?.port ?? "***") },
              { label: "Credentials", value: "***" },
            ]}
          />
          <ReadonlySection
            title="Sécurité"
            fields={[
              { label: "Admin username", value: String(readonly.security?.admin_username ?? "***") },
              { label: "JWT secret", value: "***" },
              { label: "Admin password", value: "***" },
            ]}
          />
        </div>
      )}

      {!sections.pipeline && active !== "Infrastructure" && (
        <div className="text-center py-12 text-slate-400">
          <p>Aucune configuration en base de données.</p>
          <p className="text-sm mt-1">
            Lancez le seeding via l&apos;API : <code>POST /api/v1/admin/settings/seed</code>
          </p>
        </div>
      )}
    </div>
  );
}
