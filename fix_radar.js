const fs = require('fs');

const code = `import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Activity, CheckCircle2, Loader2, X, AlertCircle } from 'lucide-react';

interface BulkMatchJob {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'error' | 'dismissed';
  cidade: string;
  totalOscs: number;
  oscsProcessed: number;
  matchesTriggered: number;
  error?: string;
}

export function BulkMatchRadar() {
  const [activeJob, setActiveJob] = useState<BulkMatchJob | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'system_jobs'),
      where('type', '==', 'bulk_match'),
      where('status', 'in', ['running', 'completed', 'error'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BulkMatchJob));

        // Find a running job first
        let currentJob = jobs.find(j => j.status === 'running');

        // If no running job, find a completed or error job
        if (!currentJob) {
          const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'error');
          if (finishedJobs.length > 0) {
            currentJob = finishedJobs[0];
          }
        }

        setActiveJob(currentJob || null);
      } else {
        setActiveJob(null);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!activeJob) return null;

  return (
    <div className={\`mt-8 p-6 rounded-lg border shadow-sm \${activeJob.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : activeJob.status === 'error' ? 'bg-red-500/5 border-red-500/20' : 'bg-card text-card-foreground'}\`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          {activeJob.status === 'completed' ? (
            <>
              <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
              Match Interno Concluído
            </>
          ) : activeJob.status === 'error' ? (
            <>
              <AlertCircle className="w-5 h-5 mr-2 text-red-500" />
              Erro no Match Interno
            </>
          ) : (
            <>
              <Activity className="w-5 h-5 mr-2 text-primary animate-pulse" />
              Match Interno em Andamento...
            </>
          )}
        </h3>
        {(activeJob.status === 'completed' || activeJob.status === 'error') ? (
          <button
            onClick={async () => {
              try {
                await updateDoc(doc(db, 'system_jobs', activeJob.id), { status: 'dismissed' });
                setActiveJob(null);
              } catch (error) {
                console.error("Failed to dismiss job", error);
              }
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Fechar resumo"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
            {Math.round((activeJob.oscsProcessed / Math.max(1, activeJob.totalOscs)) * 100)}%
          </span>
        )}
      </div>

      <div className="space-y-4">
        {activeJob.status === 'running' && (
          <div className="w-full bg-secondary rounded-full h-2.5">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-500"
              style={{ width: \`\${Math.min(100, (activeJob.oscsProcessed / Math.max(1, activeJob.totalOscs)) * 100)}%\` }}
            ></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-muted p-3 rounded-md">
            <p className="text-muted-foreground mb-1">Cidade Alvo</p>
            <p className="text-xl font-bold">{activeJob.cidade}</p>
          </div>
          <div className="bg-muted p-3 rounded-md">
            <p className="text-muted-foreground mb-1">OSCs a Processar</p>
            <p className="text-xl font-bold">{activeJob.totalOscs}</p>
          </div>
          <div className="bg-muted p-3 rounded-md">
            <p className="text-muted-foreground mb-1">OSCs Processadas</p>
            <p className="text-xl font-bold">{activeJob.oscsProcessed}</p>
          </div>
          <div className="bg-muted p-3 rounded-md">
            <p className="text-muted-foreground mb-1">Matches Encontrados</p>
            <p className="text-xl font-bold text-amber-500">{activeJob.matchesTriggered}</p>
          </div>
          {activeJob.error && (
            <div className="bg-red-50 p-3 rounded-md col-span-2 border border-red-200">
               <p className="text-red-600 font-medium">Erro: {activeJob.error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
\`;

fs.writeFileSync('src/components/BulkMatchRadar.tsx', code);
