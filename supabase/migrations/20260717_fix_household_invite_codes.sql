create extension if not exists pgcrypto;

-- 기존 DB에 UUID 형태 등 6자리가 아닌 초대 코드가 남아 있으면
-- 충돌하지 않는 6자리 영문 대문자/숫자 코드로 교체합니다.
do $$
declare
  household_row record;
  candidate text;
begin
  for household_row in
    select id
    from public.households
    where invite_code is null
       or invite_code !~ '^[0-9A-F]{6}$'
  loop
    loop
      candidate := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
      exit when not exists (
        select 1
        from public.households
        where invite_code = candidate
      );
    end loop;

    update public.households
    set invite_code = candidate
    where id = household_row.id;
  end loop;
end
$$;

alter table public.households
  alter column invite_code
  set default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));

alter table public.households
  drop constraint if exists households_invite_code_format;

alter table public.households
  add constraint households_invite_code_format
  check (invite_code ~ '^[0-9A-F]{6}$');
