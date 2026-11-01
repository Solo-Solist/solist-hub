'use client';

import React, { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { encryptAndSignCert } from '@/lib/pdf/processors/cert-cryptor';
import {
  LockKeyhole,
  Award,
  Sparkles,
  Key,
  Stamp,
  RotateCcw,
  BookOpen
} from 'lucide-react';

export function CertCryptorTool() {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.certCryptor');

  const [file, setFile] = useState<File | null>(null);
  const [waxColor, setWaxColor] = useState<'gold' | 'red' | 'bronze'>('gold');
  const [pfxPassword, setPfxPassword] = useState('');
  const [encryptWithCert, setEncryptWithCert] = useState(false);

  // Position of the wax seal on the page preview (WOW factor interactive placement)
  const [sealPos, setSealPos] = useState({ x: 120, y: 150 });
  const previewRef = useRef<HTMLDivElement>(null);

  // 3D stamping animation state
  const [stampState, setStampState] = useState<'idle' | 'descending' | 'pressing' | 'stamped'>('idle');

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      setFile(uploadedFiles[0]);
      setResult(null);
      setError(null);
      setStatus('idle');
      setStampState('idle');
    }
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    if (!previewRef.current || stampState === 'descending' || stampState === 'pressing') return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSealPos({ x: Math.round(x), y: Math.round(y) });
  };

  const handleProcess = async () => {
    if (!file) return;

    // Start 3D stamp descent ceremony
    setStampState('descending');
    setStatus('processing');
    setProgress(20);

    // Audio cue fallback or timing events for WOW effect animation
    setTimeout(() => {
      setStampState('pressing');
      setProgress(50);
      
      setTimeout(async () => {
        try {
          // Translate UI coordinates (relative to 300x400 preview) back to actual standard A4 PDF coordinates (approx 595x841)
          const pdfX = (sealPos.x / 300) * 595.276;
          // PDF origin is bottom-left, UI preview is top-left
          const pdfY = 841.89 - ((sealPos.y / 400) * 841.89);

          const output = await encryptAndSignCert(
            file,
            {
              waxColor,
              sealPage: 0,
              sealX: pdfX,
              sealY: pdfY,
              pfxPassword: pfxPassword || 'pdfcraft',
              encryptWithCert,
            },
            (p) => setProgress(Math.max(50, p))
          );

          if (output.success && output.result) {
            setResult(output.result as Blob);
            setStatus('complete');
            setStampState('stamped');
          } else {
            setError(output.error?.message || 'Failed to apply wax seal encryption.');
            setStatus('error');
            setStampState('idle');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred.');
          setStatus('error');
          setStampState('idle');
        }
      }, 1000);
    }, 1200);
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setStampState('idle');
    setSealPos({ x: 120, y: 150 });
  };

  return (
    <Card className="p-6 max-w-4xl mx-auto shadow-2xl bg-neutral-950 border-neutral-850 text-white">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-yellow-600/20 text-yellow-400">
          <LockKeyhole className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
            {tTools('optionsTitle')}
          </h2>
          <p className="text-xs text-neutral-400">
            {tTools('uploadDescription')}
          </p>
        </div>
      </div>

      {!file ? (
        <FileUploader
          accept={['.pdf']}
          onFilesSelected={handleUpload}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-850">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-neutral-400" />
              <span className="text-sm font-medium truncate max-w-md">{file.name}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-xs border-neutral-800 text-neutral-300 hover:bg-neutral-800"
            >
              {t('buttons.reset')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Control Panel */}
            <div className="space-y-6">
              {/* Wax color selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Stamp className="w-4 h-4 text-yellow-400" />
                  {tTools('waxColor')}{t('certCryptor.waxStyleSuffix')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gold', label: t('certCryptor.goldWax'), bg: 'bg-yellow-600 border-yellow-500 text-yellow-100' },
                    { id: 'red', label: t('certCryptor.redWax'), bg: 'bg-red-700 border-red-600 text-red-100' },
                    { id: 'bronze', label: t('certCryptor.bronzeWax'), bg: 'bg-amber-800 border-amber-700 text-amber-100' }
                  ].map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setWaxColor(color.id as any)}
                      className={`p-2 text-xs rounded-lg border text-center transition-all ${
                        waxColor === color.id
                          ? `${color.bg} scale-105 shadow-lg border-opacity-100`
                          : 'border-neutral-800 bg-neutral-900 text-neutral-400 border-opacity-40'
                      }`}
                    >
                      {color.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Encryption settings */}
              <div className="space-y-4 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 cursor-pointer">
                    <Key className="w-4 h-4 text-yellow-400" />
                    {t('certCryptor.enableDoubleKey')}
                  </label>
                  <input
                    type="checkbox"
                    checked={encryptWithCert}
                    onChange={(e) => setEncryptWithCert(e.target.checked)}
                    className="w-4 h-4 rounded text-yellow-500 bg-neutral-800 border-neutral-700 focus:ring-yellow-500 accent-yellow-500"
                  />
                </div>
                
                {encryptWithCert && (
                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                    <label className="text-[10px] text-neutral-400">{t('certCryptor.decryptPasswordHelp')}</label>
                    <input
                      type="password"
                      placeholder={t('certCryptor.passwordPlaceholder')}
                      value={pfxPassword}
                      onChange={(e) => setPfxPassword(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-850 rounded p-2 text-xs text-white focus:outline-none focus:border-yellow-500"
                    />
                  </div>
                )}
              </div>

              {/* Process button */}
              {status === 'idle' && (
                <Button
                  onClick={handleProcess}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 font-bold flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {tTools('processButton')}
                </Button>
              )}

              {status === 'processing' && (
                <ProcessingProgress progress={progress} status={status} />
              )}

              {status === 'complete' && result && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm text-center">
                    {tTools('successMessage')}
                  </div>
                  <DownloadButton
                    file={result}
                    filename={file.name.replace(/\.pdf$/i, '_signed.pdf')}
                    className="w-full bg-green-600 hover:bg-green-700 font-bold"
                  />
                </div>
              )}

              {status === 'error' && error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>

            {/* Right: PDF Page Preview with 3D Stamp Dropdown Ceremony (WOW FACTOR) */}
            <div className="space-y-3">
              <div className="text-xs text-neutral-400 flex items-center justify-between">
                <span>{t('certCryptor.sealCoordinates', { x: sealPos.x, y: sealPos.y })}</span>
                <span>{t('certCryptor.clickToReposition')}</span>
              </div>

              <div 
                ref={previewRef}
                onClick={handlePreviewClick}
                className="relative w-[300px] h-[400px] bg-white rounded-lg mx-auto overflow-hidden shadow-2xl border border-neutral-750 flex flex-col justify-between p-6 select-none"
              >
                {/* Mock document layout */}
                <div className="space-y-2 pointer-events-none">
                  <div className="h-4 w-2/3 bg-neutral-200 rounded" />
                  <div className="h-3 w-5/6 bg-neutral-100 rounded" />
                  <div className="h-3 w-full bg-neutral-100 rounded" />
                  <div className="h-3 w-4/5 bg-neutral-100 rounded" />
                </div>

                <div className="space-y-2 pointer-events-none mt-12 text-center text-[10px] text-neutral-400 border-t border-neutral-100 pt-10">
                  <p className="font-serif italic font-bold">CERTIFICATE OF INTEGRITY & TRUST</p>
                  <p className="scale-90 opacity-75">All properties verified & digitally locked by Public Key Infrastructure.</p>
                </div>

                {/* The 3D Wax Seal Placement / Imprinted Graphic */}
                {(stampState === 'idle' || stampState === 'stamped') && (
                  <div 
                    className="absolute pointer-events-none rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      left: `${sealPos.x - 30}px`,
                      top: `${sealPos.y - 30}px`,
                      width: '60px',
                      height: '60px',
                    }}
                  >
                    {/* Rendered stamp */}
                    <div 
                      className={`w-full h-full rounded-full flex items-center justify-center shadow-lg border-2 ${
                        waxColor === 'gold' ? 'bg-yellow-600 border-yellow-400 text-yellow-100 shadow-yellow-600/30' :
                        waxColor === 'red' ? 'bg-red-700 border-red-500 text-red-100 shadow-red-700/30' :
                        'bg-amber-800 border-amber-600 text-amber-100 shadow-amber-850/30'
                      }`}
                      style={{
                        transform: stampState === 'stamped' ? 'scale(1)' : 'scale(0.85) rotate(-15deg)',
                        boxShadow: 'inset -3px -3px 8px rgba(0,0,0,0.3), inset 3px 3px 8px rgba(255,255,255,0.4)',
                        borderWidth: '3px'
                      }}
                    >
                      <Award className="w-5 h-5 animate-pulse" />
                    </div>
                  </div>
                )}

                {/* 3D Falling Stamp Animation (WOW FACTOR IN ACTION) */}
                {(stampState === 'descending' || stampState === 'pressing') && (
                  <div 
                    className="absolute pointer-events-none z-20 flex items-center justify-center"
                    style={{
                      left: `${sealPos.x - 35}px`,
                      top: stampState === 'descending' ? '-100px' : `${sealPos.y - 35}px`,
                      width: '70px',
                      height: '70px',
                      perspective: '800px',
                      transition: 'top 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)', // physics bounce
                    }}
                  >
                    {/* Metal handle and base seal */}
                    <div 
                      className="w-full h-full flex flex-col items-center justify-end"
                      style={{
                        transformStyle: 'preserve-3d',
                        transform: 'rotateX(20deg) rotateY(-10deg) rotateZ(35deg)',
                        animation: stampState === 'pressing' ? 'stamp-press 0.4s ease-out forwards' : 'none',
                      }}
                    >
                      {/* Wooden handle handle */}
                      <div className="h-10 w-4 bg-amber-700 rounded-t-xl shadow-inner border border-amber-800" />
                      {/* Brass metal stamp base */}
                      <div className="h-4 w-10 bg-yellow-500 border border-yellow-400 rounded-lg shadow-lg flex items-center justify-center font-bold text-[8px] text-yellow-900">
                        SIG
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default CertCryptorTool;
