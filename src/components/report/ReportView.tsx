"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DmitReport } from "@/lib/dmit/parser";

interface ReportViewProps {
  report: DmitReport;
  typeCode: string;
  confidence: number;
}

export function ReportView({ report, typeCode, confidence }: ReportViewProps) {
  const saveAsPdf = () => {
    window.print();
  };

  return (
    <article className="print-shell space-y-5 rounded-[2rem] border border-brass/25 bg-white px-4 py-4 shadow-card sm:px-6 sm:py-6 print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">Analysis Report</p>
          <p className="mt-1 text-sm text-ink/65">Optimized for mobile reading and clean PDF export.</p>
        </div>
        <button
          type="button"
          onClick={saveAsPdf}
          className="rounded-full border border-brass/40 bg-canvas px-4 py-2 text-sm font-semibold text-ink transition hover:bg-clay"
        >
          Save as PDF
        </button>
      </div>

      <header className="overflow-hidden rounded-[1.5rem] border border-brass/30 bg-gradient-to-br from-canvas via-white to-clay/60 print:rounded-none print:border-b print:border-brass/20">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_320px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">{report.finger}</p>
              <h2 className="text-2xl font-semibold leading-tight text-ink sm:text-3xl">{report.abilityTitle}</h2>
              <p className="max-w-2xl text-sm leading-7 text-ink/78 sm:text-[15px]">
                {report.descriptionMarkdown.split("\n\n")[0]}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">Type</p>
                <p className="mt-2 text-lg font-semibold text-ink">{typeCode}</p>
              </div>
              <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">Percent</p>
                <p className="mt-2 text-lg font-semibold text-ink">{report.percentage}</p>
              </div>
              <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">RC</p>
                <p className="mt-2 text-lg font-semibold text-ink">{report.rc}</p>
              </div>
              <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">Confidence</p>
                <p className="mt-2 text-lg font-semibold text-ink">{(confidence * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[1.4rem] border border-brass/30 bg-white/85 p-4 shadow-sm print:shadow-none">
            <div className="overflow-hidden rounded-[1.2rem] border border-brass/20 bg-canvas">
              <img
                src={`/api/type-image/${typeCode}`}
                alt={`${typeCode} reference fingerprint`}
                className="h-56 w-full object-cover sm:h-64 lg:h-72"
              />
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Reference Pattern</p>
              <p className="text-base font-semibold text-ink">{typeCode}</p>
              <p className="text-sm leading-6 text-ink/70">
                The report uses the dataset fingerprint image that matches the classified type.
              </p>
            </div>
          </aside>
        </div>
      </header>

      <MarkdownSection markdown={report.descriptionMarkdown} tone="prose" />

      {report.traits ? <ReportSection title={report.traits.displayTitle} markdown={report.traits.markdown} tone="warm" /> : null}
      {report.specificSuggestions ? (
        <ReportSection
          title={report.specificSuggestions.displayTitle}
          markdown={report.specificSuggestions.markdown}
          tone="light"
        />
      ) : null}
      {report.otherSuggestions ? (
        <ReportSection title={report.otherSuggestions.displayTitle} markdown={report.otherSuggestions.markdown} tone="grid" />
      ) : null}
    </article>
  );
}

function ReportSection({
  title,
  markdown,
  tone
}: {
  title: string;
  markdown: string;
  tone: "warm" | "light" | "grid";
}) {
  const containerClassName =
    tone === "warm"
      ? "rounded-[1.5rem] border border-brass/25 bg-clay/25 p-4 sm:p-5"
      : tone === "grid"
        ? "rounded-[1.5rem] border border-brass/25 bg-white p-4 sm:p-5"
        : "rounded-[1.5rem] border border-brass/25 bg-canvas/55 p-4 sm:p-5";

  return (
    <section className={containerClassName}>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-brass/30" />
        <h3 className="text-center text-base font-semibold tracking-[0.04em] text-ink sm:text-lg">{title}</h3>
        <div className="h-px flex-1 bg-brass/30" />
      </div>
      <MarkdownSection markdown={markdown} tone={tone === "grid" ? "report-markdown-grid" : "report-markdown"} />
    </section>
  );
}

function MarkdownSection({
  markdown,
  tone
}: {
  markdown: string;
  tone: "prose" | "report-markdown" | "report-markdown-grid";
}) {
  if (!markdown.trim()) {
    return null;
  }

  const className =
    tone === "prose"
      ? "report-markdown report-markdown-intro"
      : tone === "report-markdown-grid"
        ? "report-markdown report-markdown-grid"
        : "report-markdown";

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
