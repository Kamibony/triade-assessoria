import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp, QuerySnapshot, FirestoreError } from 'firebase/firestore';
import { db } from './firebase';

export type AgenticSearchJobStatus = 'queued' | 'generating_queries' | 'scraping_web' | 'scoring_triage' | 'completed' | 'failed';

export interface AgenticSearchJob {
  id: string;
  oscId: string;
  status: AgenticSearchJobStatus;
  progress: {
    queriesGenerated: number;
    linksFound: number;
    linksEvaluated: number;
    validEditaisEnqueued: number;
  };
  logs: string[];
  startedAt: Timestamp | null;
  updatedAt: Timestamp | null;
  completedAt?: Timestamp | null;
  error?: string;
}

export function useAgenticSearchTracker(oscId: string | undefined) {
  const [activeJob, setActiveJob] = useState<AgenticSearchJob | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!oscId) {
      setActiveJob(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const jobsRef = collection(db, 'agentic_search_jobs');
    const q = query(
      jobsRef,
      where('oscId', '==', oscId),
      orderBy('startedAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        if (!snapshot.empty) {
          const jobData = snapshot.docs[0].data() as AgenticSearchJob;
          setActiveJob(jobData);
        } else {
          setActiveJob(null);
        }
        setLoading(false);
      },
      (error: FirestoreError) => {
        console.error("Error listening to agentic search jobs:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [oscId]);

  useEffect(() => {
    // Check for "Zombie" state periodically (e.g. every 10 seconds)
    if (!activeJob) return;

    const interval = setInterval(() => {
      const isFinished = activeJob.status === 'completed' || activeJob.status === 'failed';

      if (!isFinished && activeJob.updatedAt) {
          const updatedTime = activeJob.updatedAt.toMillis ? activeJob.updatedAt.toMillis() : 0;
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

          if (updatedTime > 0 && updatedTime < tenMinutesAgo) {
              // Force a failed state on the client side for zombies
              setActiveJob(prev => prev ? {
                  ...prev,
                  status: 'failed',
                  error: 'A busca excedeu o tempo limite. Por favor, tente novamente.'
              } : null);
          }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeJob]);

  return { activeJob, loading };
}
