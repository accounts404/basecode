import React, { useRef, useLayoutEffect } from 'react';

export default function OfficeNoticeCard({ notice, index = 0 }) {
  const boxRef = useRef(null);
  const titleRef = useRef(null);
  const titleTextRef = useRef(null);
  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    const fit = () => {
      const box = boxRef.current;
      const title = titleRef.current;
      const titleText = titleTextRef.current;
      const body = bodyRef.current;
      if (!box || !body) return;
      const avail = box.clientHeight;
      if (avail <= 0) return;

      const titleH = title ? title.offsetHeight : 0;
      const bodyAvail = avail - titleH;
      let fs = parseFloat(getComputedStyle(body).fontSize);
      const min = 9, max = 30;
      let guard = 0;
      while (body.scrollHeight > bodyAvail && fs > min && guard < 300) {
        fs -= 0.5;
        body.style.fontSize = fs + 'px';
        guard++;
      }
      guard = 0;
      while (body.scrollHeight <= bodyAvail && fs < max && guard < 300) {
        const next = fs + 1;
        body.style.fontSize = next + 'px';
        if (body.scrollHeight > bodyAvail) { body.style.fontSize = fs + 'px'; break; }
        fs = next;
        guard++;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [notice.body, notice.title]);

  const bg = index % 2 === 0 ? '#ffffff' : '#f7faff';

  return (
    <article
      className="tv-office flex flex-col rounded-2xl border overflow-hidden"
      style={{
        containerType: 'size',
        flex: '1 1 0',
        minHeight: 0,
        borderColor: '#d8e1ee',
        background: bg,
        animationDelay: `${index * 0.07}s`,
        boxShadow: '0 4px 14px rgba(15,31,58,0.06)',
      }}
    >
      <style>{`
        @keyframes tv-of-enter { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .tv-office { animation: tv-of-enter .5s ease-out both; }
      `}</style>
      <div ref={titleRef} className="flex-shrink-0 px-3 py-2 border-b border-[#e3ebf7]">
        <div
          ref={titleTextRef}
          className="font-extrabold text-[#173e9e] leading-tight overflow-hidden"
          style={{ fontSize: 'clamp(0.78rem, min(2.4cqw, 4.5cqh), 1.5rem)', letterSpacing: '0.01em', display: '-webkit-box', WebkitLineClamp: 2, lineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {notice.title || 'Aviso'}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2">
        <p
          ref={bodyRef}
          className="text-[#1e3a5f] whitespace-pre-wrap"
          style={{
            fontSize: 'clamp(0.72rem, 1.5cqw, 1.15rem)',
            lineHeight: 1.3,
            overflowWrap: 'anywhere',
            margin: 0,
          }}
        >
          {notice.body}
        </p>
      </div>
    </article>
  );
}