import React, { useState } from 'react';
import { useSupabaseAuth } from '../providers/SupabaseAuthProvider';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signUp } = useSupabaseAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formHint, setFormHint] = useState('Use your work email and a password with at least 6 characters.');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    const fn = mode === 'login' ? signIn : signUp;
    const result = await fn(email, password);
    if (result.error) setError(result.error);
    else setFormHint(mode === 'login' ? 'Welcome back! Loading your projects…' : 'Check your email if email confirmation is enabled.');
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <p>Loading session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-6 shadow">
          <h1 className="text-xl font-semibold mb-4 text-amber-200">
            {mode === 'login' ? 'Login' : 'Create account'}
          </h1>
          <p className="text-sm text-zinc-400 mb-4 leading-snug">{formHint}</p>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Email</label>
              <input
                type="email"
                className="w-full bg-zinc-800 rounded-xl p-2 border border-transparent focus:border-amber-400 outline-none transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Password</label>
              <input
                type="password"
                className="w-full bg-zinc-800 rounded-xl p-2 border border-transparent focus:border-amber-400 outline-none transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/40 rounded-lg p-2">{error}</p>}
            <button
              type="submit"
              className="w-full bg-amber-400 text-zinc-900 font-semibold rounded-xl p-2 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
          <button
            className="mt-4 text-sm text-amber-300"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
