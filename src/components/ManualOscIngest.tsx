import React, { useState, useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { Button } from './ui/Button';
import { Loader2, UploadCloud, CheckCircle2, AlertCircle, File, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function ManualOscIngest() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
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
    if (files.length === 0) return;

    setIsProcessing(true);
    setResult(null);

    try {
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
        <p className="text-muted-foreground">Arraste e solte o Cartão CNPJ, Estatuto Social e a ATA para extrair automaticamente o perfil completo.</p>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col space-y-6">

        {!result?.profile && (
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

            <Button
              onClick={handleSubmit}
              disabled={isProcessing || files.length === 0}
              className="w-full py-6 text-lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Processando com IA...
                </>
              ) : (
                'Extrair Perfil Mágico'
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
              disabled={isSearching}
              onClick={async () => {
                setIsSearching(true);
                try {
                  const triggerAgenticSearch = httpsCallable(functions, 'triggerAgenticSearch');
                  await triggerAgenticSearch({ oscId: result.oscId });
                } catch (error) {
                  console.error("Error triggering agentic search:", error);
                  alert("Houve um erro ao iniciar a busca. Você pode tentar novamente na dashboard.");
                } finally {
                  setIsSearching(false);
                  navigate(`/admin/matches?oscId=${result.oscId}`);
                }
              }}
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Analisando Editais...
                </>
              ) : (
                'Encontrar Editais Compatíveis'
              )}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
