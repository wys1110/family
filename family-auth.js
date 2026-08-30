(() => {
  if (window.FAMILY_AUTH_API) return;

  let refreshPromise = null;
  let refreshSupabase = null;
  let refreshUserId = null;

  const isAuthError = (error) => {
    if (!error) return false;
    const status = Number(error.status ?? error.context?.status ?? error.response?.status);
    const code = String(error.code || '').toUpperCase();
    const message = String(error.message || error.details || '');
    return status === 401
      || code === 'PGRST301'
      || code === 'PGRST303'
      || /jwt expired|invalid jwt|invalid token|jwt issued at future|unauthorized|not authenticated/i.test(message);
  };

  const isTransientAuthError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || error?.details || '');
    return code === 'PGRST303' || /jwt issued at future/i.test(message);
  };

  const emit = (type, detail = {}) => {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  };

  const expired = ({ supabase, userId }) => {
    emit('family:auth-expired', { supabase, userId: userId || null });
    return false;
  };

  const sessionMatches = (session, userId) => Boolean(session?.user?.id)
    && (!userId || session.user.id === userId);

  const sessionIsUsable = (session) => {
    const expiresAt = Number(session?.expires_at);
    return Boolean(session) && (!Number.isFinite(expiresAt) || expiresAt * 1000 > Date.now() + 1000);
  };

  const syncSession = async ({ supabase, userId }) => {
    if (!supabase?.auth?.getSession) return false;
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || !sessionMatches(session, userId) || !sessionIsUsable(session)) return false;
      emit('family:auth-session-refreshed', { session, supabase });
      return true;
    } catch {
      return false;
    }
  };

  const refreshSession = async ({ supabase, userId }) => {
    if (!supabase?.auth?.refreshSession) {
      return false;
    }

    if (!refreshPromise || refreshSupabase !== supabase || refreshUserId !== userId) {
      const flight = (async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          const session = data?.session;
          if (error || !sessionMatches(session, userId)) return false;
          emit('family:auth-session-refreshed', { session, supabase });
          return true;
        } catch {
          return false;
        }
      })();
      refreshSupabase = supabase;
      refreshUserId = userId || null;
      refreshPromise = flight;
      flight.then(() => {
        if (refreshPromise !== flight) return;
        refreshPromise = null;
        refreshSupabase = null;
        refreshUserId = null;
      });
    }

    return refreshPromise;
  };

  const recoverSession = async (options) => {
    if (await syncSession(options)) return { recovered: true, refreshed: false };
    if (await refreshSession(options)) return { recovered: true, refreshed: true };
    if (await syncSession(options)) return { recovered: true, refreshed: false };
    return { recovered: false, refreshed: false };
  };

  const withRecovery = async (operation, options = {}) => {
    let result;
    try {
      result = await operation();
    } catch (error) {
      if (!isAuthError(error)) throw error;
      result = { data: null, error };
    }
    if (!isAuthError(result?.error)) return result;
    if (isTransientAuthError(result.error)) return result;

    const recovery = await recoverSession(options);
    if (!recovery.recovered) {
      expired(options);
      return result;
    }
    if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
    try {
      const retryResult = await operation();
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
      if (isAuthError(retryResult?.error) && !recovery.refreshed) {
        const rotated = await refreshSession(options);
        if (rotated) {
          if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
          const finalResult = await operation();
          if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
          if (isAuthError(finalResult?.error)) expired(options);
          return finalResult;
        }
      }
      if (isAuthError(retryResult?.error)) expired(options);
      return retryResult;
    } catch (error) {
      if (typeof options.isCurrent === 'function' && !options.isCurrent()) return result;
      if (!isAuthError(error)) throw error;
      expired(options);
      return { data: null, error };
    }
  };

  window.FAMILY_AUTH_API = { isAuthError, withRecovery };
})();
