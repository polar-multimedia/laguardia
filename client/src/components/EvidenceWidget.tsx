/**
 * Widget de evidencia científica.
 * Muestra la respuesta formal escrita de Clara con citas numeradas,
 * seguida de las tarjetas de papers con snippet y enlace al PDF.
 */
import { useRef } from 'react';
import { FileText, X, ExternalLink, BookOpen } from 'lucide-react';
import type { EvidenceItem } from '../lib/types';
import { SERVER_BASE } from '../hooks/useRealtimeSession';

interface EvidenceWidgetProps {
  evidence: EvidenceItem[];
  formalResponse: string;
  onClose: () => void;
}

/** Convierte el texto con [N] en nodos React con superíndices clicables */
function FormattedResponse({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick: (num: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
      {parts.map((part, idx) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          const num = parseInt(m[1], 10);
          return (
            <sup key={idx}>
              <button
                onClick={() => onCitationClick(num)}
                className="mx-px font-semibold transition-colors"
                style={{ color: '#5b8dee', fontSize: '0.7em' }}
                title={`Ir a referencia [${num}]`}
              >
                [{num}]
              </button>
            </sup>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </p>
  );
}

export function EvidenceWidget({ evidence, formalResponse, onClose }: EvidenceWidgetProps) {
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const scrollToCard = (num: number) => {
    cardRefs.current[num]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasFormal = formalResponse && formalResponse.trim().length > 0;
  const hasPapers = evidence.length > 0;

  if (!hasFormal && !hasPapers) return null;

  return (
    <div className="slide-up flex flex-col gap-4 w-full">

      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Respuesta clínica formal
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Respuesta formal con citas ───────────────────────────── */}
      {hasFormal && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(15, 21, 33, 0.95)',
            border: '1px solid rgba(91, 141, 238, 0.2)',
          }}
        >
          <FormattedResponse text={formalResponse} onCitationClick={scrollToCard} />
        </div>
      )}

      {/* ── Separador de referencias ─────────────────────────────── */}
      {hasPapers && (
        <>
          <div className="flex items-center gap-2 mt-1">
            <FileText size={13} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Referencias · {evidence.length} {evidence.length === 1 ? 'paper' : 'papers'}
            </span>
          </div>

          {/* ── Paper cards ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            {evidence.map((item) => (
              <PaperCard
                key={item.file_id}
                item={item}
                cardRef={(el) => { cardRefs.current[item.citationNumber] = el; }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface PaperCardProps {
  item: EvidenceItem;
  cardRef: (el: HTMLDivElement | null) => void;
}

function PaperCard({ item, cardRef }: PaperCardProps) {
  const pdfUrl = `${SERVER_BASE}/pdf/${encodeURIComponent(item.filename)}${
    item.page ? `#page=${item.page}` : ''
  }`;

  return (
    <div
      ref={cardRef}
      className="rounded-xl border p-4 flex flex-col gap-3 scroll-mt-4"
      style={{
        background: 'rgba(15, 21, 33, 0.95)',
        borderColor: 'rgba(30, 42, 63, 0.8)',
      }}
    >
      {/* Número de cita + título */}
      <div className="flex items-start gap-3">
        <span
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: 'rgba(91, 141, 238, 0.15)', color: '#5b8dee' }}
        >
          {item.citationNumber}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 leading-snug">
            {item.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.authors} · {item.year}
          </p>
        </div>
      </div>

      {/* Snippet / cita exacta del paper */}
      {item.snippet && (
        <blockquote
          className="text-xs text-slate-400 leading-relaxed italic border-l-2 pl-3"
          style={{ borderColor: 'rgba(91, 141, 238, 0.4)' }}
        >
          "{item.snippet.length > 400 ? item.snippet.slice(0, 400) + '…' : item.snippet}"
        </blockquote>
      )}

      {/* Pie: página + enlace al PDF */}
      <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'rgba(30,42,63,0.6)' }}>
        <span className="text-xs text-slate-600">
          {item.page ? `p. ${item.page}` : item.filename.slice(0, 40)}
        </span>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(91, 141, 238, 0.12)',
            color: '#5b8dee',
            border: '1px solid rgba(91, 141, 238, 0.25)',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(91, 141, 238, 0.22)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(91, 141, 238, 0.12)';
          }}
        >
          <ExternalLink size={11} />
          Abrir paper{item.page ? ` · p.${item.page}` : ''}
        </a>
      </div>
    </div>
  );
}
