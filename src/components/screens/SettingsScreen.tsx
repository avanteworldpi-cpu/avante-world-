import { LogOut, Settings as SettingsIcon, X } from 'lucide-react';

interface ControlEntry {
  keys: string;
  action: string;
}

/**
 * Kept in sync with the actual bindings, not this feature's original spec wording
 * -- e.g. AvatarCharacter.handleKeyDown is what really answers "does Space do
 * anything", not a description written before the code existed.
 */
const CONTROLS: ControlEntry[] = [
  { keys: 'WASD / Arrow keys', action: 'Move' },
  { keys: 'Shift', action: 'Run' },
  { keys: 'Space', action: 'Jump' },
  { keys: 'V', action: 'Toggle first-person / third-person view' },
  { keys: 'Mouse', action: 'Look around (first-person only)' },
  { keys: 'Esc', action: 'Exit first-person view' },
];

interface SettingsScreenProps {
  onClose: () => void;
  onSignOut: () => void;
}

export function SettingsScreen({ onClose, onSignOut }: SettingsScreenProps) {
  return (
    <div className="w-full h-full overflow-y-auto bg-dusk-900 p-8">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            {/* Muted, not accent: matches Meetups/Meridian's own header icon treatment. */}
            <SettingsIcon className="w-6 h-6 text-dusk-300" />
            <h1 className="font-display text-2xl font-semibold text-dusk-50">Settings</h1>
          </div>
          <button
            onClick={onClose}
            title="Close settings"
            aria-label="Close settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-dusk-300 mb-6">Controls and account options for Avante World.</p>

        <div className="rounded-lg bg-dusk-950 border border-dusk-800 p-6">
          <h2 className="text-sm font-semibold text-dusk-100 mb-4">Controls</h2>
          <dl className="space-y-3">
            {CONTROLS.map((c) => (
              <div key={c.keys} className="flex items-center justify-between gap-4">
                <dt>
                  <kbd className="px-2 py-1 rounded-md bg-dusk-900 border border-dusk-700 text-xs font-mono text-dusk-100">
                    {c.keys}
                  </kbd>
                </dt>
                <dd className="text-sm text-dusk-300 text-right">{c.action}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg bg-dusk-950 border border-dusk-800 p-6 mt-6">
          <h2 className="text-sm font-semibold text-dusk-100 mb-4">Account</h2>
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dusk-900 border border-dusk-700 text-dusk-100 text-sm font-medium hover:bg-dusk-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
