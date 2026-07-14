import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type AvatarType = 'avatar_1' | 'avatar_2' | 'avatar_3';

export const SHARED_AVATAR_URL = '/assets/female_boss_character.glb';

export const AVATAR_URLS: Record<AvatarType, string> = {
  avatar_1: 'https://models.readyplayer.me/65b8c5df1e3e30001fa5c457.glb',
  avatar_2: 'https://models.readyplayer.me/65b8c5df1e3e30001fa5c459.glb',
  avatar_3: 'https://models.readyplayer.me/65b8c5df1e3e30001fa5c45a.glb'
};

export async function getUserAvatarPreference(): Promise<AvatarType | string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_avatars')
      .select('custom_avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching avatar preference:', error);
      return null;
    }

    if (data?.custom_avatar_url) {
      return data.custom_avatar_url;
    }

    const avatar = localStorage.getItem('avatarPreference');
    return (avatar as AvatarType) || null;
  } catch (error) {
    console.error('Error fetching avatar preference:', error);
    return null;
  }
}

export async function setUserAvatarPreference(avatar: AvatarType): Promise<boolean> {
  try {
    localStorage.setItem('avatarPreference', avatar);
    return true;
  } catch (error) {
    console.error('Error setting avatar preference:', error);
    return false;
  }
}

export async function setCustomAvatarUrl(avatarUrl: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('user_avatars')
      .upsert({
        user_id: user.id,
        custom_avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving avatar URL:', error);
      return false;
    }

    localStorage.setItem('sharedAvatarUrl', avatarUrl);
    return true;
  } catch (error) {
    console.error('Error setting custom avatar:', error);
    return false;
  }
}

export interface MarketplaceAvatar {
  id: string;
  name: string;
  gender_type: 'male' | 'female';
  glb_file_path: string;
  thumbnail_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCustomAvatar {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  file_type: 'glb' | 'gltf';
  file_size: number;
  uploaded_at: string;
  deleted_at: string | null;
}

export interface UserAvatarSelection {
  id: string;
  user_id: string;
  selected_avatar_id: string | null;
  is_custom: boolean;
  custom_avatar_path: string | null;
  selected_at: string;
  updated_at: string;
}

export async function getMarketplaceAvatars(genderType?: 'male' | 'female'): Promise<MarketplaceAvatar[]> {
  try {
    let query = supabase
      .from('marketplace_avatars')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (genderType) {
      query = query.eq('gender_type', genderType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching marketplace avatars:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getMarketplaceAvatars:', error);
    return [];
  }
}

export async function getMarketplaceAvatarById(id: string): Promise<MarketplaceAvatar | null> {
  try {
    const { data, error } = await supabase
      .from('marketplace_avatars')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching marketplace avatar:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getMarketplaceAvatarById:', error);
    return null;
  }
}

export async function getUserCustomAvatars(): Promise<UserCustomAvatar[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_custom_avatars')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Error fetching custom avatars:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserCustomAvatars:', error);
    return [];
  }
}

export async function saveUserAvatarSelection(
  selectedAvatarId: string | null,
  isCustom: boolean,
  customAvatarPath?: string
): Promise<UserAvatarSelection | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_avatar_selections')
      .upsert({
        user_id: user.id,
        selected_avatar_id: selectedAvatarId,
        is_custom: isCustom,
        custom_avatar_path: customAvatarPath || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving avatar selection:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in saveUserAvatarSelection:', error);
    return null;
  }
}

export async function getUserAvatarSelection(): Promise<UserAvatarSelection | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_avatar_selections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching avatar selection:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getUserAvatarSelection:', error);
    return null;
  }
}

export async function addCustomAvatar(
  filename: string,
  storagePath: string,
  fileType: 'glb' | 'gltf',
  fileSize: number
): Promise<UserCustomAvatar | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_custom_avatars')
      .insert({
        user_id: user.id,
        filename,
        storage_path: storagePath,
        file_type: fileType,
        file_size: fileSize
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding custom avatar:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in addCustomAvatar:', error);
    return null;
  }
}

export async function deleteCustomAvatar(id: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('user_custom_avatars')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting custom avatar:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteCustomAvatar:', error);
    return false;
  }
}

/**
 * Resolves a stored avatar path to a loadable URL.
 *
 * The paths that reach here are heterogeneous by design, so a bare prefix is wrong:
 *   - custom uploads store a bucket-relative key (`user-uploads/<uid>/<file>`) — prepend
 *     the public bucket URL;
 *   - marketplace rows store a static bundle path (`/assets/character.glb`) served from
 *     the web root — pass through untouched;
 *   - some sources hold a full URL (e.g. Ready Player Me `https://…`) — pass through.
 *
 * Blindly prefixing produced `.../avatars//assets/character.glb`, which 400s. Anything
 * that is already absolute (leading slash, protocol, or blob:/data:) is left alone; only
 * a bucket-relative key gets the prefix.
 */
export function getAvatarStorageUrl(path: string): string {
  if (/^(https?:|blob:|data:|\/)/.test(path)) return path;
  return `${supabaseUrl}/storage/v1/object/public/avatars/${path}`;
}
