import { mountPrivateAssets } from './private-assets.js?v=20261029-v1';

const config = window.FAMILY_CONFIG || {};
const root = document.querySelector('#privateAssetsApp');
const client = window.supabase && config.supabaseUrl && config.supabaseAnonKey
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

const api = {
  async session() {
    if (!client) throw Object.assign(new Error(), { code: 'NOT_CONFIGURED' });
    const { data, error } = await client.auth.getSession();
    if (error) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' });
    return data?.session || null;
  },
  async request(body, { signal, userId }) {
    const session = await api.session();
    if (!session || session.user.id !== userId) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' });
    const response = await fetch(`${config.supabaseUrl}/functions/v1/private-assets`, {
      method: 'POST', signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error) throw Object.assign(new Error(), { code: result?.error || (response.status === 401 ? 'UNAUTHORIZED' : response.status === 404 ? 'NOT_CONFIGURED' : 'LOAD_FAILED') });
    return result;
  },
};

const app = mountPrivateAssets(root, api);
client?.auth.onAuthStateChange((event, session) => app.sessionChanged(event, session));
window.addEventListener('pagehide', () => app.lock());
window.addEventListener('pageshow', event => { if (event.persisted) app.lock(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) app.lock(); });
app.load();
