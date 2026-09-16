import React, { useState, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { Button } from './ui/Button';
import { Loader2, UploadCloud, CheckCircle2, AlertCircle, File, X, Building2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface ManualOscIngestProps {
  onSuccess?: (oscId: string) => void;
}

export function ManualOscIngest({ onSuccess }: ManualOscIngestProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [ingestMode, setIngestMode] = useState<'cnpj' | 'pdf'>('cnpj');
  const [cnpjInput, setCnpjInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<{type: 'success' | 'error', message: string, profile?: any, oscId?: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(files.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    if (ingestMode === 'pdf' && files.length === 0) return;
    if (ingestMode === 'cnpj' && cnpjInput.replace(/\D/g, '').length !== 14) {
        setResult({ type: 'error', message: 'Por favor, insira um CNPJ válido com 14 dígitos.' });
        return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      if (ingestMode === 'pdf') {
          const timestamp = Date.now();
          const storagePaths: string[] = [];

          // 1. Upload files to Firebase Storage
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const path = `temp_osc_docs/${timestamp}/${file.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            storagePaths.push(path);
          }

          // 2. Call backend function with storage paths
          const ingestManualOsc = httpsCallable(functions, 'ingestManualOscFunction');
          const response = await ingestManualOsc({ storagePaths });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = response.data as { success: boolean; oscId?: string; profile?: any; message?: string };

          if (data.success) {
            setResult({
              type: 'success',
              message: 'OSC processada com sucesso!',
              profile: data.profile,
              oscId: data.oscId
            });
            // Form Clearing Bug Fix: Do not clear files automatically
          } else {
            setResult({
              type: 'error',
              message: data.message || 'Erro desconhecido ao processar os arquivos.'
            });
          }
      } else {
          // CNPJ Fast-Track mode
          const ingestSingleOscByCnpj = httpsCallable(functions, 'ingestSingleOscByCnpj');
          const response = await ingestSingleOscByCnpj({ cnpj: cnpjInput });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = response.data as { success: boolean; oscId?: string; profile?: any; message?: string };

          if (data.success) {
            setResult({
              type: 'success',
              message: data.message || 'OSC cadastrada com sucesso via Receita Federal!',
              profile: data.profile,
              oscId: data.oscId
            });
          } else {
            setResult({
              type: 'error',
              message: data.message || 'Erro desconhecido ao buscar o CNPJ.'
            });
          }
      }
    } catch (error: unknown) {
      console.error("Error processing manual OSC:", error);
      setResult({
        type: 'error',
        message: error instanceof Error ? error.message : 'Erro interno ao se comunicar com o servidor.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Onboarding VIP de OSC</h1>
        <p className="text-muted-foreground">Cadastre o perfil da OSC de forma rápida via CNPJ ou completa através de PDFs.</p>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col space-y-6">

        {!result?.profile && (
          <>
            <div className="flex space-x-4 mb-2 p-1 bg-muted rounded-lg">
                <button
                    onClick={() => { setIngestMode('cnpj'); setResult(null); }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${ingestMode === 'cnpj' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Cadastro Rápido (Só CNPJ)
                </button>
                <button
                    onClick={() => { setIngestMode('pdf'); setResult(null); }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${ingestMode === 'pdf' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                    Cadastro Completo (PDFs)
                </button>
            </div>

            {ingestMode === 'cnpj' ? (
                <div className="flex flex-col space-y-4">
                    <div className="p-6 border rounded-lg bg-muted/20 text-center">
                        <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium">Busca Automática na Receita Federal</h3>
                        <p className="text-sm text-muted-foreground mt-1">Basta informar o CNPJ para preenchermos os dados básicos da OSC.</p>

                        <div className="mt-6 max-w-sm mx-auto">
                            <input
                                type="text"
                                placeholder="Digite o CNPJ (apenas números)"
                                value={cnpjInput}
                                onChange={(e) => setCnpjInput(e.target.value.replace(/\D/g, '').substring(0, 14))}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-center text-lg tracking-widest"
                                disabled={isProcessing}
                            />
                        </div>
                    </div>
                </div>
            ) : (
              <>
                <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 border-border'}`}
            >
              <input
                type="file"
                multiple
                accept="application/pdf"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                style={{ display: 'none' }}
              />
              <UploadCloud className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">Arraste e solte seus PDFs aqui ou clique para procurar</p>
              <p className="text-sm text-muted-foreground mt-1">Apenas arquivos .pdf são suportados</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Arquivos selecionados:</h3>
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li key={index} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <div className="flex items-center">
                        <File className="w-4 h-4 mr-2 text-primary" />
                        <span className="text-sm">{file.name}</span>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        disabled={isProcessing}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            </>
            )}

            <Button
              onClick={handleSubmit}
              disabled={isProcessing || (ingestMode === 'pdf' && files.length === 0) || (ingestMode === 'cnpj' && cnpjInput.length < 14)}
              className="w-full py-6 text-lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {ingestMode === 'pdf' ? 'Processando com IA...' : 'Buscando dados na Receita Federal...'}
                </>
              ) : (
                ingestMode === 'pdf' ? 'Extrair Perfil Mágico' : 'Buscar e Cadastrar OSC'
              )}
            </Button>
          </>
        )}

        {result && (
          <div className={`mt-6 p-4 rounded-md border flex items-start ${
            result.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }`}>
            {result.type === 'success' ? (
              <CheckCircle2 className="w-6 h-6 mr-3 shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 mr-3 shrink-0" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold">{result.type === 'success' ? 'Sucesso' : 'Erro'}</h4>
              <p className="text-sm mt-1">{result.message}</p>
            </div>
          </div>
        )}

        {result?.type === 'success' && result.profile && (
          <div className="mt-8 border rounded-lg p-6 bg-muted/20">
            <h3 className="text-xl font-bold mb-4">Preview do Perfil da OSC</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nome da OSC</p>
                <p className="font-medium">{result.profile.name || 'Não encontrado'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CNPJ</p>
                <p className="font-medium">{result.profile.cnpj || 'Não encontrado'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground">Missão / Foco de Atuação</p>
                <p className="font-medium">{result.profile.mission || 'Não encontrado'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Validade da Diretoria</p>
                <p className="font-medium">{result.profile.boardValidity || 'Não encontrado'}</p>
              </div>
            </div>

            <Button
              className="w-full mt-6 text-lg py-6 bg-brand-orange hover:bg-brand-orange/90 text-white"
              onClick={() => {
                if (onSuccess && result.oscId) {
                  onSuccess(result.oscId);
                } else {
                  if (location.pathname.startsWith('/portal')) {
                    navigate(`/portal/discover?oscId=${result.oscId}`);
                  } else {
                    navigate(`/admin/radar?oscId=${result.oscId}`);
                  }
                }
              }}
            >
              Acessar Painel da OSC
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
