(() => {
  const context = () => {
    const state = window.FAMILY_APP_STATE;
    if (window.FAMILY_DEMO_MODE || !state?.supabase || !state.session?.user?.id || !state.household?.id) return null;
    return { client: state.supabase, userId: state.session.user.id, householdId: state.household.id };
  };
  const run = async (ctx, operation) => {
    const result = await window.FAMILY_AUTH_API.withRecovery(operation, {
      supabase: ctx.client, userId: ctx.userId,
      isCurrent: () => { const now=context(); return now?.client===ctx.client && now.userId===ctx.userId && now.householdId===ctx.householdId; },
    });
    if (result.error) throw result.error;
    return result.data;
  };
  window.FAMILY_PARENTING_HISTORY = {
    context,
    status: ctx => run(ctx, () => ctx.client.rpc('parenting_worker_status')),
    cancel: (ctx, id) => run(ctx, () => ctx.client.rpc('cancel_parenting_question', { p_id:id })),
    find: (ctx, id) => run(ctx, () => ctx.client.from('parenting_questions')
      .select('id,baby_id,question,answer,status,error,created_at,started_at,completed_at')
      .eq('household_id',ctx.householdId).eq('created_by',ctx.userId).eq('id',id).maybeSingle()),
    list: (ctx, babyId, before = null) => run(ctx, () => {
      let query = ctx.client.from('parenting_questions').select('id,baby_id,question,answer,status,error,created_at,started_at,completed_at')
        .eq('household_id',ctx.householdId).eq('created_by',ctx.userId);
      query = babyId ? query.eq('baby_id',babyId) : query.is('baby_id',null);
      if (before) {
        // Keep the server timestamp's microseconds so page boundaries lose no rows.
        if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(before.id) ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before.created_at)) throw new Error('대화 위치를 확인하지 못했어요. 다시 열어 주세요.');
        query=query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
      }
      return query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(20);
    }),
    enqueue: (ctx, { id, babyId, question, records, messages }) => run(ctx, () => ctx.client.rpc('enqueue_parenting_question', {
      p_id:id, p_household:ctx.householdId, p_baby:babyId, p_question:question, p_context:records, p_messages:messages,
    })),
  };
})();
