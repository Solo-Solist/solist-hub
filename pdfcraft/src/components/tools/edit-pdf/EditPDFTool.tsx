'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LegacyAnnotatorTool } from './LegacyAnnotatorTool';

export interface EditPDFToolProps {
  className?: string;
}

/**
 * EditPDFTool Component
 * 
 * Provides professional PDF direct in-place editing capabilities (live reflow,
 * font & typography styling, image replacement, find & replace) powered by
 * EditCore WASM, with seamless fallback to classic annotation mode.
 */
export function EditPDFTool({ className = '' }: EditPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.editPdf');
  const locale = useLocale();

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editMode, setEditMode] = useState<'direct' | 'annotator'>('direct');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Restore pending edit file passed from other tools (e.g. OCR)
  useEffect(() => {
    if (file) return;

    // Check in-memory transfer first
    if (typeof window !== 'undefined' && (window as any).__PDFCRAFT_PENDING_EDIT_FILE__ instanceof File) {
      const pendingFile = (window as any).__PDFCRAFT_PENDING_EDIT_FILE__ as File;
      (window as any).__PDFCRAFT_PENDING_EDIT_FILE__ = null;
      try {
        window.sessionStorage.removeItem('pdfcraft_pending_edit_file');
      } catch {}
      setFile(pendingFile);
      return;
    }

    // Check sessionStorage fallback
    if (typeof window !== 'undefined') {
      try {
        const stored = window.sessionStorage.getItem('pdfcraft_pending_edit_file');
        if (stored) {
          window.sessionStorage.removeItem('pdfcraft_pending_edit_file');
          const parsed = JSON.parse(stored);
          if (parsed?.data) {
            fetch(parsed.data)
              .then(res => res.blob())
              .then(blob => {
                const restoredFile = new File([blob], parsed.name || 'document.pdf', {
                  type: parsed.type || 'application/pdf',
                });
                setFile(restoredFile);
              })
              .catch(() => {});
          }
        }
      } catch {}
    }
  }, [file]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<File | null>(null);
  fileRef.current = file;

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setSavedNotice(null);
      setIsEditorReady(false);
    }
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setError(null);
    setIsEditorReady(false);
    setSavedNotice(null);
  }, []);

  // Send selected PDF to the Direct Editor iframe once loaded
  const sendPdfToIframe = useCallback(async () => {
    const currentFile = fileRef.current;
    if (!currentFile || !iframeRef.current?.contentWindow) return;

    try {
      const buffer = await currentFile.arrayBuffer();
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'PDFCRAFT_LOAD_PDF',
          payload: {
            name: currentFile.name,
            buffer,
          },
        },
        '*'
      );
    } catch (err) {
      console.error('[EditPDFTool] Failed to transfer PDF buffer to editor:', err);
    }
  }, []);

  // Send current theme to the direct editor iframe
  const sendThemeToIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const isDark = document.documentElement.classList.contains('dark');
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'PDFCRAFT_THEME_CHANGE',
        payload: { isDark },
      },
      '*'
    );
  }, []);

  // Listen for root document dark class changes and sync with iframe
  useEffect(() => {
    sendThemeToIframe();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          sendThemeToIframe();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [sendThemeToIframe]);

  const handleIframeLoad = useCallback(() => {
    sendThemeToIframe();
    sendPdfToIframe();
    setTimeout(() => {
      setIsEditorReady(true);
    }, 1200);
  }, [sendPdfToIframe, sendThemeToIframe]);

  // Listen for messages from direct editor iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, fileName, sizeKb } = event.data || {};
      if (type === 'PDFCRAFT_EDITOR_READY') {
        sendThemeToIframe();
        sendPdfToIframe();
      } else if (type === 'PDFCRAFT_LOADED_SUCCESS') {
        setIsEditorReady(true);
      } else if (type === 'PDFCRAFT_SAVE_SUCCESS') {
        setSavedNotice(
          `${fileName || 'Document'} saved successfully! (${sizeKb ? sizeKb + ' KB' : 'downloaded'})`
        );
        setTimeout(() => setSavedNotice(null), 6000);
      } else if (type === 'PDFCRAFT_EXIT_EDITOR') {
        handleClear();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleClear, sendPdfToIframe, sendThemeToIframe]);

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1 border border-gray-200 dark:border-gray-600 text-xs font-medium">
              <button
                type="button"
                onClick={() => setEditMode('direct')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  editMode === 'direct'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-gray-600 dark:text-gray-300 hover:text-blue-600'
                }`}
              >
                <span>✦</span>
                <span>{locale === 'zh' ? '直接编辑正文与图片' : 'Direct Content Edit'}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditMode('annotator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  editMode === 'annotator'
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-gray-600 dark:text-gray-300 hover:text-blue-600'
                }`}
              >
                <span>✎</span>
                <span>{locale === 'zh' ? '经典批注与涂鸦' : 'Classic Annotator'}</span>
              </button>
            </div>
          </div>

          <FileUploader
            accept={['application/pdf', '.pdf']}
            multiple={false}
            maxFiles={1}
            onFilesSelected={handleFilesSelected}
            onError={handleUploadError}
            label={tTools('uploadLabel')}
            description={tTools('uploadDescription')}
          />
        </div>
      )}

      {error && (
        <div
          className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700"
          role="alert"
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {file && (
        <div className="space-y-4">
          {/* File summary & mode switcher */}
          <Card variant="outlined" size="sm" className="bg-white/80 dark:bg-gray-800/80 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))] truncate max-w-[240px] sm:max-w-md">
                    {file.name}
                  </p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {/* Mode switch pills */}
              <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1 border border-gray-200 dark:border-gray-600 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setEditMode('direct')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                    editMode === 'direct'
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'text-gray-600 dark:text-gray-300 hover:text-blue-600'
                  }`}
                >
                  <span>✦</span>
                  <span>{locale === 'zh' ? '直接编辑正文与图片' : 'Direct Content Edit'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode('annotator')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                    editMode === 'annotator'
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'text-gray-600 dark:text-gray-300 hover:text-blue-600'
                  }`}
                >
                  <span>✎</span>
                  <span>{locale === 'zh' ? '经典批注与涂鸦' : 'Classic Annotator'}</span>
                </button>
              </div>

              <Button variant="ghost" size="sm" onClick={handleClear}>
                {t('buttons.clear') || 'Clear'}
              </Button>
            </div>
          </Card>

          {savedNotice && (
            <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-3">
              <p className="text-sm text-green-800 dark:text-green-300 font-medium">{savedNotice}</p>
            </div>
          )}

          {/* Direct In-place Text/Image Editor Mode */}
          {editMode === 'direct' && (
            <div className="relative border border-[hsl(var(--color-border))] rounded-2xl overflow-hidden bg-[hsl(var(--color-card))] shadow-sm">
              <iframe
                ref={iframeRef}
                src={`/direct-pdf-editor/index.html?lang=${encodeURIComponent(locale || 'en')}`}
                className="w-full h-[820px] border-0"
                title="PDF Editor"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                allow="local-fonts"
                onLoad={handleIframeLoad}
              />
              {!isEditorReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 z-10 backdrop-blur-md">
                  <div className="text-center p-6 rounded-2xl bg-white dark:bg-gray-900 border border-[hsl(var(--color-border))] shadow-lg">
                    <div className="animate-spin rounded-full h-9 w-9 border-2 border-blue-600 border-t-transparent mx-auto mb-3"></div>
                    <p className="text-sm font-semibold text-[hsl(var(--color-foreground))]">
                      {t('status.loading') || 'Loading...'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Classic Annotator Mode */}
          {editMode === 'annotator' && (
            <LegacyAnnotatorTool
              file={file}
              onFileChange={setFile}
              hideHeaderCard={true}
              onClear={handleClear}
              className="border-0 shadow-none p-0"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default EditPDFTool;
