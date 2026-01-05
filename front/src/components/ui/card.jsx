// src/components/ui/card.jsx
import React from "react";

export function Card({ className = "", ...props }) {
  return (
    <div
      className={
        "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] " +
        "transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--ease-standard)] " +
        "hover:shadow-[var(--shadow-md)] hover:border-slate-200/80 " +
        className
      }
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return (
    <div
      className={
        "flex flex-col gap-1.5 border-b border-[var(--border)] px-5 py-4 " + className
      }
      {...props}
    />
  );
}

export function CardTitle({ className = "", ...props }) {
  return (
    <h3
      className={
        "text-lg font-semibold leading-none tracking-tight text-[var(--text)] " +
        className
      }
      {...props}
    />
  );
}

export function CardDescription({ className = "", ...props }) {
  return (
    <p
      className={
        "text-sm text-[var(--text-muted)] leading-relaxed " +
        className
      }
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }) {
  return (
    <div className={"px-5 py-4 " + className} {...props} />
  );
}

export function CardFooter({ className = "", ...props }) {
  return (
    <div
      className={
        "flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4 " +
        className
      }
      {...props}
    />
  );
}

export default Card;
