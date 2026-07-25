import { useState, useEffect, FormEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

const PENDING_CONFIRMATION_EMAIL_KEY = 'pendingConfirmationEmail';
const RESEND_COOLDOWN_SECONDS = 30;

export function Auth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialized from localStorage so a reload mid-wait shows the waiting screen
  // again instead of reverting to a blank form.
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(
    () => localStorage.getItem(PENDING_CONFIRMATION_EMAIL_KEY)
  );
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown === 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: authError } =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      // Today, "Confirm email" is off in the Supabase dashboard, so signUp()
      // still returns a session immediately and this branch never fires --
      // dormant until that toggle is flipped. When it is, signUp() returns
      // session: null with no error, which is exactly the case this guards.
      if (mode === 'signup' && !data.session) {
        setPendingConfirmationEmail(email);
        localStorage.setItem(PENDING_CONFIRMATION_EMAIL_KEY, email);
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

  async function handleResend() {
    if (!pendingConfirmationEmail || resendCooldown > 0) return;

    setError(null);
    setIsResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: pendingConfirmationEmail,
      });

      if (resendError) {
        setError(resendError.message);
        return;
      }

      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsResending(false);
    }
  }

  function startOver() {
    setPendingConfirmationEmail(null);
    localStorage.removeItem(PENDING_CONFIRMATION_EMAIL_KEY);
    setEmail('');
    setPassword('');
    setError(null);
    setResendCooldown(0);
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
  }

  if (pendingConfirmationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dusk-950 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="font-display text-4xl font-semibold text-dusk-50 mb-2">Avante World</h1>
          </div>

          <div className="bg-dusk-900 rounded-lg shadow-xl border border-dusk-800 p-8 space-y-6 text-center">
            <h2 className="font-display text-2xl font-semibold text-dusk-50">Check your email</h2>
            <p className="text-dusk-300">
              We&apos;ve sent a confirmation link to{' '}
              <span className="font-semibold text-dusk-100">{pendingConfirmationEmail}</span>. Click it
              to finish creating your account.
            </p>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/40 text-left">
                <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                <p className="text-sm text-danger">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || resendCooldown > 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-dusk-950 font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isResending && <Loader2 className="w-4 h-4 animate-spin" />}
              {resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : 'Resend confirmation email'}
            </button>

            <p className="text-sm text-dusk-400">
              <button
                type="button"
                onClick={startOver}
                className="text-accent font-medium hover:text-accent-strong"
              >
                Use a different email
              </button>
            </p>
          </div>
        </div>
      </div>
    );
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
