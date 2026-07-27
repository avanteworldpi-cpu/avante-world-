import { supabase } from './supabase';

export type AccountTier = 'consumer' | 'enterprise';

/**
 * Defaults to 'consumer' on any failure (missing row, network error, RLS surprise).
 * That's the safe direction to fail in: this value gates the Meridian nav entry and
 * screen, so an unresolved fetch should never be mistaken for enterprise access.
 */
export async function getAccountTier(userId: string): Promise<AccountTier> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('account_tier')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('Error fetching account tier:', error);
      return 'consumer';
    }

    return data.account_tier as AccountTier;
  } catch (error) {
    console.error('Error in getAccountTier:', error);
    return 'consumer';
  }
}

export async function submitMeridianInterest(message: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You must be signed in to submit this form.' };

    const { error } = await supabase
      .from('meridian_interest_submissions')
      .insert({ user_id: user.id, message });

    if (error) {
      console.error('Error submitting Meridian interest:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in submitMeridianInterest:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
