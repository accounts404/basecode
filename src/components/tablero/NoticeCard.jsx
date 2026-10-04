import React from 'react';

export default function NoticeCard({ notice, index = 0, variant = 'day' }) {
  const name = notice.target_name || 'Todos';
  const initial = (name || '?').charAt(0).toUpperCase();

  const isHigh = notice.priority === 'high';
  const accent = isHigh ? '#d9663f' : '#4c9fc3';

  if (variant === 'tile') {
    return (
      <div
        className="tv-tile border border-[#e1e7ec] rounded-[21px] bg-white/80 p-5 flex flex-col gap-4 tv-enter"
        style={{ animationDelay: `${index * 0.08}s` }}
      >
        <div className="flex items-center px-2 gap-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-[#c9d9e6] to-[#e7edf1] border-2 border-white text-[#1b3a5b] font-bold text-lg shadow-sm">
            {initial}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="h-2.5 w-44 rounded-full bg-[#dce4ea]" />
            <div className="h-2 w-24 rounded-full bg-[#e6ebef]" />
          </div>
          <div className="w-3 h-3 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
        </div>
        <div className="flex-1 rounded-[15px] bg-[#f8fafb] border border-[#edf1f4] p-4 overflow-hidden min-h-[150px]">
          <p className="text-[#2b4663] text-base leading-snug whitespace-pre-wrap">{notice.body}</p>
        </div>
      </div>
    );
  }

  return (
    <article
      className="tv-notice border border-[#d8e0e8] rounded-3xl bg-gradient-to-br from-white to-[#f7f9fb] shadow-[0_8px_22px_rgba(30,59,83,0.07)] p-5 flex flex-col gap-4 tv-enter"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="h-[68px] rounded-2xl bg-[#eef3f7] border border-[#e2e8ed] flex items-center px-4 gap-4">
        <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-[#c9d9e6] to-[#e7edf1] border-2 border-white text-[#1b3a5b] font-bold text-lg shadow-sm flex-shrink-0">
          {initial}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="text-base font-bold text-[#172c43] truncate">{name}</div>
          {notice.title ? (
            <div className="text-xs text-slate-500 truncate">{notice.title}</div>
          ) : (
            <div className="h-2 w-24 rounded-full bg-[#e6ebef]" />
          )}
        </div>
        {isHigh && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full text-white" style={{ background: accent }}>
            Urgente
          </span>
        )}
      </div>
      <div className="h-px bg-[#e1e7ec]" />
      <div className="flex-1 rounded-[15px] bg-[#f8fafb] border border-[#edf1f4] p-4 overflow-hidden min-h-[110px]">
        <p className="text-[#2b4663] text-[15px] leading-snug whitespace-pre-wrap">{notice.body}</p>
      </div>
    </article>
  );
}