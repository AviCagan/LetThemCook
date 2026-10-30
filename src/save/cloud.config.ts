// Supabase project for cloud save (Phase 4). Both values are public by design: the publishable key
// can only call bb_get_save / bb_put_save (supabase/migrations/*_beaker_buddies_cloud_save.sql).
//
// The project is "Things" (ref rixslpsozkfytcdeprma), which belongs to HouseholdLauncher
// (github.com/AviCagan/HouseholdLauncher); Beaker Buddies only owns the bb_* objects in it.
// The build environment can point elsewhere (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY): the
// browser tests do, so they never touch the real project.
const DEFAULT_URL = 'https://rixslpsozkfytcdeprma.supabase.co';
const DEFAULT_KEY = 'sb_publishable_CHPXv-113XNtz4lZ7CSRLw_jMx3g3pw';

export const CLOUD = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? DEFAULT_URL,
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? DEFAULT_KEY,
};
