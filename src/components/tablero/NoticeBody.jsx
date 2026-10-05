import React from 'react';

// Detecta líneas que comienzan con un marcador de viñeta: -, •, * o + seguido de espacio.
const BULLET_RE = /^\s*[-•*+]\s+(.*)$/;

/**
 * Renderiza el cuerpo de un aviso convirtiendo las líneas con marcadores
 * (-, •, *, +) en viñetas reales. Las demás líneas se muestran como párrafos.
 * Pensado para leerse a distancia en el tablero TV.
 */
export default function NoticeBody({ text, className = '', bulletClass = '', paragraphClass = '' }) {
  if (!text) return null;

  const lines = text.split('\n');
  const blocks = [];
  let bullets = [];

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className={`tv-bullets ${bulletClass}`}>
          {bullets.map((b, i) => (
            <li key={i} className="tv-bullet-item">
              <span className="tv-bullet-dot" aria-hidden="true">•</span>
              <span className="tv-bullet-text">{b}</span>
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  lines.forEach((raw, idx) => {
    const m = raw.match(BULLET_RE);
    if (m) {
      bullets.push(m[1].trim());
    } else {
      flushBullets();
      const trimmed = raw.trim();
      if (trimmed) {
        blocks.push(
          <p key={`p-${idx}`} className={`tv-paragraph ${paragraphClass}`}>{raw}</p>
        );
      } else {
        blocks.push(<div key={`sp-${idx}`} className="tv-space" />);
      }
    }
  });
  flushBullets();

  return <div className={className}>{blocks}</div>;
}