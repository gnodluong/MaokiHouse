// One Supabase Edge Function serves every Maoki endpoint: /inbound, /messaging, /reviews, /youtube, /channels, /worker.
// Public URL: https://<project>.supabase.co/functions/v1/api/<endpoint>
// The gateway's JWT check is off (supabase/config.toml) because webhooks and the worker carry no user token;
// each handler verifies its own credential (user JWT, webhook signature or token, or WORKER_SECRET).
import { route } from '../_shared/router.ts';

// Supabase injects SUPABASE_URL and SUPABASE_ANON_KEY; the handlers read SUPABASE_PUBLISHABLE_KEY.
const env = () => ({ ...Deno.env.toObject(), SUPABASE_PUBLISHABLE_KEY: Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '' });

Deno.serve(request => route(request, env()));
