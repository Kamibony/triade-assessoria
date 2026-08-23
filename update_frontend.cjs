const fs = require('fs');

let content = fs.readFileSync('src/components/AutonomousSearchView.tsx', 'utf8');

// Replace useEffect
const oldUseEffect = `  useEffect(() => {
    if (!activeSearchId) return;

    const unsubscribe = onSnapshot(doc(db, 'searches', activeSearchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.logs) setSearchLogs(data.logs);

        if (data.status === 'running') {
          setSearchProgressMessage(data.message || t('admin.autonomousSearch.processing'));
        } else if (data.status === 'completed' || data.status === 'error') {
          setAutonomousResult({
            type: data.status === 'success' || data.status === 'completed' ? 'success' : 'error',
            message: data.message || (data.status === 'completed' ? t('admin.autonomousSearch.completed') : t('admin.autonomousSearch.error'))
          });
          setIsRunningAutonomous(false);
          setActiveSearchId(null);
          setSearchProgressMessage('');
        }
      }
    });

    return () => unsubscribe();
  }, [activeSearchId, db, t]);`;

const newUseEffect = `  useEffect(() => {
    if (!activeSearchId) return;

    const unsubscribe = onSnapshot(doc(db, 'searches', activeSearchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.logs) setSearchLogs(data.logs);
      }
    });

    return () => unsubscribe();
  }, [activeSearchId, db]);`;

content = content.replace(oldUseEffect, newUseEffect);

// Replace handleRunAutonomousSearch
const oldHandleRun = `      if (data.success) {
         if (data.searchId) {
            setActiveSearchId(data.searchId);
            setSearchProgressMessage(t('admin.autonomousSearch.triggerSuccess'));
         } else {
            setAutonomousResult({
              type: 'success',
              message: data.message || t('admin.autonomousSearch.triggerSuccess')
            });
            setIsRunningAutonomous(false);
         }
         setAutonomousQuery('');
      } else {
         setAutonomousResult({
             type: 'error',
             message: data.message || t('admin.autonomousSearch.triggerError')
         });
         setIsRunningAutonomous(false);
      }
    } catch (error: unknown) {
      console.error("Error triggering autonomous search:", error);
      setAutonomousResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.autonomousSearch.internalError')
      });
      setIsRunningAutonomous(false);
    }`;

const newHandleRun = `      if (data.success) {
         if (data.searchId) {
            setActiveSearchId(data.searchId);
         }
         setAutonomousResult({
           type: 'success',
           message: "Agente Autônomo enviado para execução em segundo plano."
         });
         setAutonomousQuery('');
      } else {
         setAutonomousResult({
             type: 'error',
             message: data.message || t('admin.autonomousSearch.triggerError')
         });
      }
    } catch (error: unknown) {
      console.error("Error triggering autonomous search:", error);
      setAutonomousResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.autonomousSearch.internalError')
      });
    } finally {
      setIsRunningAutonomous(false);
    }`;

content = content.replace(oldHandleRun, newHandleRun);

// Replace UI elements
const oldUIElements = `        {activeSearchId && (
          <div className="mt-6 p-4 rounded-md border flex items-center bg-muted/50 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-3 shrink-0" />
            <p className="text-sm font-medium">{searchProgressMessage}</p>
          </div>
        )}
        {!activeSearchId && autonomousResult && (
          <div className={\`mt-6 p-4 rounded-md border flex items-start \${
            autonomousResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }\`}>
            {autonomousResult.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-medium">{autonomousResult.message}</p>
          </div>
        )}`;

const newUIElements = `        {autonomousResult && (
          <div className={\`mt-6 p-4 rounded-md border flex items-start \${
            autonomousResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }\`}>
            {autonomousResult.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-medium">{autonomousResult.message}</p>
          </div>
        )}`;

content = content.replace(oldUIElements, newUIElements);

fs.writeFileSync('src/components/AutonomousSearchView.tsx', content, 'utf8');
console.log("Successfully updated AutonomousSearchView.tsx");
