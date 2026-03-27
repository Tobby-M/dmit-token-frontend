"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DmitReport } from "@/lib/dmit/parser";

interface BasicReportBundleItem {
  finger: string;
  typeCode: string;
  confidence: number;
  notes: string;
  report: DmitReport;
}

interface BasicReportBundleViewProps {
  sessionId: string;
  tokenPrefix: string | null;
  completedAt: string | null;
  items: BasicReportBundleItem[];
}

export function BasicReportBundleView(props: BasicReportBundleViewProps) {
  const saveAsPdf = () => {
    window.print();
  };

  return (
    <article className="print-shell space-y-5 rounded-[2rem] border border-brass/25 bg-white px-4 py-4 shadow-card sm:px-6 sm:py-6 print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
            Basic DMIT Report
          </p>
          <p className="mt-1 text-sm text-ink/65">
            Bundled 4-finger report for the completed Basic sequence.
          </p>
        </div>
        <button
          type="button"
          onClick={saveAsPdf}
          className="rounded-full border border-brass/40 bg-canvas px-4 py-2 text-sm font-semibold text-ink transition hover:bg-clay"
        >
          Save as PDF
        </button>
      </div>

      <header className="rounded-[1.5rem] border border-brass/30 bg-gradient-to-br from-canvas via-white to-clay/60 p-4 sm:p-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
              4-Finger Bundle
            </p>
            <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
              Basic Plan Combined Report
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-ink/78">
              This report consolidates the four required Basic fingerprints into one in-app review
              surface while preserving each finger’s dataset-backed result and reference pattern.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Session"
              value={props.sessionId.slice(0, 8).toUpperCase()}
            />
            <SummaryCard
              label="Token"
              value={props.tokenPrefix ?? "Free / N/A"}
            />
            <SummaryCard
              label="Completed"
              value={props.completedAt ? formatTimestamp(props.completedAt) : "In progress"}
            />
          </div>
        </div>
      </header>

      <section className="rounded-[1.5rem] border border-brass/25 bg-canvas/45 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-brass/30" />
          <h2 className="text-center text-base font-semibold tracking-[0.04em] text-ink sm:text-lg">
            Sequence Summary
          </h2>
          <div className="h-px flex-1 bg-brass/30" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {props.items.map((item) => (
            <article
              key={item.finger}
              className="rounded-2xl border border-brass/25 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">
                {item.finger}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-ink">{item.report.abilityTitle}</h3>
              <div className="mt-3 flex items-center gap-2 text-sm text-ink/72">
                <span className="rounded-full bg-canvas px-3 py-1 font-semibold text-ink">
                  {item.typeCode}
                </span>
                <span>{(item.confidence * 100).toFixed(1)}%</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink/72">{item.notes}</p>
            </article>
          ))}
        </div>
      </section>

      {props.items.map((item) => (
        <section
          key={item.finger}
          className="overflow-hidden rounded-[1.5rem] border border-brass/25 bg-white"
        >
          <div className="grid gap-5 border-b border-brass/20 bg-gradient-to-br from-white via-canvas/50 to-clay/40 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_280px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pine">
                  {item.finger}
                </p>
                <h2 className="text-2xl font-semibold leading-tight text-ink">
                  {item.report.abilityTitle}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-ink/78">
                  {item.report.descriptionMarkdown.split("\n\n")[0]}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Type" value={item.typeCode} />
                <MetricCard label="Percent" value={item.report.percentage} />
                <MetricCard label="RC" value={item.report.rc} />
                <MetricCard
                  label="Confidence"
                  value={`${(item.confidence * 100).toFixed(1)}%`}
                />
              </div>
            </div>

            <aside className="rounded-[1.4rem] border border-brass/30 bg-white/85 p-4 shadow-sm print:shadow-none">
              <div className="overflow-hidden rounded-[1.2rem] border border-brass/20 bg-canvas">
                <img
                  src={`/api/type-image/${item.typeCode}`}
                  alt={`${item.typeCode} reference fingerprint`}
                  className="h-56 w-full object-cover sm:h-64"
                />
              </div>
              <div className="mt-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                  Reference Pattern
                </p>
                <p className="text-base font-semibold text-ink">{item.typeCode}</p>
                <p className="text-sm leading-6 text-ink/70">
                  Dataset reference fingerprint for this finger’s classified pattern.
                </p>
              </div>
            </aside>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <MarkdownSection markdown={item.report.descriptionMarkdown} tone="prose" />

            {item.report.traits ? (
              <ReportSection
                title={item.report.traits.displayTitle}
                markdown={item.report.traits.markdown}
                tone="warm"
              />
            ) : null}

            {item.report.specificSuggestions ? (
              <ReportSection
                title={item.report.specificSuggestions.displayTitle}
                markdown={item.report.specificSuggestions.markdown}
                tone="light"
              />
            ) : null}

            {item.report.otherSuggestions ? (
              <ReportSection
                title={item.report.otherSuggestions.displayTitle}
                markdown={item.report.otherSuggestions.markdown}
                tone="grid"
              />
            ) : null}
          </div>
        </section>
      ))}
    </article>
  );
}

function SummaryCard(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">{props.label}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{props.value}</p>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-brass/30 bg-white/90 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink/45">{props.label}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{props.value}</p>
    </div>
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
        <h3 className="text-center text-base font-semibold tracking-[0.04em] text-ink sm:text-lg">
          {title}
        </h3>
        <div className="h-px flex-1 bg-brass/30" />
      </div>
      <MarkdownSection
        markdown={markdown}
        tone={tone === "grid" ? "report-markdown-grid" : "report-markdown"}
      />
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

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}
