// @ts-nocheck -- Supabase Edge Runtime provides Deno and npm: imports.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { createPrivateAssetsHandler } from './handler.ts';

Deno.serve(createPrivateAssetsHandler({
  config: {
    scriptUrl: Deno.env.get('PRIVATE_ASSETS_SCRIPT_URL') || '',
    hmacSecret: Deno.env.get('PRIVATE_ASSETS_HMAC_SECRET') || '',
    ownerUserId: Deno.env.get('PRIVATE_ASSETS_OWNER_USER_ID') || '',
    allowedOrigins: (Deno.env.get('PRIVATE_ASSETS_ALLOWED_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean),
  },
  getUser: async authorization => {
    const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error ? null : data?.user || null;
  },
  fetch, crypto,
}));
