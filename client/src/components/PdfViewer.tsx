/**
 * Abre el PDF del corpus en una nueva pestaña del navegador.
 * El servidor sirve los PDFs desde /pdf/:filename
 *
 * En producción el cliente está en Vercel y el servidor en Railway,
 * por lo que hay que usar la URL absoluta del servidor derivada de VITE_WS_URL.
 * En desarrollo, vite.config.ts proxía /pdf → localhost:3001.
 */
import { useEffect } from 'react';
import type { EvidenceItem } from '../lib/types';

// Derivar la URL base del servidor (HTTP/HTTPS) a partir de la URL WebSocket
const SERVER_BASE_URL = (() => {
  const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (wsUrl) {
    return wsUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/api\/realtime$/, '');
  }
  // En dev (sin VITE_WS_URL) usar ruta relativa: vite proxy se encarga
  return '';
})();

interface PdfViewerProps {
  item: EvidenceItem;
  onClose: () => void;
}

export function PdfViewer({ item, onClose }: PdfViewerProps) {
  useEffect(() => {
    const url = `${SERVER_BASE_URL}/pdf/${encodeURIComponent(item.filename)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose(); // volver al listado de papers inmediatamente
  }, []);

  return null;
}
