import { useState, useEffect } from 'react';
import {
  getMarketplaceAvatarById,
  getUserAvatarSelection,
  saveUserAvatarSelection,
  getAvatarStorageUrl,
  MarketplaceAvatar,
  UserCustomAvatar
} from '../lib/supabase';
import { AvatarGallery } from './AvatarGallery';
import { AvatarUpload } from './AvatarUpload';
import { AvatarPreviewViewer } from './AvatarPreviewViewer';
import { ChevronDown, CheckCircle } from 'lucide-react';

interface AvatarSelectorProps {
  onSelect: (avatarUrl: string) => void;
}

export function AvatarSelector({ onSelect }: AvatarSelectorProps) {
  const [selectedMarketplaceAvatar, setSelectedMarketplaceAvatar] = useState<MarketplaceAvatar | null>(null);
  const [selectedCustomAvatar, setSelectedCustomAvatar] = useState<UserCustomAvatar | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserSelection();
  }, []);

  async function loadUserSelection() {
    try {
      const selection = await getUserAvatarSelection();

      if (selection) {
        if (selection.is_custom && selection.custom_avatar_path) {
          const url = getAvatarStorageUrl(selection.custom_avatar_path);
          setPreviewUrl(url);
          setSelectedCustomAvatar({
            id: '',
            user_id: selection.user_id,
            filename: '',
            storage_path: selection.custom_avatar_path,
            file_type: 'glb',
            file_size: 0,
            uploaded_at: selection.selected_at,
            deleted_at: null
          });
        } else if (selection.selected_avatar_id) {
          const avatar = await getMarketplaceAvatarById(selection.selected_avatar_id);
          if (avatar) {
            setSelectedMarketplaceAvatar(avatar);
            const url = getAvatarStorageUrl(avatar.glb_file_path);
            setPreviewUrl(url);
          }
        }
      }
    } catch (error) {
      console.error('Error loading user selection:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectMarketplace(avatar: MarketplaceAvatar) {
    setSelectedMarketplaceAvatar(avatar);
    setSelectedCustomAvatar(null);
    const url = getAvatarStorageUrl(avatar.glb_file_path);
    setPreviewUrl(url);
  }

  function handleSelectCustom(avatar: UserCustomAvatar) {
    setSelectedCustomAvatar(avatar);
    setSelectedMarketplaceAvatar(null);
    const url = getAvatarStorageUrl(avatar.storage_path);
    setPreviewUrl(url);
  }

  async function handleConfirmSelection() {
    try {
      setIsConfirming(true);

      if (selectedMarketplaceAvatar) {
        await saveUserAvatarSelection(selectedMarketplaceAvatar.id, false);
        const url = getAvatarStorageUrl(selectedMarketplaceAvatar.glb_file_path);
        localStorage.setItem('selectedAvatarUrl', url);
        onSelect(url);
      } else if (selectedCustomAvatar) {
        await saveUserAvatarSelection(null, true, selectedCustomAvatar.storage_path);
        const url = getAvatarStorageUrl(selectedCustomAvatar.storage_path);
        localStorage.setItem('selectedAvatarUrl', url);
        onSelect(url);
      }
    } catch (error) {
      console.error('Error confirming selection:', error);
    } finally {
      setIsConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dusk-950">
        <div className="text-center">
          <div className="inline-block animate-pulse">
            <div className="w-12 h-12 bg-accent rounded-full mb-4 mx-auto"></div>
          </div>
          <p className="text-dusk-400 font-medium">Loading your avatar options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dusk-950 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-semibold text-dusk-50 mb-2">Choose Your Avatar</h1>
          <p className="text-dusk-300">Select a marketplace avatar or upload your own custom GLB/GLTF model</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <AvatarGallery
              onSelectMarketplaceAvatar={handleSelectMarketplace}
              onSelectCustomAvatar={handleSelectCustom}
              selectedAvatarId={
                selectedMarketplaceAvatar?.id || selectedCustomAvatar?.storage_path
              }
              isCustomSelected={!!selectedCustomAvatar}
            />

            <div className="bg-dusk-900 rounded-lg border border-dusk-800 overflow-hidden">
              <button
                onClick={() => setShowUploadSection(!showUploadSection)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-dusk-800/60 transition-colors"
              >
                <span className="font-semibold text-dusk-100">Upload Custom Avatar</span>
                <ChevronDown
                  className={`w-5 h-5 text-dusk-400 transition-transform ${
                    showUploadSection ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showUploadSection && (
                <div className="px-6 py-4 border-t border-dusk-800 bg-dusk-950">
                  <AvatarUpload onUploadSuccess={loadUserSelection} />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-dusk-900 rounded-lg border border-dusk-800 p-6 sticky top-6">
              <h2 className="font-display text-lg font-semibold text-dusk-50 mb-4">Preview</h2>

              {previewUrl ? (
                <div>
                  <AvatarPreviewViewer modelUrl={previewUrl} showSpinning={true} />
                  <div className="mt-4 p-3 bg-accent/10 rounded-lg border border-accent/40">
                    <p className="text-sm font-medium text-dusk-100">
                      {selectedMarketplaceAvatar
                        ? selectedMarketplaceAvatar.name
                        : selectedCustomAvatar?.filename}
                    </p>
                    {selectedMarketplaceAvatar && (
                      <p className="text-xs text-accent capitalize">
                        {selectedMarketplaceAvatar.gender_type}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-80 bg-dusk-950 border border-dusk-800 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-dusk-400 mb-2">👤</div>
                    <p className="text-sm text-dusk-400">Select an avatar to preview</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirmSelection}
                disabled={
                  !selectedMarketplaceAvatar &&
                  !selectedCustomAvatar ||
                  isConfirming
                }
                className="w-full mt-4 px-4 py-3 bg-accent hover:bg-accent-strong disabled:bg-dusk-700 disabled:text-dusk-400 text-dusk-950 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isConfirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-dusk-950 border-t-transparent rounded-full animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Confirm Selection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
