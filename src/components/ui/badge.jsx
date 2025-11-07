import * as React from "react"

function Badge({ className = "", variant = "default", ...props }) {
  const variantClasses = {
    default: "bg-slate-900 text-white hover:bg-slate-900/80",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
    destructive: "bg-red-500 text-white hover:bg-red-500/80",
    outline: "border border-slate-200 bg-transparent text-slate-900 hover:bg-slate-100",
  };

  return (
    <div
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${variantClasses[variant] || variantClasses.default} ${className}`}
      {...props}
    />
  );
}

export { Badge }