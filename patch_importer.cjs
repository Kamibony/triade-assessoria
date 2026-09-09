const fs = require('fs');
let code = fs.readFileSync('src/components/OscImporter.tsx', 'utf8');

const importBulkRadar = `import { BulkMatchRadar } from './BulkMatchRadar';\n`;
if (!code.includes('import { BulkMatchRadar }')) {
    const importPosition = code.indexOf('export function OscImporter()');
    code = code.slice(0, importPosition) + importBulkRadar + code.slice(importPosition);
}

const ctaHtml = `                <div className="bg-muted p-3 rounded-md col-span-2 flex justify-between items-center">
                  <p className="text-muted-foreground">Lotes Processados (Chunks)</p>
                  <p className="font-semibold">{activeJob.chunksProcessed} de {activeJob.totalChunks}</p>
                </div>
              </div>
            </div>
            {activeJob.status === 'completed' && (
              <div className="mt-6">
                <Button
                  onClick={async () => {
                    const loadingToast = toast.loading('Acionando match interno...');
                    try {
                        const triggerBulkMatch = httpsCallable(functions, 'triggerBulkInternalMatch');
                        await triggerBulkMatch({
                          cidade: municipio || uf || "Geral",
                          limit: activeJob.validOscsSaved
                        });
                        toast.success('Processo de match iniciado.', { id: loadingToast });
                    } catch(error) {
                        toast.error('Erro ao acionar match.', { id: loadingToast });
                    }
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Executar Match Interno para estas OSCs
                </Button>
              </div>
            )}
          </div>
        )}

        <BulkMatchRadar />
`;

code = code.replace(`                <div className="bg-muted p-3 rounded-md col-span-2 flex justify-between items-center">
                  <p className="text-muted-foreground">Lotes Processados (Chunks)</p>
                  <p className="font-semibold">{activeJob.chunksProcessed} de {activeJob.totalChunks}</p>
                </div>
              </div>
            </div>
          </div>
        )}`, ctaHtml);

fs.writeFileSync('src/components/OscImporter.tsx', code);
