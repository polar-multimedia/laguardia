/**
 * Abre el PDF del corpus en una nueva pestaña del navegador.
 * El servidor sirve los PDFs desde /pdf/:filename
 */
import { useEffect } from 'react';
import type { EvidenceItem } from '../lib/types';

interface PdfViewerProps {
  item: EvidenceItem;
  onClose: () => void;
}

export function PdfViewer({ item, onClose }: PdfViewerProps) {
  useEffect(() => {
    const url = `/pdf/${encodeURIComponent(item.filename)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose(); // volver al listado de papers inmediatamente
  }, []);

  return null;
}
