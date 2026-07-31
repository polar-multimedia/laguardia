/**
 * Visor de PDF usando PDF.js.
 * Abre el documento en la página exacta citada por Clara.
 * El snippet queda visible en pantalla con resaltado visual.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EvidenceItem } from '../lib/types';

interface PdfViewerProps {
  item: EvidenceItem;
  onClose: () => void;
}

export function PdfViewer({ item, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(item.page ?? 1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // En dev: VITE_API_URL está vacío → URL relativa → Vite la proxea a localhost:3001
  // En prod: VITE_API_URL = https://clara-server.up.railway.app
  const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  const pdfUrl = `${apiBase}/pdf/${encodeURIComponent(item.filename)}`;

  // Cargar PDF.js y el documento
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);

        // Importar PDF.js dinámicamente
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const doc = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        setPdf(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('[PdfViewer] Error cargando PDF:', err);
          setError('No se pudo cargar el documento.');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Renderizar página cuando cambia el PDF o el número de página
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;

    async function renderPage() {
      try {
        const page = await pdf.getPage(currentPage);
        if (cancelled || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) console.error('[PdfViewer] Error renderizando página:', err);
      }
    }

    renderPage();
    return () => { cancelled = true; };
  }, [pdf, currentPage]);

  function prevPage() { if (currentPage > 1) setCurrentPage((p) => p - 1); }
  function nextPage() { if (currentPage < totalPages) setCurrentPage((p) => p + 1); }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: 'rgba(15,21,33,0.98)', borderColor: 'rgba(30,42,63,0.8)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Evidencia
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-300 truncate">{item.title}</p>
          <p className="text-xs text-slate-500">{item.authors} · {item.year}</p>
        </div>

        <a
          href={pdfUrl}
          download={item.filename}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-all"
          style={{
            background: 'rgba(91,141,238,0.1)',
            color: '#5b8dee',
            border: '1px solid rgba(91,141,238,0.2)',
          }}
        >
          <Download size={12} />
          Descargar
        </a>
      </div>

      {/* Snippet citado */}
      {item.snippet && (
        <div
          className="px-4 py-2.5 text-xs text-slate-400 italic border-b"
          style={{
            background: 'rgba(91,141,238,0.04)',
            borderColor: 'rgba(91,141,238,0.15)',
          }}
        >
          <span className="text-blue-500 not-italic font-medium">Fragmento citado: </span>
          "{item.snippet.length > 200 ? item.snippet.slice(0, 200) + '…' : item.snippet}"
        </div>
      )}

      {/* PDF canvas */}
      <div
        className="flex-1 overflow-auto flex flex-col items-center py-4"
        style={{ background: '#1a1a2e' }}
      >
        {loading && (
          <div className="flex items-center gap-2 text-slate-400 mt-12">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando documento...</span>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm mt-12">{error}</div>
        )}

        {!loading && !error && (
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded"
            style={{ maxWidth: '100%' }}
          />
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div
          className="flex items-center justify-center gap-4 py-3 border-t flex-shrink-0"
          style={{ background: 'rgba(15,21,33,0.98)', borderColor: 'rgba(30,42,63,0.8)' }}
        >
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 transition-all text-slate-400 hover:text-slate-200"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-500">
            Página <strong className="text-slate-300">{currentPage}</strong> de {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30 transition-all text-slate-400 hover:text-slate-200"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
