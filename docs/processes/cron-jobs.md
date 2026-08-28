# Scheduled Jobs (pg_cron)

**Owner:** Jonas · **Last reviewed:** 2026-08-26

---

## Purpose

Everything that runs on a schedule against production runs as a **`pg_cron` job inside the Supabase
project** `ntrgjqrbewbvwofupphn` (eu-west-2). There is no external scheduler, no CI cron, and no
serverless timer — deliberately: GitLab CI holds no Supabase credentials, and keeping schedules in the
database keeps the blast radius where the data already is.

There are two shapes of job, and the difference is the single most important thing on this page:

| Shape | Mechanism | Failure mode |
|---|---|---|
| **HTTP-calling** | `net.http_post` to an edge function | **Fails silently.** A wrong bearer 401s and nothing tells you |
| **Pure SQL** | `SELECT some_function();` | Fails loudly in `cron.job_run_details` |

Prefer pure SQL whenever the work can be done in the database. It sidesteps the entire class of failure
described below.

---

## Prerequisites

- `pg_cron` and `pg_net` extensions enabled on the project (Database → Extensions). They were enabled
  before the 2026-08-17 restore and are required for HTTP-calling jobs.
- Supabase **dashboard SQL editor** access. On the owner's Windows machine the CLI stores its token in
  the credential store, so arbitrary ad-hoc SQL goes through the dashboard rather than the CLI.
- For any job that calls an edge function: the **target project's anon key** and the current
  `CRON_SECRET` value. Both come from the owner / dashboard — see `secrets-and-rotation.md`.

---

## Current jobs

### 1. `send-expiration-reminders-daily` — live

| | |
|---|---|
| Schedule | `30 7 * * *` (**07:30 UTC**, daily) |
| Shape | HTTP-calling — `net.http_post` to `/functions/v1/send-expiration-reminders` |
| Purpose | Emails staff and managers about competencies approaching expiry |
| State | Active since the 2026-08-17 cutover (job id 2 on the old project; recreated on ntrg) |

Definition shape (secrets elided — the real values live in the dashboard and the owner's records;
full sequence: `docs/plans/2026-08-17-supabase-project-migration-runbook.md` Phase 5):

```sql
select cron.schedule('send-expiration-reminders-daily', '30 7 * * *', $$
  select net.http_post(
    url := 'https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/send-expiration-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <TARGET PROJECT anon key>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
$$);
```

The function accepts the call on **either** a matching `x-cron-secret` **or** an authenticated admin
user, and rejects otherwise (`supabase/functions/send-expiration-reminders/index.ts:259-285`).

> **Domain rule that bites here:** the candidate-list RPCs *and* the send function must both include
> **already-expired** certificates (migration `20260625120000_expiring_competencies_include_expired.sql`).
> Never re-add an `expiry_date > NOW()` filter to only one of the two layers — the halves must agree or
> expired certs silently stop generating reminders.

### 2. `db-state-ledger-nightly` — landing 2026-08-26

| | |
|---|---|
| Shape | **Pure SQL** — no HTTP, so the 401 scar cannot apply |
| Purpose | Writes a nightly row to `db_state_snapshots`: per-table row counts, `pg_policies` count **and an md5 of the aggregated policy definitions**, storage object counts per bucket, migration-ledger tail |
| Why | Makes RLS drift visible and historically provable, and gives an auditor a continuous evidence trail rather than a one-off dump |
| RLS | `super_admin` read; no client writes (cron writes as `postgres`) |

Delivered by the same migration as job 3. Verify the first row appears the morning after it lands.

### 3. `activity-log-retention-nightly` — landing 2026-08-26

| | |
|---|---|
| Shape | **Pure SQL** — `SELECT public.scheduled_purge_activity_logs(730);` |
| Purpose | Deletes activity-log entries older than the retention window (default **730 days**) |
| Why now | The function has existed since migration `20260626170000`; only the schedule was commented out (`:59-69`), so log PII was being retained indefinitely |

`scheduled_purge_activity_logs` is the **system** variant: it does not gate on `auth.uid()` (a scheduler
has no auth context) and is locked down accordingly — `REVOKE`d from `PUBLIC`, `authenticated` and
`anon`, `GRANT EXECUTE` to `service_role` only
(`supabase/migrations/20260626170000_activity_log_retention.sql:53-56`). pg_cron runs as `postgres` and
does not need the grant. It writes a self-audit row recording how many entries it removed
(`:39-42`).

Do **not** confuse it with `purge_activity_logs()` — that is the manual, `super_admin`-gated purge
invoked from the admin UI. Neither should be run during an incident: the log is evidence
(`incident-response.md`).

> **Retention window:** 730 days is the value in the migration. `database/data-retention.sql` carried a
> 3-year figure; the two are being single-sourced on 730 days. If you change it, change **both** and
> `docs/data-retention-schedule.md` with them.

---

## Steps

### Inspect what is scheduled

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;
```

To see the full command including headers (**contains secrets — do not paste output anywhere**):

```sql
select jobid, jobname, command from cron.job;
```

### Check recent runs

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;
```

> `status = 'succeeded'` on an **HTTP-calling** job means *the HTTP request was dispatched*, not that
> the function accepted it. See the scar below.

### Add a job

```sql
select cron.schedule('<job-name>', '<cron expression>', $$ <sql> $$);
```

Run `cron.schedule` as its **own statement**. A multi-statement `-c` string is one implicit
transaction, and a later failing statement silently rolls the schedule back — a dry-run lesson from the
2026-08-17 migration.

### Change or remove a job

```sql
select cron.alter_job(jobid := <id>, schedule := '<new expression>');
select cron.unschedule('<job-name>');
```

**Never `UPDATE cron.job` directly** — permission is denied for the `postgres` role on a fresh Supabase
project. Use `cron.alter_job()` / `cron.unschedule()`.

Schedules are **not** carried by `supabase db dump` — the `cron` schema is excluded. After any restore
into a new project, `cron.job` is empty and every job must be recreated by hand. That is a required step
in `disaster-recovery.md`, not an optional one.

---

## ⚠ SCAR — the silent 401

> **An HTTP-calling cron job must send the target project's *anon key* as its `Authorization` bearer.**
>
> Every edge function except `serve-client-share` runs `verify_jwt: true`. The Supabase gateway
> validates that bearer before the function ever executes. A **service-role key**, a key from a
> *different* project, or a stale key all produce a **401 at the gateway** — and `net.http_post` is
> fire-and-forget, so `cron.job_run_details` records a perfectly successful *dispatch*. Nothing throws.
> Nobody is emailed. No alert fires.
>
> **This is not hypothetical.** The original reminder job (job id 1) 401'd this way for **months**
> before anyone noticed, because a service-role bearer looked like the obviously-more-privileged
> choice. It is not: the gateway wants a valid *JWT*, and the service-role key is not one for this
> purpose.
>
> Recorded in `docs/plans/2026-08-17-supabase-project-migration-runbook.md:133` and in the reminder-cron
> memory note. The rule: **anon key in `Authorization`, shared secret in `x-cron-secret`.** The anon key
> gets the request past the gateway; the `x-cron-secret` is what actually authorises the work.
>
> **Corollary:** never verify an HTTP cron job by looking at `cron.job_run_details` alone. Verify the
> *effect* — an email arrived, a row was written, a counter moved.

---

## ⚠ `CRON_SECRET` rotates in TWO places

`CRON_SECRET` exists in two independent stores and **both must be updated in the same sitting**:

1. The **Supabase function secret** — read by the function as `Deno.env.get('CRON_SECRET')`.
2. The **cron job definition** — the literal in the job's `x-cron-secret` header.

Update one and not the other and the job starts failing authorisation. Because the request still
dispatches fine, that failure is **silent** in exactly the way described above.

Rotation procedure: `secrets-and-rotation.md`. Order that minimises the broken window: set the new
function secret, immediately re-schedule the job with the new value, then verify by invoking the
function manually with the new secret.

---

## Verification

**A pure-SQL job:**

```sql
select jobname, active from cron.job where jobname = '<name>';
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = '<name>')
order by start_time desc limit 5;
```
Then verify the effect directly: for the state ledger, a new `db_state_snapshots` row the next morning;
for the retention purge, the self-audit row it writes into `activity_log`.

**An HTTP-calling job — verify the effect, not the dispatch.** Invoke the function by hand with the
current secret:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Authorization: Bearer <ANON KEY>" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -H "Content-Type: application/json" -d '{}' \
  https://ntrgjqrbewbvwofupphn.supabase.co/functions/v1/send-expiration-reminders
```

- `200` — bearer and secret both good.
- `401` — the bearer failed at the gateway. Wrong key, wrong project, or stale.
- `403`/rejected — the bearer passed, `x-cron-secret` did not match. This is the gate working.

Deliberately probe the **negative** too: the same call with a wrong `x-cron-secret` must be rejected.
That check was part of the migration verification gate and it is what proves the secret is actually
enforced.

Then confirm the real-world effect — that a reminder email actually arrived.

---

## Escalation / when it goes wrong

| Symptom | Likely cause | Action |
|---|---|---|
| Reminder emails silently stopped | Classic 401: bearer is a service-role key, a stale anon key, or another project's | Re-create the job with the **target project's anon key**. Verify by manual invoke, not by `job_run_details` |
| Job runs "successfully" but nothing happens | Same 401, hidden by fire-and-forget dispatch | As above |
| Function returns 403 to the cron call | `CRON_SECRET` mismatch between the function secret and the job definition | Rotate in **both** places — `secrets-and-rotation.md` |
| `cron.job` empty after a restore | The `cron` schema is not dumped | Recreate every job by hand — `disaster-recovery.md` |
| `UPDATE cron.job` → permission denied | Expected on Supabase | Use `cron.alter_job()` / `cron.unschedule()` |
| A scheduled statement did not take effect | Multi-statement transaction rolled it back | Run `cron.schedule` as its own statement |
| Emails sent to real users during a test | Job active on a non-production project | Production keeps the job active; a dry-run/scratch project must have **no** cron jobs at all |
| Activity log growing without bound | Retention job absent or inactive | Confirm `activity-log-retention-nightly` is scheduled and active |

Anything requiring the dashboard, provider keys, or secret values is owner-only. Related:
`secrets-and-rotation.md` · `deploy.md` · `disaster-recovery.md` · `incident-response.md`.
