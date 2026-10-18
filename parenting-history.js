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
    list: (ctx, babyId) => run(ctx, () => {
      let query = ctx.client.from('parenting_questions').select('id,baby_id,question,answer,status,error,created_at')
        .eq('household_id',ctx.householdId).eq('created_by',ctx.userId);
      query = babyId ? query.eq('baby_id',babyId) : query.is('baby_id',null);
      return query.order('created_at',{ascending:false}).limit(20);
    }),
    enqueue: (ctx, { id, babyId, question, records, messages }) => run(ctx, () => ctx.client.rpc('enqueue_parenting_question', {
      p_id:id, p_household:ctx.householdId, p_baby:babyId, p_question:question, p_context:records, p_messages:messages,
    })),
  };
})();
