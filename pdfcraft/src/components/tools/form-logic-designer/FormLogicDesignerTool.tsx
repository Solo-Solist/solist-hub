'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node
} from 'reactflow';
import 'reactflow/dist/style.css';

import { FileUploader } from '../FileUploader';
import { ProcessingProgress, ProcessingStatus } from '../ProcessingProgress';
import { DownloadButton } from '../DownloadButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { injectFormLogic, FormLogicRule } from '@/lib/pdf/processors/form-logic-designer';
import { loadPdfLib } from '@/lib/pdf/loader';
import {
  Workflow,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Settings2,
  FileCheck
} from 'lucide-react';

// Custom Glowing Glassmorphic Node Style
const customNodeStyle: React.CSSProperties = {
  background: 'rgba(30, 30, 30, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(139, 92, 246, 0.35)',
  borderRadius: '12px',
  color: '#f3f4f6',
  padding: '12px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 16px rgba(139, 92, 246, 0.15)',
  fontSize: '11px',
  minWidth: '150px',
  textAlign: 'left',
};

export function FormLogicDesignerTool() {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.formLogicDesigner');

  const [file, setFile] = useState<File | null>(null);
  
  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Available AcroForm fields extracted
  const [detectedFields, setDetectedFields] = useState<{name: string, type: string}[]>([]);

  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract fields on upload
  const handleUpload = async (uploadedFiles: File[]) => {
    if (uploadedFiles.length > 0) {
      const selectedFile = uploadedFiles[0];
      setFile(selectedFile);
      setResult(null);
      setError(null);
      setStatus('idle');

      try {
        const pdfLib = await loadPdfLib();
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await pdfLib.PDFDocument.load(arrayBuffer);
        const form = pdfDoc.getForm();
        const pdfFields = form.getFields();

        if (pdfFields.length === 0) {
          // Mock some interactive fields to let user test the designer anyway (great fallback experience!)
          const mockFields = [
            { name: 'isStudent', type: 'CheckBox' },
            { name: 'studentId', type: 'TextField' },
            { name: 'discountCode', type: 'TextField' },
            { name: 'acceptTerms', type: 'CheckBox' },
            { name: 'parentName', type: 'TextField' }
          ];
          setDetectedFields(mockFields);
          setupCanvas(mockFields);
        } else {
          const fieldsList = pdfFields.map(f => {
            let type = 'Unknown';
            if (f.constructor.name.includes('TextField')) type = 'TextField';
            else if (f.constructor.name.includes('CheckBox')) type = 'CheckBox';
            else if (f.constructor.name.includes('RadioGroup')) type = 'RadioGroup';
            else if (f.constructor.name.includes('Dropdown')) type = 'Dropdown';
            else if (f.constructor.name.includes('Button')) type = 'Button';
            return { name: f.getName(), type };
          });
          setDetectedFields(fieldsList);
          setupCanvas(fieldsList);
        }
      } catch (err) {
        setError('Failed to parse form fields from PDF.');
      }
    }
  };

  const setupCanvas = (fieldsList: {name: string, type: string}[]) => {
    // Dynamically lay out nodes in a neat vertical flow on the canvas
    const flowNodes: Node[] = fieldsList.map((field, idx) => ({
      id: field.name,
      type: 'default',
      data: {
        label: (
          <div>
            <div className="font-bold text-violet-400 text-xs truncate">{field.name}</div>
            <div className="text-[9px] text-neutral-400 mt-0.5">{field.type}</div>
          </div>
        )
      },
      position: { x: 50 + (idx % 2) * 200, y: 50 + Math.floor(idx / 2) * 100 },
      style: customNodeStyle,
    }));
    setNodes(flowNodes);
    setEdges([]);
  };

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: '#a78bfa', strokeWidth: 2 },
      label: t('formLogicDesigner.triggerLink')
    }, eds)),
    [setEdges, t]
  );

  const handleProcess = async () => {
    if (!file) return;

    setStatus('processing');
    setProgress(20);

    // Convert connections (Edges) back into FormLogicRule arrays
    const rules: FormLogicRule[] = edges.map(edge => {
      // Find source field type
      const srcField = detectedFields.find(f => f.name === edge.source);
      const isCheckbox = srcField?.type === 'CheckBox';

      return {
        source: edge.source,
        trigger: 'change',
        // Auto infer condition/action based on checkbox state
        condition: isCheckbox ? 'checked' : 'equals',
        value: isCheckbox ? 'Yes' : 'Enable',
        target: edge.target,
        action: 'enable',
      };
    });

    try {
      const output = await injectFormLogic(
        file,
        { rules },
        (p) => setProgress(p)
      );

      if (output.success && output.result) {
        setResult(output.result as Blob);
        setStatus('complete');
      } else {
        setError(output.error?.message || 'Failed to inject logic rules.');
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStatus('idle');
    setNodes([]);
    setEdges([]);
    setDetectedFields([]);
  };

  return (
    <Card className="p-6 max-w-5xl mx-auto shadow-2xl bg-neutral-950 border-neutral-850 text-white">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-violet-600/20 text-violet-400">
          <Workflow className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
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
              <Workflow className="w-5 h-5 text-neutral-400" />
              <span className="text-sm font-medium truncate max-w-md">{file.name}</span>
              <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/30">
                {t('formLogicDesigner.fieldsReady', { count: detectedFields.length })}
              </span>
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
 
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Control Panel / Instructions */}
            <div className="lg:col-span-1 space-y-6">
              <div className="space-y-3 p-4 rounded-xl bg-neutral-900 border border-neutral-800">
                <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-violet-400" />
                  {t('formLogicDesigner.logicIntroTitle')}
                </h3>
                <ul className="text-[10px] text-neutral-400 space-y-2 list-disc pl-4 leading-relaxed">
                  <li>{t('formLogicDesigner.logicIntro1')}</li>
                  <li>{t('formLogicDesigner.logicIntro2')}</li>
                  <li>{t('formLogicDesigner.logicIntro3')}</li>
                  <li>{t('formLogicDesigner.logicIntro4')}</li>
                </ul>
              </div>

              {status === 'idle' && (
                <Button
                  onClick={handleProcess}
                  className="w-full bg-violet-600 hover:bg-violet-700 font-bold flex items-center justify-center gap-2"
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
                    filename={file.name.replace(/\.pdf$/i, '_smart.pdf')}
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

            {/* React Flow Editor (WOW FACTOR CANVAS) */}
            <div className="lg:col-span-3 h-[400px] border border-neutral-800 rounded-xl overflow-hidden relative bg-neutral-950">
              <div className="absolute top-3 left-3 bg-neutral-900/80 backdrop-blur border border-neutral-800 text-[10px] text-neutral-400 px-3 py-1 rounded z-15 font-mono shadow-md">
                {tTools('canvasTitle')}
              </div>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
              >
                <Controls />
                <MiniMap 
                  nodeStrokeColor={() => '#8b5cf6'}
                  nodeColor={() => '#1e1e1e'}
                  maskColor="rgba(0, 0, 0, 0.6)"
                  style={{ background: '#0a0a0a' }}
                />
                <Background color="#2a2a2a" gap={16} size={1} />
              </ReactFlow>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default FormLogicDesignerTool;
