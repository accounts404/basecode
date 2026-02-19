import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from "@/components/ui/button";
import { Copy, Zap, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";

const FunctionDisplay = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;

  const parsedResults = (() => {
    if (!results) return null;
    try { return typeof results === 'string' ? JSON.parse(results) : results; }
    catch { return results; }
  })();

  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );

  const statusConfig = {
    pending: { icon: Clock, color: 'text-slate-400', text: 'Pendiente' },
    running: { icon: Loader2, color: 'text-slate-500', text: 'Buscando...', spin: true },
    in_progress: { icon: Loader2, color: 'text-slate-500', text: 'Buscando...', spin: true },
    completed: isError ? { icon: AlertCircle, color: 'text-red-500', text: 'Error' } : { icon: CheckCircle2, color: 'text-green-600', text: 'Listo' },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'Listo' },
    failed: { icon: AlertCircle, color: 'text-red-500', text: 'Error' },
    error: { icon: AlertCircle, color: 'text-red-500', text: 'Error' }
  }[status] || { icon: Zap, color: 'text-slate-500', text: '' };

  const Icon = statusConfig.icon;
  const formattedName = name.replace(/_/g, ' ').replace(/\./g, ' › ');

  return (
    <div className="mt-1.5 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all text-left",
          "hover:bg-slate-50",
          expanded ? "bg-slate-50 border-slate-300" : "bg-white border-slate-200"
        )}
      >
        <Icon className={cn("h-3 w-3 flex-shrink-0", statusConfig.color, statusConfig.spin && "animate-spin")} />
        <span className="text-slate-600 capitalize">{formattedName}</span>
        {statusConfig.text && <span className={cn("text-slate-400", isError && "text-red-500")}>· {statusConfig.text}</span>}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={cn("h-3 w-3 text-slate-400 transition-transform ml-auto", expanded && "rotate-90")} />
        )}
      </button>
    </div>
  );
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mt-0.5 flex-shrink-0 shadow-sm">
          <span className="text-white text-xs font-bold">RO</span>
        </div>
      )}
      <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
        {message.content && (
          <div className={cn(
            "rounded-2xl px-4 py-2.5 shadow-sm",
            isUser
              ? "bg-blue-600 text-white rounded-br-sm"
              : "bg-white border border-slate-200 rounded-bl-sm"
          )}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="my-0">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                  h1: ({ children }) => <h1 className="text-base font-bold my-2 text-slate-900">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-sm font-bold my-1.5 text-slate-900">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold my-1 text-slate-800">{children}</h3>,
                  code: ({ inline, children }) => inline
                    ? <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono">{children}</code>
                    : <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto my-2 text-xs"><code>{children}</code></pre>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-blue-300 pl-3 my-2 text-slate-600 italic">{children}</blockquote>
                  ),
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{children}</a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && (
          <div className="space-y-0.5 mt-1">
            {message.tool_calls.map((toolCall, idx) => (
              <FunctionDisplay key={idx} toolCall={toolCall} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}