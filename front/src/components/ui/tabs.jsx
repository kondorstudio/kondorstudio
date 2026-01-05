import React, { createContext, useContext, useState } from "react";

const TabsContext = createContext(null);

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  children,
  className = "",
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");

  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = (next) => {
    if (onValueChange) {
      onValueChange(next);
    } else {
      setInternalValue(next);
    }
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue: handleChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = "" }) {
  return (
    <div
      className={
        "inline-flex items-center rounded-[12px] border border-[var(--border)] bg-white/70 p-1 text-[var(--text-muted)] " +
        "shadow-[var(--shadow-sm)] backdrop-blur " +
        className
      }
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className = "" }) {
  const ctx = useContext(TabsContext);

  if (!ctx) {
    console.warn("TabsTrigger must be used inside <Tabs />");
    return null;
  }

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={
        "px-3 py-1.5 text-sm font-medium rounded-[10px] transition-[color,background-color,box-shadow,transform] duration-[var(--motion-base)] ease-[var(--ease-standard)] " +
        (isActive
          ? "bg-white text-[var(--primary)] shadow-[var(--shadow-sm)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/70 hover:-translate-y-0.5") +
        " " +
        className
      }
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = "" }) {
  const ctx = useContext(TabsContext);

  if (!ctx) {
    console.warn("TabsContent must be used inside <Tabs />");
    return null;
  }

  if (ctx.value !== value) return null;

  return <div className={className}>{children}</div>;
}

export default Tabs;
