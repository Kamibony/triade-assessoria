import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, Bot, Send, X, MessageSquare, MapPin } from 'lucide-react';

interface CopilotResponse {
  matchedOscs: {
    oscId: string;
    name: string;
    location: string;
    coreActivities: string[];
    reasoning: string;
  }[];
  outreachMessage: string;
  explanation: string;
}

export function TriadeCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const askCopilot = httpsCallable<{ prompt: string }, CopilotResponse>(functions, 'askCopilotFunction');
      const response = await askCopilot({ prompt });
      setResult(response.data);
    } catch (err: unknown) {
      console.error('Copilot error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while generating the response.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-6 bg-primary text-primary-foreground p-4 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 z-50 flex items-center justify-center group"
          aria-label="Open Triade Copilot"
        >
          <Bot className="w-6 h-6 group-hover:animate-pulse" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] max-h-[80vh] bg-background border rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5">
          <div className="bg-primary text-primary-foreground p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <h3 className="font-semibold">Tríade Co-pilot</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-primary-foreground/80 hover:text-primary-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-muted/30">
            {!result && !isLoading && !error && (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">Hi! How can I help you find NGOs or Grants today?</p>
                <p className="text-xs mt-2 opacity-70">Try asking: "Find 5 education NGOs in João Pessoa for a national grant."</p>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-6">
                <div className="bg-background border p-4 rounded-lg shadow-sm text-sm">
                  <p>{result.explanation}</p>
                </div>

                {result.matchedOscs.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" /> Matched NGOs
                    </h4>
                    <div className="space-y-3">
                      {result.matchedOscs.map((osc, idx) => (
                        <div key={idx} className="bg-background border p-3 rounded-lg shadow-sm text-sm">
                          <p className="font-semibold">{osc.name}</p>
                          <p className="text-xs text-muted-foreground">{osc.location} • {osc.coreActivities.join(', ')}</p>
                          <p className="mt-2 text-muted-foreground">{osc.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.outreachMessage && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" /> Suggested Message
                    </h4>
                    <div className="bg-muted p-3 rounded-lg border text-sm whitespace-pre-wrap font-mono relative group">
                      {result.outreachMessage}
                      <button
                        onClick={() => navigator.clipboard.writeText(result.outreachMessage)}
                        className="absolute top-2 right-2 bg-background border px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-4 bg-background border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask Co-pilot..."
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading}
              />
              <Button type="submit" size="icon" disabled={isLoading || !prompt.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
