import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from './ui/Button';
import { Loader2, AlertCircle } from 'lucide-react';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/admin';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      console.error(err);
      setError('Falha ao fazer login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 px-4">
      <div className="bg-card p-8 rounded-lg shadow-lg max-w-md w-full border border-border">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tighter mb-2">TRÍADE<span className="text-primary">.</span></h1>
          <p className="text-muted-foreground">Faça login para acessar o painel</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/50 text-destructive rounded-md flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-2 rounded-md border border-input bg-background text-foreground"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-2 rounded-md border border-input bg-background text-foreground"
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full py-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
};
