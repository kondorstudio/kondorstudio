import React, {
  createContext,
  useContext,
  useState
} from "react";

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

export function Sidebar({ className = "", children }) {
  const { collapsed } = useSidebar();

  return (
    <aside
      className={`flex h-screen flex-col bg-white border-r border-gray-200 transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      } ${className}`}
    >
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

export function SidebarFooter({ className = "", children }) {
  return (
    <div className={`border-t px-4 py-3 ${className}`}>
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
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-100 text-sm ${
        className || ""
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarTrigger({ className = "", children, ...props }) {
  const { toggleCollapsed } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      className={`inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs hover:bg-gray-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
