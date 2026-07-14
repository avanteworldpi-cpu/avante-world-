import { useState, useEffect } from 'react';
import { getMarketplaceAvatars, getUserCustomAvatars, getAvatarStorageUrl, MarketplaceAvatar, UserCustomAvatar } from '../lib/supabase';
import { Loader2, Upload } from 'lucide-react';

interface AvatarGalleryProps {
  onSelectMarketplaceAvatar: (avatar: MarketplaceAvatar) => void;
  onSelectCustomAvatar: (avatar: UserCustomAvatar) => void;
  selectedAvatarId?: string;
  isCustomSelected?: boolean;
}

export function AvatarGallery({
  onSelectMarketplaceAvatar,
  onSelectCustomAvatar,
  selectedAvatarId,
  isCustomSelected
}: AvatarGalleryProps) {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'uploads'>('marketplace');
  const [marketplaceAvatars, setMarketplaceAvatars] = useState<MarketplaceAvatar[]>([]);
  const [customAvatars, setCustomAvatars] = useState<UserCustomAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvatars();
  }, []);

  async function loadAvatars() {
    try {
      setLoading(true);
      setError(null);

      const [marketplace, custom] = await Promise.all([
        getMarketplaceAvatars(),
        getUserCustomAvatars()
      ]);

      setMarketplaceAvatars(marketplace);
      setCustomAvatars(custom);
    } catch (err) {
      console.error('Error loading avatars:', err);
      setError('Failed to load avatars');
    } finally {
      setLoading(false);
    }
  }

  function handleRefresh() {
    loadAvatars();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex gap-4 mb-6 border-b border-dusk-800">
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'marketplace'
              ? 'text-accent border-b-2 border-accent'
              : 'text-dusk-400 hover:text-dusk-100'
          }`}
        >
          Marketplace
        </button>
        <button
          onClick={() => setActiveTab('uploads')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'uploads'
              ? 'text-accent border-b-2 border-accent'
              : 'text-dusk-400 hover:text-dusk-100'
          }`}
        >
          My Uploads ({customAvatars.length})
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-danger/10 border border-danger/40 rounded-lg text-danger text-sm">
          {error}
        </div>
      )}

      {activeTab === 'marketplace' && (
        <div className="space-y-4">
          {marketplaceAvatars.length === 0 ? (
            <div className="text-center py-8 text-dusk-400">
              No marketplace avatars available
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketplaceAvatars.map(avatar => (
                <AvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatarId === avatar.id && !isCustomSelected}
                  onClick={() => onSelectMarketplaceAvatar(avatar)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'uploads' && (
        <div className="space-y-4">
          {customAvatars.length === 0 ? (
            <div className="text-center py-12">
              <Upload className="w-12 h-12 mx-auto text-dusk-600 mb-3" />
              <p className="text-dusk-300 font-medium">No custom avatars yet</p>
              <p className="text-dusk-400 text-sm">Upload a GLB or GLTF file to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {customAvatars.map(avatar => (
                <CustomAvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  isSelected={selectedAvatarId === avatar.storage_path && isCustomSelected}
                  onClick={() => onSelectCustomAvatar(avatar)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AvatarCardProps {
  avatar: MarketplaceAvatar;
  isSelected: boolean;
  onClick: () => void;
}

function AvatarCard({ avatar, isSelected, onClick }: AvatarCardProps) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all text-left ${
        isSelected
          ? 'border-accent bg-accent/10 shadow-lg'
          : 'border-dusk-800 hover:border-dusk-700 bg-dusk-900 hover:shadow-md'
      }`}
    >
      <div className="aspect-square bg-dusk-950 border border-dusk-800 rounded-md mb-3 flex items-center justify-center overflow-hidden">
        {avatar.thumbnail_url ? (
          <img
            src={avatar.thumbnail_url}
            alt={avatar.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-dusk-400 text-sm">No preview</div>
        )}
      </div>
      <h3 className="font-semibold text-dusk-100">{avatar.name}</h3>
      <p className="text-xs text-dusk-400 capitalize mb-2">{avatar.gender_type}</p>
      {avatar.description && (
        <p className="text-sm text-dusk-300 line-clamp-2">{avatar.description}</p>
      )}
    </button>
  );
}

interface CustomAvatarCardProps {
  avatar: UserCustomAvatar;
  isSelected: boolean;
  onClick: () => void;
}

function CustomAvatarCard({ avatar, isSelected, onClick }: CustomAvatarCardProps) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all text-left ${
        isSelected
          ? 'border-accent bg-accent/10 shadow-lg'
          : 'border-dusk-800 hover:border-dusk-700 bg-dusk-900 hover:shadow-md'
      }`}
    >
      <div className="aspect-square bg-dusk-950 border border-dusk-800 rounded-md mb-3 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl text-dusk-400 mb-1">3D</div>
          <div className="text-xs text-dusk-400 uppercase font-semibold">{avatar.file_type}</div>
        </div>
      </div>
      <h3 className="font-semibold text-dusk-100 truncate">{avatar.filename}</h3>
      <p className="text-xs text-dusk-400 mb-2">
        {(avatar.file_size / 1024).toFixed(1)} KB
      </p>
      <p className="text-xs text-dusk-400">
        {new Date(avatar.uploaded_at).toLocaleDateString()}
      </p>
    </button>
  );
}
