// front/src/components/ui/textarea.jsx
import React from "react";
export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={
        "flex w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-sm " +
        "text-[var(--text)] shadow-sm placeholder:text-gray-400 transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus:outline-none focus:ring-2 " +
        "focus:ring-[rgba(31,111,235,0.2)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
      {...props}
    />
  );
}

export default Textarea;
