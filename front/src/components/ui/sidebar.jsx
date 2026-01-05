import React, {
  createContext,
  useContext,
  useState
} from "react";

// Contexto para colapsar/expandir o sidebar
const SidebarContext = createContext({
  collapsed: false,
  toggleCollapsed: () => {}
});

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

// ===== COMPONENTES BÁSICOS =====

export function Sidebar({ className = "", children }) {
  const { collapsed } = useSidebar();

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={`flex h-screen flex-col overflow-hidden bg-[var(--surface)] border-r border-[var(--border)] shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition-[width,box-shadow] duration-200 ${
        collapsed ? "w-16" : "w-64"
      } ${className}`}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className = "", children }) {
  return (
    <div className={`border-b border-[var(--border)] px-4 py-3 ${className}`}>
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

export function SidebarFooter({ className = "", children }) {
  return (
    <div className={`border-t border-[var(--border)] px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

// ===== GROUPS =====

export function SidebarGroup({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

export function SidebarGroupContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

export function SidebarGroupLabel({ className = "", children }) {
  return (
    <div
      className={`px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)] ${className}`}
    >
      {children}
    </div>
  );
}

// ===== MENU =====

export function SidebarMenu({ className = "", children }) {
  return <nav className={className}>{children}</nav>;
}

export function SidebarMenuItem({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

export function SidebarMenuButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text)] transition-[background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[var(--surface-muted)] hover:shadow-[var(--shadow-sm)] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ===== TRIGGER / RAIL (mesmo se não usar, não quebra) =====

export function SidebarTrigger({ className = "", children, ...props }) {
  const { toggleCollapsed } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      className={`inline-flex items-center justify-center rounded-[10px] border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] transition-[background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[var(--surface-muted)] hover:shadow-[var(--shadow-sm)] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarRail({ className = "" }) {
  // componente "decorativo" opcional
  return <div className={className} />;
}
