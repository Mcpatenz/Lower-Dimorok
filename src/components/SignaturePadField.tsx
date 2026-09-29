import React, { useRef, useState } from 'react';
import { CheckCircle2, FileUp, PenTool, RotateCcw } from 'lucide-react';
import { createSignatureSvgDataUrl } from '../utils/certificateWorkflow.ts';

interface SignaturePadFieldProps {
  roleLabel: string;
  signerName: string;
  strokeColor?: string;
  signatureDataUrl: string;
  onChangeSignature: (dataUrl: string) => void;
}

export const SignaturePadField: React.FC<SignaturePadFieldProps> = ({
  roleLabel,
  signerName,
  strokeColor = '#065f46',
  signatureDataUrl,
  onChangeSignature,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'seal' | 'draw' | 'upload'>('seal');

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, canvas);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChangeSignature(canvas.toDataURL('image/png'));
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    onChangeSignature('');
  };

  const handleApplyDigitalSeal = () => {
    const generated = createSignatureSvgDataUrl(signerName, roleLabel, strokeColor);
    onChangeSignature(generated);
  };

  const handleUploadSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeSignature(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-slate-900 dark:text-white block">
            {roleLabel} Digital Signature Attachment
          </span>
          <span className="text-[11px] text-slate-500">
            Signatory: <strong>{signerName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode('seal');
              handleApplyDigitalSeal();
            }}
            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
              mode === 'seal' && signatureDataUrl
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Attach Official E-Signature</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
              mode === 'draw'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-700'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Sign on Pad</span>
          </button>

          <label className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer flex items-center gap-1">
            <FileUp className="w-3.5 h-3.5" />
            <span>Upload Signature</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setMode('upload');
                handleUploadSignatureFile(e);
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {mode === 'draw' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Draw your official signature inside the box below:</span>
            <button
              type="button"
              onClick={handleClearCanvas}
              className="text-red-600 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear Pad</span>
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={340}
            height={110}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
            className="w-full max-w-[340px] h-[110px] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white cursor-crosshair touch-none"
          />
        </div>
      )}

      {signatureDataUrl ? (
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
          <div className="flex items-center gap-3">
            <img
              src={signatureDataUrl}
              alt={`${roleLabel} signature`}
              className="h-14 w-auto rounded bg-white border border-slate-200 px-2 py-1 object-contain"
            />
            <div className="text-xs">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Signature Attached & Ready
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                {signerName} ({roleLabel})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChangeSignature('')}
            className="px-2 py-1 text-[11px] font-semibold text-red-600 hover:underline cursor-pointer"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
          <span>
            Please attach or sign your <strong>{roleLabel}</strong> signature before proceeding.
          </span>
          <button
            type="button"
            onClick={handleApplyDigitalSeal}
            className="px-2.5 py-1 rounded-md bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-[11px] shrink-0 cursor-pointer"
          >
            Quick Sign Now
          </button>
        </div>
      )}
    </div>
  );
};
