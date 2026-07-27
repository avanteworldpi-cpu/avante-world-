import { useState, type FormEvent } from 'react';
import { Users, Landmark, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { submitMeridianInterest, type AccountTier } from '../../lib/meridian';

interface PlaceholderScreenProps {
  icon: LucideIcon;
  title: string;
  description: string;
  items: { title: string; meta: string }[];
}

function PlaceholderScreen({ icon: Icon, title, description, items }: PlaceholderScreenProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-dusk-900 p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-3 mb-1">
          {/* Muted, not accent: section icons aren't a trust context, and amber on four
              screen headers would stop the accent reading as sparing. */}
          <Icon className="w-6 h-6 text-dusk-300" />
          <h1 className="font-display text-2xl font-semibold text-dusk-50">{title}</h1>
        </div>
        <p className="text-dusk-300 mb-6">{description}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-lg bg-dusk-950 border border-dusk-800 p-4 hover:border-dusk-700 transition-colors"
            >
              <div className="h-24 rounded-md bg-dusk-900 border border-dusk-800 mb-3" />
              <h3 className="text-sm font-semibold text-dusk-100">{item.title}</h3>
              {/* dusk-400, the text floor. dusk-500/600 fail AA. */}
              <p className="text-xs text-dusk-400 mt-0.5">{item.meta}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-dusk-400">
          Placeholder content — this screen isn't built yet.
        </p>
      </div>
    </div>
  );
}

export function MeetupsScreen() {
  return (
    <PlaceholderScreen
      icon={Users}
      title="Meetups"
      description="Turn a conversation in the world into meeting up in real life."
      items={[
        { title: 'Saturday Coffee Run', meta: '6 going · Sat 09:00' },
        { title: 'Braamfontein Rooftop', meta: '12 going · Sat 18:30' },
        { title: 'Sunday Park Walk', meta: '3 going · Sun 07:00' },
        { title: 'Founders Breakfast', meta: '9 going · Tue 08:00' },
      ]}
    />
  );
}

interface MeridianScreenProps {
  accountTier: AccountTier;
}

/**
 * Real, finished landing page for the Meridian offering -- not the generic
 * PlaceholderScreen pattern above, which is reserved for "not built yet" stubs.
 * Meridian is built; it just doesn't have a working product behind it yet.
 */
export function MeridianScreen({ accountTier }: MeridianScreenProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Route-level re-check. The nav rail only ever lists this tab for enterprise
  // accounts, but a hidden nav entry is advisory, not enforcement -- activeTab could
  // still land on 'meridian' some other way. This is the actual gate; matching RLS's
  // own account_tier check on the INSERT policy for meridian_interest_submissions.
  if (accountTier !== 'enterprise') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-dusk-900">
        <p className="text-sm text-dusk-400">Not found.</p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await submitMeridianInterest(message);

    if (!result.success) {
      // Covers the RLS check rejecting the insert too (e.g. tier changed mid-session) --
      // surfaced as a normal error state rather than a silent failure.
      setError(result.error ?? 'Something went wrong. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-dusk-900 p-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-1">
          <Landmark className="w-6 h-6 text-dusk-300" />
          <h1 className="font-display text-2xl font-semibold text-dusk-50">Meridian</h1>
        </div>
        <p className="text-dusk-300 mb-6">
          Institutional-grade economic simulation for governments and enterprises. Meridian runs
          hybrid AI agents over synthetic population datasets to model policy and market
          interventions before they touch the real economy — a distinct, enterprise-facing offering
          built on the same simulation core as the consumer world, but separate from it.
        </p>

        <div className="rounded-lg bg-dusk-950 border border-dusk-800 p-6">
          {submitted ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-dusk-100">Thanks — we've got it.</h2>
                <p className="text-sm text-dusk-400 mt-1">
                  Someone from the Meridian team will follow up on what you shared.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="meridian-message" className="block text-sm font-medium text-dusk-100">
                  Tell us about your use case
                </label>
                <textarea
                  id="meridian-message"
                  required
                  minLength={1}
                  maxLength={4000}
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What are you looking to model, and at what scale?"
                  className="w-full px-4 py-2 rounded-lg bg-dusk-900 border border-dusk-700 text-dusk-100 placeholder:text-dusk-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
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
                disabled={isSubmitting || !message.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-dusk-950 font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Register interest
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
