create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'daily-briefing-push-every-5-minutes';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'daily-briefing-push-every-5-minutes',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_project_url') || '/functions/v1/daily-briefing-push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_publishable_key'),
      'authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_publishable_key'),
      'x-daily-briefing-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_cron_secret')
    ),
    body := '{"action":"dispatch"}'::jsonb
  );
  $job$
);
