import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Auth } from './components/Auth';
import { AvatarSelector } from './components/AvatarSelector';
import { MapSelector } from './components/MapSelector';
import { AvatarMapView } from './components/AvatarMapView';
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

  return (
    <>
      <button
        onClick={() => supabase.auth.signOut()}
        title="Sign out"
        className="fixed top-4 right-4 z-[1000] flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 text-sm font-medium text-gray-700 shadow-sm hover:bg-white hover:text-gray-900 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>

      {!avatarSelected ? (
        <AvatarSelector onSelect={() => setAvatarSelected(true)} />
      ) : !locationSelected ? (
        <MapSelector
          onLocationSelect={(lat, lng) => {
            setStartLocation([lat, lng]);
            setLocationSelected(true);
          }}
        />
      ) : !startLocation ? (
        <div>Loading game...</div>
      ) : (
        <AvatarMapView
          avatarUrl={localStorage.getItem('selectedAvatarUrl') || localStorage.getItem('sharedAvatarUrl')}
          startLocation={startLocation}
        />
      )}
    </>
  );
}

export default App;
