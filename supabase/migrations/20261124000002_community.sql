-- =============================================================================
-- JobShield AI — community reports, abuse flags and moderation
--
--  * Reports are private to their reporter (and admins) until an admin
--    approves them.
--  * The public only ever sees approved reports through the
--    public_community_reports view, which omits the reporter's identity.
--  * Moderation happens exclusively through moderate_report(), which checks
--    the caller is an admin and writes an audit row atomically.
--  * Three abuse flags automatically move an approved report back to
--    'pending' (hidden) for re-review.
-- =============================================================================

create table public.community_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid default auth.uid() references auth.users (id) on delete set null,
  company_name      text not null check (char_length(company_name) between 2 and 200),
  opportunity_title text check (opportunity_title is null or char_length(opportunity_title) <= 200),
  opportunity_url   text check (opportunity_url is null or char_length(opportunity_url) <= 2048),
  contact_channel   text check (contact_channel is null or char_length(contact_channel) <= 200),
  description       text not null check (char_length(description) between 30 and 4000),
  evidence_excerpt  text check (evidence_excerpt is null or char_length(evidence_excerpt) <= 1500),
  scan_id           uuid references public.scans (id) on delete set null,
  moderation_status text not null default 'pending'
                    check (moderation_status in ('pending', 'approved', 'rejected', 'removed')),
  flag_count        integer not null default 0 check (flag_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  moderated_at      timestamptz
);

comment on table public.community_reports is 'User-submitted reports. Unverified accounts of experience, never presented as findings of fraud.';

create index community_reports_status_created_idx on public.community_reports (moderation_status, created_at desc);
create index community_reports_reporter_idx on public.community_reports (reporter_id, created_at desc);
create index community_reports_scan_idx on public.community_reports (scan_id);

create trigger community_reports_set_updated_at
  before update on public.community_reports
  for each row execute function public.set_updated_at();

alter table public.community_reports enable row level security;

create policy "reports: reporter or admin can read"
  on public.community_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

-- New reports always start pending and unflagged; a linked scan must be the
-- reporter's own.
create policy "reports: authenticated users submit pending reports"
  on public.community_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and moderation_status = 'pending'
    and flag_count = 0
    and moderated_at is null
    and (scan_id is null or exists (
      select 1 from public.scans s where s.id = scan_id and s.owner_id = (select auth.uid())
    ))
  );

create policy "reports: reporter or admin can delete"
  on public.community_reports for delete to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

revoke all on table public.community_reports from anon, authenticated;
grant select, delete on table public.community_reports to authenticated;
-- Users can only supply content columns; status, counters, reporter and
-- timestamps come from defaults.
grant insert (company_name, opportunity_title, opportunity_url, contact_channel, description, evidence_excerpt, scan_id)
  on table public.community_reports to authenticated;

-- Public, read-only projection of APPROVED reports (no reporter identity,
-- no linked scan). Owned by the migration role, so it reads the table
-- without exposing anything else.
create view public.public_community_reports
with (security_barrier = true)
as
  select
    r.id,
    r.company_name,
    r.opportunity_title,
    r.opportunity_url,
    r.contact_channel,
    r.description,
    r.evidence_excerpt,
    r.created_at,
    r.moderated_at
  from public.community_reports r
  where r.moderation_status = 'approved';

comment on view public.public_community_reports is 'Approved community reports only. Reporter identity is never exposed.';

revoke all on table public.public_community_reports from anon, authenticated;
grant select on table public.public_community_reports to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Abuse flags ("report this report")
-- ---------------------------------------------------------------------------
create table public.report_flags (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.community_reports (id) on delete cascade,
  flagger_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason     text not null check (reason in ('inaccurate', 'personal_information', 'harassment', 'spam', 'other')),
  details    text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  constraint report_flags_one_per_user unique (report_id, flagger_id)
);

create index report_flags_report_idx on public.report_flags (report_id);
create index report_flags_flagger_idx on public.report_flags (flagger_id);

alter table public.report_flags enable row level security;

create policy "flags: own or admin can read"
  on public.report_flags for select to authenticated
  using (flagger_id = (select auth.uid()) or (select public.is_admin()));

-- Only publicly visible (approved) reports can be flagged, and not your own.
create policy "flags: flag visible reports"
  on public.report_flags for insert to authenticated
  with check (
    flagger_id = (select auth.uid())
    and exists (select 1 from public.public_community_reports p where p.id = report_id)
    and not exists (
      select 1 from public.community_reports r
      where r.id = report_id and r.reporter_id = (select auth.uid())
    )
  );

revoke all on table public.report_flags from anon, authenticated;
grant select on table public.report_flags to authenticated;
grant insert (report_id, reason, details) on table public.report_flags to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation audit log
-- ---------------------------------------------------------------------------
create table public.moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid references auth.users (id) on delete set null,
  report_id       uuid not null references public.community_reports (id) on delete cascade,
  action          text not null check (action in ('approve', 'reject', 'remove', 'requeue', 'auto_requeue')),
  previous_status text not null,
  new_status      text not null,
  reason          text not null check (char_length(reason) between 3 and 1000),
  created_at      timestamptz not null default now()
);

create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at desc);
create index moderation_actions_admin_idx on public.moderation_actions (admin_id);

alter table public.moderation_actions enable row level security;

create policy "moderation log: admins read"
  on public.moderation_actions for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.moderation_actions from anon, authenticated;
grant select on table public.moderation_actions to authenticated;
-- No insert/update/delete grants: rows are written only by the functions below.

-- Increment flag_count; three flags hide an approved report pending re-review.
create or replace function public.handle_report_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text;
  v_count integer;
begin
  update public.community_reports
     set flag_count = flag_count + 1
   where id = new.report_id
  returning moderation_status, flag_count into v_prev, v_count;

  if v_prev = 'approved' and v_count >= 3 then
    update public.community_reports set moderation_status = 'pending' where id = new.report_id;
    insert into public.moderation_actions (admin_id, report_id, action, previous_status, new_status, reason)
    values (null, new.report_id, 'auto_requeue', v_prev, 'pending', 'Automatically hidden after ' || v_count || ' community flags.');
  end if;
  return new;
end;
$$;

revoke all on function public.handle_report_flag() from public, anon, authenticated;

create trigger report_flags_after_insert
  after insert on public.report_flags
  for each row execute function public.handle_report_flag();

-- Admin-only moderation entry point.
create or replace function public.moderate_report(p_report_id uuid, p_action text, p_reason text)
returns public.community_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_status text;
  v_prev text;
  v_row public.community_reports;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can moderate reports' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 1000 then
    raise exception 'A reason of 3-1000 characters is required' using errcode = '22023';
  end if;

  v_new_status := case p_action
    when 'approve' then 'approved'
    when 'reject'  then 'rejected'
    when 'remove'  then 'removed'
    when 'requeue' then 'pending'
    else null
  end;
  if v_new_status is null then
    raise exception 'Unknown moderation action' using errcode = '22023';
  end if;

  select moderation_status into v_prev from public.community_reports where id = p_report_id for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;

  update public.community_reports
     set moderation_status = v_new_status,
         moderated_at = now(),
         -- approving after review resets community flags
         flag_count = case when v_new_status = 'approved' then 0 else flag_count end
   where id = p_report_id
  returning * into v_row;

  insert into public.moderation_actions (admin_id, report_id, action, previous_status, new_status, reason)
  values (auth.uid(), p_report_id, p_action, v_prev, v_new_status, btrim(p_reason));

  return v_row;
end;
$$;

revoke all on function public.moderate_report(uuid, text, text) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
