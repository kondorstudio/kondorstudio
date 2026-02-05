// ARQUIVO: front/src/components/ui/checkbox.jsx

import React from "react";

export function Checkbox({
  className = "",
  checked,
  onCheckedChange,
  ...props
}) {
  const handleChange = (event) => {
    if (onCheckedChange) {
      onCheckedChange(event.target.checked);
    }

    if (props.onChange) {
      props.onChange(event);
    }
  };

  return (
    <input
      type="checkbox"
      className={
        "h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus:ring-[rgba(var(--primary-rgb),0.2)] " +
        className
      }
      checked={checked}
      onChange={handleChange}
      {...props}
    />
  );
}

export default Checkbox;
