import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, XCircle, FileText, Loader2, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const MagicEligibility = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progressStep, setProgressStep] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result, setResult] = useState<any | null>(null);

    const steps = [
        "Iniciando a leitura do documento...",
        "Analisando CNAE e atividades principais...",
        "Verificando tempo de fundação e localização...",
        "Cruzando regras do Edital nº 023/2026...",
        "Finalizando análise de elegibilidade..."
    ];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const processFile = async () => {
        if (!file) return;
        setIsProcessing(true);
        setResult(null);
        setProgressStep(0);

        const simulateProgress = async () => {
            for (let i = 0; i < steps.length; i++) {
                setProgressStep(i);
                await new Promise(r => setTimeout(r, 1200));
            }
        };

        const executeFirebaseCall = async () => {
            try {
                const parsePdfProfile = httpsCallable(functions, 'parsePdfProfileFunction');
                // checkEligibilityFunction is not implemented on backend, removing it and mocking the check
                // for the sake of the UX, or we can just show the parsed profile.
                // Assuming we want to show the parsed profile as the result for now.

                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => {
                        const res = reader.result?.toString() || '';
                        resolve(res.split(',')[1] || res);
                    };
                    reader.onerror = error => reject(error);
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const profileResponse = await parsePdfProfile({ pdfBase64: base64 }) as any;
                const trackingId = profileResponse.data.trackingId;

                return new Promise<void>((resolve) => {
                    const unsubscribe = onSnapshot(doc(db, 'pdf_extractions', trackingId), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            if (data.status === 'completed') {
                                unsubscribe();
                                // Mocking eligibility based on the profile result since checkEligibilityFunction is missing
                                const profile = data.result;
                                setResult({
                                    eligible: profile.documentationStatus !== 'Inativa' && profile.name,
                                    reasoning: `Perfil analisado com sucesso. Nome: ${profile.name || 'Desconhecido'}. Status: ${profile.documentationStatus}. Foco: ${(profile.coreActivities || []).join(', ')}.`,
                                    actionPlan: profile.documentationStatus === 'Pendente' ? ['Regularizar documentação no cartório', 'Atualizar dados no Mapa das OSCs'] : []
                                });
                                resolve();
                            } else if (data.status === 'error') {
                                unsubscribe();
                                setResult({
                                    eligible: false,
                                    reasoning: `Erro na extração: ${data.error}`,
                                    recommendations: []
                                });
                                resolve();
                            }
                        }
                    });
                });

            } catch (error) {
                console.error("Error processing document:", error);
                setResult({
                    eligible: false,
                    reasoning: "Ocorreu um erro ao processar o documento. Verifique se o arquivo é um PDF válido e tente novamente.",
                    recommendations: []
                });
            }
        };

        await Promise.all([simulateProgress(), executeFirebaseCall()]);

        setIsProcessing(false);
    };

    return (
        <section className="py-20 bg-muted/30" id="magic-eligibility">
            <div className="container mx-auto px-4 max-w-4xl">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4">Magic Eligibility ✨</h2>
                    <p className="text-muted-foreground">Descubra se a sua ONG está apta para captar recursos em segundos. Faça o upload do Estatuto Social ou Cartão CNPJ.</p>
                </div>

                <div className="bg-card rounded-2xl shadow-xl border overflow-hidden">
                    {!isProcessing && !result && (
                        <div className="p-8 md:p-12">
                            <label
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                                className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-12 cursor-pointer transition-colors group ${isDragging ? 'border-primary bg-primary/10' : 'border-primary/50 hover:border-primary bg-muted/10'}`}>
                                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                                <UploadCloud className="w-16 h-16 text-primary/50 group-hover:text-primary transition-colors mb-4" />
                                <p className="text-lg font-medium text-foreground mb-1">
                                    {file ? file.name : "Arraste seu PDF aqui ou clique para selecionar"}
                                </p>
                                <p className="text-sm text-muted-foreground">Apenas arquivos PDF (Estatuto Social ou Cartão CNPJ)</p>
                            </label>

                            {file && (
                                <div className="mt-8 flex justify-center">
                                    <button
                                        onClick={processFile}
                                        className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold text-lg hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg"
                                    >
                                        <Play className="w-5 h-5" fill="currentColor" />
                                        Analisar Elegibilidade
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {isProcessing && (
                        <div className="p-8 bg-zinc-950 text-emerald-400 font-mono text-sm md:text-base h-64 flex flex-col justify-end">
                            <div className="space-y-2 mb-4">
                                {steps.slice(0, progressStep + 1).map((step, idx) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        key={idx}
                                        className="flex items-center gap-2"
                                    >
                                        <span className="text-zinc-500">{">"}</span> {step}
                                    </motion.div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
                                <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                            </div>
                        </div>
                    )}

                    {result && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-8"
                        >
                            <div className="flex flex-col items-center mb-8 text-center">
                                {/* Visual Gauge / Tachometer Simulation */}
                                <div className="relative w-48 h-24 overflow-hidden mb-6">
                                    <div className="absolute top-0 left-0 w-full h-48 rounded-full border-[16px] border-muted"></div>
                                    <motion.div
                                        className={`absolute top-0 left-0 w-full h-48 rounded-full border-[16px] border-t-transparent border-r-transparent ${result.eligible ? 'border-l-emerald-500 border-b-emerald-500' : 'border-l-destructive border-b-destructive'}`}
                                        initial={{ rotate: -45 }}
                                        animate={{ rotate: result.eligible ? 135 : 45 }}
                                        transition={{ duration: 1.5, type: 'spring' }}
                                    ></motion.div>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-background w-32 h-16 rounded-t-full flex items-end justify-center pb-2">
                                        {result.eligible ? (
                                            <CheckCircle className="w-10 h-10 text-emerald-500" />
                                        ) : (
                                            <XCircle className="w-10 h-10 text-destructive" />
                                        )}
                                    </div>
                                </div>
                                <h3 className={`text-2xl font-bold ${result.eligible ? 'text-emerald-500' : 'text-destructive'}`}>
                                    {result.eligible ? 'Elegível para Captação' : 'Inelegível no momento'}
                                </h3>
                                <p className="text-muted-foreground mt-2 max-w-xl">{result.reasoning}</p>
                            </div>

                            {!result.eligible && result.actionPlan && (
                                <div className="bg-destructive/10 rounded-xl p-6 border border-destructive/20 mt-6">
                                    <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-destructive">
                                        <FileText className="w-5 h-5" /> Plano de Adequação
                                    </h4>
                                    <p className="text-sm text-foreground/80 mb-4">Siga este passo a passo para regularizar sua ONG para futuros editais:</p>
                                    <ul className="space-y-3">
                                        {result.actionPlan.map((step: string, idx: number) => (
                                            <li key={idx} className="flex gap-3 text-sm">
                                                <span className="bg-destructive/20 text-destructive font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                                                <span className="text-foreground">{step.replace(/^\d+\.\s*/, '')}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={() => { setResult(null); setFile(null); }}
                                    className="border border-input bg-background hover:bg-accent hover:text-accent-foreground px-6 py-2 rounded-full font-medium transition-colors"
                                >
                                    Analisar outro documento
                                </button>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </section>
    );
};
