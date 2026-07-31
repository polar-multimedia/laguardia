/**
 * Widget de evidencia científica.
 * Se muestra cuando Clara cita papers en su respuesta.
 * Cada tarjeta muestra: título, autores, año, snippet y botón para abrir el PDF en la página exacta.
 */
import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { EvidenceItem } from '../lib/types';
import { PdfViewer } from './PdfViewer';

interface EvidenceWidgetProps {
  evidence: EvidenceItem[];
  onClose: () => void;
}

export function EvidenceWidget({ evidence, onClose }: EvidenceWidgetProps) {
  const [selectedPdf, setSelectedPdf] = useState<EvidenceItem | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0); // primer paper abierto por defecto

  if (evidence.length === 0) return null;

  if (selectedPdf) {
    return (
      <PdfViewer
        item={selectedPdf}
        onClose={() => setSelectedPdf(null)}
      />
    );
  }

  return (
    <div
      className="slide-up flex flex-col gap-2 w-full max-h-[70vh] overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Evidencia científica
          </span>
          <span className="text-xs text-slate-500">
            {evidence.length} {evidence.length === 1 ? 'paper' : 'papers'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Cards */}
      {evidence.map((item, idx) => (
        <PaperCard
          key={item.file_id}
          item={item}
          isExpanded={expandedIdx === idx}
          onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
          onOpenPdf={() => setSelectedPdf(item)}
        />
      ))}
    </div>
  );
}

interface PaperCardProps {
  item: EvidenceItem;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPdf: () => void;
}

function PaperCard({ item, isExpanded, onToggle, onOpenPdf }: PaperCardProps) {
  return (
    <div
      className="rounded-xl border transition-all duration-200"
      style={{
        background: 'rgba(15, 21, 33, 0.95)',
        borderColor: isExpanded ? 'rgba(91, 141, 238, 0.35)' : 'rgba(30, 42, 63, 0.8)',
      }}
    >
      {/* Card header — siempre visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 leading-snug line-clamp-2">
            {item.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {item.authors} · {item.year}
          </p>
        </div>
        <div className="flex-shrink-0 mt-0.5 text-slate-500">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded: snippet + botón PDF */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: 'rgba(30, 42, 63, 0.6)' }}>
          {item.snippet && (
            <blockquote
              className="mt-3 text-xs text-slate-400 leading-relaxed italic border-l-2 pl-3"
              style={{ borderColor: 'rgba(91, 141, 238, 0.4)' }}
            >
              "{item.snippet.length > 300 ? item.snippet.slice(0, 300) + '…' : item.snippet}"
            </blockquote>
          )}

          <div className="flex items-center justify-between mt-3">
            {item.page && (
              <span className="text-xs text-slate-600">
                Página {item.page}
              </span>
            )}
            <button
              onClick={onOpenPdf}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'rgba(91, 141, 238, 0.12)',
                color: '#5b8dee',
                border: '1px solid rgba(91, 141, 238, 0.25)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(91, 141, 238, 0.22)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(91, 141, 238, 0.12)';
              }}
            >
              <FileText size={12} />
              Ver paper{item.page ? ` · p.${item.page}` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
