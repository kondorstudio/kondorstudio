import React from "react";
import { cn } from "@/utils/classnames.js";

export function PageShell({ className = "", children }) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(600px_200px_at_10%_0%,rgba(109,40,217,0.16),transparent_70%),radial-gradient(520px_200px_at_90%_0%,rgba(14,165,233,0.12),transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-[1280px] px-6 py-8 animate-fade-in-up">
        {children}
      </div>
    </div>
  );
}

export default PageShell;
