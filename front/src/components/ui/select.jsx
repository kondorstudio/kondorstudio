// ARQUIVO: front/src/components/ui/select.jsx

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Implementação BEM SIMPLES do Select só pra resolver imports
 * e não quebrar o layout.
 *
 * Ela NÃO é um dropdown sofisticado igual o shadcn/ui,
 * mas já deixa o app rodando e os formulários funcionam “ok”.
 */

const SelectContext = React.createContext(null);

export function Select({
  children,
  className = "",
  value,
  defaultValue = "",
  onValueChange,
  ...props
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef(null);
  const optionsRef = useRef(new Map());

  const resolvedValue =
    value !== undefined && value !== null ? value : internalValue;

  const handleSelect = (newValue, label) => {
    if (value === undefined || value === null) {
      setInternalValue(newValue);
    }
    setSelectedLabel(label || "");
    onValueChange?.(newValue);
    setOpen(false);
  };

  useEffect(() => {
    if (!resolvedValue) {
      setSelectedLabel("");
      return;
    }
    const label = optionsRef.current.get(resolvedValue);
    if (label) {
      setSelectedLabel(label);
    }
  }, [resolvedValue]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleScroll = () => {
      setOpen(false);
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  const registerOption = useCallback(
    (val, label) => {
      optionsRef.current.set(val, label);
      if (val === resolvedValue && label) {
        setSelectedLabel(label);
      }
    },
    [resolvedValue]
  );

  const unregisterOption = useCallback(
    (val) => {
      optionsRef.current.delete(val);
      if (val === resolvedValue) {
        const label = optionsRef.current.get(val);
        setSelectedLabel(label || "");
      }
    },
    [resolvedValue]
  );

  return (
    <SelectContext.Provider
      value={{
        open,
        setOpen,
        value: resolvedValue,
        onSelect: handleSelect,
        selectedLabel,
        registerOption,
        unregisterOption,
      }}
    >
      <div
        ref={containerRef}
        className={`relative flex flex-col gap-1 ${className}`}
        {...props}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = "", onClick, ...props }) {
  const ctx = useContext(SelectContext);

  const handleClick = (e) => {
    if (props.disabled) return;
    ctx?.setOpen?.(!ctx?.open);
    if (onClick) onClick(e);
  };

  return (
    <button
      type="button"
      className={
        "flex h-10 w-full items-center justify-between rounded-[10px] border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] shadow-sm " +
        "transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] " +
        "hover:bg-gray-50 hover:shadow-[var(--shadow-sm)] focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.2)] " +
        className
      }
      {...props}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }) {
  const ctx = useContext(SelectContext);
  const label = ctx?.selectedLabel;
  const value = ctx?.value;

  const display = label || value || placeholder || "Selecione...";

  return <span className={label || value ? "text-gray-900" : "text-gray-500"}>{display}</span>;
}

export function SelectContent({ children, className = "", ...props }) {
  const ctx = useContext(SelectContext);
  if (!ctx?.open) return null;

  return (
    <div
      className={
        "absolute left-0 right-0 mt-1 z-50 max-h-60 w-full overflow-auto rounded-[10px] border border-[var(--border)] bg-white p-1 shadow-lg " +
        "animate-fade-in-up " +
        className
      }
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectItem({ children, value, className = "", onClick, ...props }) {
  const ctx = useContext(SelectContext);
  const isSelected = ctx?.value === value;
  const registerOption = ctx?.registerOption;
  const unregisterOption = ctx?.unregisterOption;

  const labelText =
    typeof children === "string" || typeof children === "number"
      ? children
      : value;

  useEffect(() => {
    registerOption?.(value, labelText);
    return () => unregisterOption?.(value);
  }, [registerOption, unregisterOption, value, labelText]);

  const handleClick = (e) => {
    ctx?.onSelect?.(value, labelText);
    if (onClick) onClick(e);
  };

  return (
    <div
      data-value={value}
      onClick={handleClick}
      className={
        "cursor-pointer rounded-[8px] px-2 py-1.5 text-sm transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[var(--primary-light)] " +
        (isSelected ? "bg-[var(--primary-light)] text-[var(--primary)]" : "text-gray-800") +
        " " +
        className
      }
      {...props}
    >
      {children}
    </div>
  );
}
