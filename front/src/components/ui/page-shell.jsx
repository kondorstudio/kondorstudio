import React from "react";
import { cn } from "@/utils/classnames.js";

export function PageShell({ className = "", children }) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-6 md:py-10 lg:px-8 animate-fade-in-up">
        {children}
      </div>
    </div>
  );
}

export default PageShell;
