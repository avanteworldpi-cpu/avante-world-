import { useState, FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

export function Auth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: authError } =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      // No navigation here: App subscribes to onAuthStateChange and swaps the
      // gate out as soon as the session lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dusk-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-semibold text-dusk-50 mb-2">Avante World</h1>
          <p className="text-dusk-300">
            {mode === 'signin' ? 'Sign in to enter the world' : 'Create an account to get started'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-dusk-900 rounded-lg shadow-xl border border-dusk-800 p-8 space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-dusk-100">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-dusk-950 border border-dusk-700 text-dusk-100 placeholder:text-dusk-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-dusk-100">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-dusk-950 border border-dusk-700 text-dusk-100 placeholder:text-dusk-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              placeholder="At least 6 characters"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/40">
              <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-dusk-950 font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <p className="text-sm text-dusk-400 text-center">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="text-accent font-medium hover:text-accent-strong"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
