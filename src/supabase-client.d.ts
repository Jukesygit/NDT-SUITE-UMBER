// Type declaration for supabase-client.js
// Uses `any` for backward compatibility with existing services that rely on
// untyped Supabase query return shapes. Individual TypeScript consumers can
// narrow the type at their call site if needed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any;
export function isSupabaseConfigured(): boolean;
export default supabase;
