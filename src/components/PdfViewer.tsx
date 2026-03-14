import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

interface Props {
  data: string;
  name: string;
}

export default function PdfViewer({ data, name }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    const raw = data.includes(",") ? data.split(",")[1] : data;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    pdfjsLib.getDocument({ data: bytes }).promise.then((pdf) => {
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      renderPage(pdf, 1);
    });
  }, [data]);

  useEffect(() => {
    if (pdfRef.current) renderPage(pdfRef.current, currentPage);
  }, [currentPage, expanded]);

  const renderPage = async (
    pdf: pdfjsLib.PDFDocumentProxy,
    num: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const page = await pdf.getPage(num);
    const scale = expanded ? 1.5 : 0.8;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  };

  return (
    <div
      className="rounded-xl overflow-hidden border border-warm-400/10 mb-2"
      style={{ maxWidth: expanded ? "100%" : 280 }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: "rgb(var(--c-surface) / 0.8)" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: "rgb(var(--c-accent))", flexShrink: 0 }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span
          className="font-body text-xs truncate flex-1"
          style={{ color: "rgb(var(--c-text) / 0.7)" }}
        >
          {name}
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="icon-btn"
          style={{ width: 20, height: 20 }}
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {expanded ? (
              <polyline points="4 14 10 14 10 20" />
            ) : (
              <polyline points="15 3 21 3 21 9" />
            )}
          </svg>
        </button>
      </div>

      <div ref={containerRef} className="flex justify-center bg-white/5 p-2">
        <canvas ref={canvasRef} className="max-w-full" />
      </div>

      {pageCount > 1 && (
        <div
          className="flex items-center justify-center gap-3 py-2"
          style={{ background: "rgb(var(--c-surface) / 0.8)" }}
        >
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="icon-btn disabled:opacity-30"
            style={{ width: 24, height: 24 }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span
            className="font-body text-xs"
            style={{ color: "rgb(var(--c-muted))" }}
          >
            {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount}
            className="icon-btn disabled:opacity-30"
            style={{ width: 24, height: 24 }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
