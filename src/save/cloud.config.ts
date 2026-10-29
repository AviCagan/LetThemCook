// Supabase project for cloud save (Phase 4). Both values are public by design: the publishable/anon
// key can only call the two functions in supabase/migrations/*_beaker_buddies_cloud_save.sql.
// They can also come from the build environment (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
// Empty = cloud save is hidden in Settings.
export const CLOUD = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
};
