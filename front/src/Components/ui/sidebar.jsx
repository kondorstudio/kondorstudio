import React from "react";

export function Sidebar({ className = "", children }) {
  return (
    <aside className={`flex h-screen flex-col bg-white ${className}`}>
      {children}
    </aside>
  );
}

export function SidebarHeader({ className = "", children }) {
  return (
    <div className={`border-b px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

export function SidebarContent({ className = "", children }) {
  return (
    <div className={`flex-1 overflow-y-auto ${className}`}>
      {children}
    </div>
  );
}

export function SidebarMenu({ className = "", children }) {
  return (
    <nav className={className}>
      {children}
    </nav>
  );
}

export function SidebarMenuItem({ className = "", children }) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}

export function SidebarMenuButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
