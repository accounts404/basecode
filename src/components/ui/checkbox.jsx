import React from "react";
import { Check } from "lucide-react";

const Checkbox = React.forwardRef(({ className = "", checked = false, onCheckedChange, disabled = false, ...props }, ref) => {
  const handleChange = (e) => {
    if (onCheckedChange) {
      onCheckedChange(e.target.checked);
    }
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className={`
          peer h-4 w-4 shrink-0 rounded-sm border-2 border-slate-300 
          ring-offset-background focus-visible:outline-none focus-visible:ring-2 
          focus-visible:ring-blue-500 focus-visible:ring-offset-2 
          disabled:cursor-not-allowed disabled:opacity-50 
          checked:bg-blue-600 checked:border-blue-600
          ${className}
        `}
        {...props}
      />
      {checked && (
        <Check className="absolute inset-0 h-4 w-4 text-white pointer-events-none" />
      )}
    </div>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };