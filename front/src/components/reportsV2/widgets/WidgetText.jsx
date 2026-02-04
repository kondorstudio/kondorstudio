import React from "react";

export default function WidgetText({ widget }) {
  const text = String(widget?.content?.text || "").trim();

  if (!text) {
    return (
      <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--muted)]">
        Bloco de texto vazio.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto rounded-[12px] bg-[var(--card)] px-3 py-2 text-sm leading-6 text-[var(--text)]">
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}
