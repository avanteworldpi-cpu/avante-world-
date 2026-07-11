import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { Auth } from './components/Auth';
import { AvatarSelector } from './components/AvatarSelector';
import { MapSelector } from './components/MapSelector';
import { AvatarMapView } from './components/AvatarMapView';
import { AppShell } from './components/shell/AppShell';
import { supabase } from './lib/supabase';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [avatarSelected, setAvatarSelected] = useState(false);
  const [locationSelected, setLocationSelected] = useState(false);
  const [startLocation, setStartLocation] = useState<[number, number] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (!session) {
        // Don't leak one account's progress into the next session.
        setAvatarSelected(false);
        setLocationSelected(false);
        setStartLocation(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Auth />;

  // Onboarding stays full-screen and outside the shell: the nav tabs are meaningless
  // before you've picked an avatar and a spawn point.
  if (!avatarSelected) {
    return <AvatarSelector onSelect={() => setAvatarSelected(true)} />;
  }

  if (!locationSelected || !startLocation) {
    return (
      <MapSelector
        onLocationSelect={(lat, lng) => {
          setStartLocation([lat, lng]);
          setLocationSelected(true);
        }}
      />
    );
  }

  const avatarUrl = localStorage.getItem('selectedAvatarUrl') || localStorage.getItem('sharedAvatarUrl');

  return (
    <AppShell
      userEmail={user.email}
      locationLabel={`${startLocation[0].toFixed(3)}, ${startLocation[1].toFixed(3)}`}
      onSignOut={() => supabase.auth.signOut()}
      // `startLocation` is held in state, so its identity is stable across the shell's
      // re-renders (tab clicks, panel toggles). If it were rebuilt inline here it would
      // be a new array every render, retriggering AvatarMapView's effect and tearing the
      // whole scene down on every click.
      renderWorld={(active) => (
        <AvatarMapView avatarUrl={avatarUrl} startLocation={startLocation} active={active} />
      )}
    />
  );
}

export default App;
