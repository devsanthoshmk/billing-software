'use client';

import React, { useState, useEffect } from 'react';
import { DosModal } from '@/components/ui/DosModal';
import { PrintInvoiceData, formatThermalReceipt40, formatDotMatrixInvoice80 } from '@/lib/print';

export interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: PrintInvoiceData | null;
  initialFormat?: 'thermal-40' | 'dotmatrix-80';
}

export function PrintPreviewModal({
  isOpen,
  onClose,
  invoiceData,
  initialFormat = 'dotmatrix-80',
}: PrintPreviewModalProps) {
  const [format, setFormat] = useState<'thermal-40' | 'dotmatrix-80'>(initialFormat);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    setFormat(initialFormat);
  }, [initialFormat, isOpen]);

  if (!invoiceData) return null;

  const asciiText =
    format === 'thermal-40'
      ? formatThermalReceipt40(invoiceData)
      : formatDotMatrixInvoice80(invoiceData);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>PRINT - ${invoiceData.invoiceNo}</title>
          <style>
            @page {
              margin: ${format === 'thermal-40' ? '2mm' : '10mm'};
              size: ${format === 'thermal-40' ? '80mm auto' : 'auto'};
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: ${format === 'thermal-40' ? '12px' : '11px'};
              line-height: 1.15;
              white-space: pre;
              margin: 0;
              padding: 4px;
            }
          </style>
        </head>
        <body>${asciiText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleDownloadPrn = () => {
    const rawData =
      format === 'thermal-40'
        ? formatThermalReceipt40(invoiceData, { rawEscPos: true })
        : formatDotMatrixInvoice80(invoiceData, { rawEscP: true });

    const blob = new Blob([rawData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceData.invoiceNo}_${format}.prn`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(asciiText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (e) {
      console.error('Failed to copy print text', e);
    }
  };

  // Keyboard shortcut listener for F2, F3, F4, 1, 2
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'F3') {
        e.preventDefault();
        handleDownloadPrn();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleCopyText();
      } else if (e.key === '1') {
        setFormat('thermal-40');
      } else if (e.key === '2') {
        setFormat('dotmatrix-80');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, format, invoiceData, asciiText]);

  return (
    <DosModal
      isOpen={isOpen}
      onClose={onClose}
      title={`PRINT PREVIEW & ESC/POS FORMATTER - [${invoiceData.invoiceNo}]`}
      width="max-w-4xl"
      cancelText="[ESC: Close]"
      actions={[
        { keyLabel: 'F2', label: 'Print (Browser)', onClick: handlePrint },
        { keyLabel: 'F3', label: 'Download .PRN', onClick: handleDownloadPrn },
        { keyLabel: 'F4', label: copyFeedback ? 'COPIED!' : 'Copy Text', onClick: handleCopyText },
      ]}
    >
      <div className="flex flex-col gap-3">
        {/* Format Selector Bar */}
        <div className="flex items-center justify-between border-b border-brand-border pb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-700">OUTPUT LAYOUT:</span>
            <button
              type="button"
              onClick={() => setFormat('dotmatrix-80')}
              className={`px-3 py-1 font-mono text-xs font-bold border ${
                format === 'dotmatrix-80'
                  ? 'bg-brand-ink text-white border-brand-ink'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              [2] 80-COL WHOLESALE DOT-MATRIX (A4/10x12)
            </button>
            <button
              type="button"
              onClick={() => setFormat('thermal-40')}
              className={`px-3 py-1 font-mono text-xs font-bold border ${
                format === 'thermal-40'
                  ? 'bg-brand-ink text-white border-brand-ink'
                  : 'bg-white text-brand-ink border-brand-border hover:bg-gray-100'
              }`}
            >
              [1] 40-COL THERMAL RECEIPT (3-INCH / 80MM)
            </button>
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {format === 'thermal-40' ? 'Format: 40 Chars / Line' : 'Format: 80 Chars / Line (Epson Standard)'}
          </div>
        </div>

        {/* Monospace Preview Box */}
        <div className="bg-black text-green-400 p-4 font-mono text-xs overflow-x-auto max-h-[55vh] border border-gray-700 select-text leading-tight whitespace-pre font-normal shadow-inner">
          {asciiText}
        </div>
      </div>
    </DosModal>
  );
}
