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
        "flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 " +
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
        "absolute left-0 right-0 mt-1 z-50 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg " +
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
        "cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-purple-50 " +
        (isSelected ? "bg-purple-50 text-purple-700" : "text-gray-800") +
        " " +
        className
      }
      {...props}
    >
      {children}
    </div>
  );
}
