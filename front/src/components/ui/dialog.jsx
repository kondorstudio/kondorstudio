// front/src/components/ui/dialog.jsx
import React from "react";

/**
 * Implementação simples de Dialog no estilo shadcn/ui
 * Suporta:
 *  - <Dialog open={bool} onOpenChange={fn}>
 *  - <DialogContent>, <DialogHeader>, <DialogTitle>, <DialogDescription>, <DialogFooter>
 */

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;

  const handleOverlayClick = () => {
    if (onOpenChange) onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40"
        onClick={handleOverlayClick}
      />

      {/* Conteúdo */}
      <div className="relative z-50">{children}</div>
    </div>
  );
}

export function DialogContent({ className = "", children, ...props }) {
  return (
    <div
      className={
        "bg-white rounded-2xl shadow-xl border border-gray-200 " +
        "w-[calc(100vw-2rem)] max-w-full sm:max-w-lg mx-auto p-4 sm:p-6 " +
        className
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogHeader({ className = "", children, ...props }) {
  return (
    <div className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function DialogTitle({ className = "", children, ...props }) {
  return (
    <h2
      className={`text-lg font-semibold text-gray-900 ${className}`}
      {...props}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({ className = "", children, ...props }) {
  return (
    <p className={`text-sm text-gray-500 mt-1 ${className}`} {...props}>
      {children}
    </p>
  );
}

export function DialogFooter({ className = "", children, ...props }) {
  return (
    <div
      className={`mt-6 flex items-center justify-end gap-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
