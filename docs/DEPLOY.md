# Deploying Braid (free)

Braid runs as three pieces, each on a free tier:

| Piece | What it is | Where |
| --- | --- | --- |
| **App** | Next.js: pages, sign-in, Server Actions | **Vercel** (Hobby) |
| **Database** | Postgres | **Neon** (Free), or **Supabase** (Free) |
| **Sync server** | Hocuspocus: live editing, huddle setup, automations | **Render** (Free web service) |

Why three: Vercel runs Next.js as short-lived functions, but live editing needs one long-running process that every browser on a page connects to. That's the sync server, and it runs on Render. Both the app and the sync server talk to the same database.

Put all three in **Singapore**. `vercel.json` already pins Vercel's functions to `sin1` and `render.yaml` picks Render's Singapore region; pick Singapore for the database too.

You'll need the GitHub repo connected to each service. No credit card is needed for any of them at the time of writing (free tiers change; check each pricing page).

Each database gives you two connection strings. In the steps below:

- **App string**: the *pooled* one, for Vercel's many short-lived functions.
- **Server string**: the *direct* (or session) one, for the sync server and for migrations.

---

## 1. The database

Pick one. Braid's code works with either.

### Option A: Neon (recommended)

Neon's free plan allows up to 100 projects, so it works even if your Supabase free projects are used up. It also never needs a manual restore: an idle database sleeps after 5 minutes and wakes by itself (in under a second) on the next request.

1. Go to [neon.com](https://neon.com) → sign up (GitHub is fine) → **New project**.
   - Name: `braid`. Region: **AWS Asia Pacific (Singapore)**. Leave the Postgres version as it is.
2. On the project dashboard click **Connect**:
   - With **Connection pooling** on, copy the string (its hostname contains `-pooler`). That's your **App string**.
   - Turn **Connection pooling** off and copy again (same string without `-pooler`). That's your **Server string**.

   Both end in `?sslmode=require&channel_binding=require`; keep that as it is.

Free limits: 0.5 GB of data and 100 compute-hours a month per project. Compute only counts while the database is awake, so a hobby app stays well inside it. If a month's hours ever run out, the database stops until the next month (your data is kept).

### Option B: Supabase

Supabase's free plan allows **two active projects** (paused projects don't count, so pausing one you don't use frees a slot).

1. At [supabase.com](https://supabase.com) → **New project**: name `braid`, region **Southeast Asia (Singapore)**. Generate a database password and save it.
2. Click **Connect** and copy two strings, putting your password in each:
   - **Transaction pooler** (port **6543**): your **App string**.
   - **Session pooler** (port **5432**): your **Server string**.

   Don't use "Direct connection": it's IPv6-only, which Vercel and Render can't reach. If your password has `@ : / # ? %`, URL-encode them or generate one without.

Free limits: 500 MB of data, and a project is **paused after a week with no activity**: open the Supabase dashboard and click **Restore** (your data is kept).

### Create the tables

From your Codespace (or any machine with the repo), run the migrations once, with the **Server string**:

```bash
MIGRATION_DATABASE_URL='<Server string>' npm run db:migrate
```

You should see `migrations applied successfully!`. Run it again whenever a new migration is added (after `git pull`).

Every table has row-level security turned on with no policies (migration `0008`). That locks out Supabase's (and Neon's optional) auto-generated Data API, while Braid, which connects as the tables' owner, is unaffected. Do the same for any table you add later.

## 2. A shared secret

The app and the sync server must share one secret (it signs sessions and the short-lived tickets browsers use to join the sync server). Make one:

```bash
openssl rand -base64 32
```

Keep it for the next two steps. Don't reuse the one from your Codespace `.env`.

## 3. Render: the sync server

1. Go to [render.com](https://render.com) → sign in with GitHub.
2. **New → Blueprint** → pick the `braid` repo. Render reads `render.yaml` and proposes one free web service, `braid-sync`, in Singapore.
3. It asks for the two secret values:
   - `DATABASE_URL`: your **Server string**.
   - `BETTER_AUTH_SECRET`: the secret from step 2.
4. **Apply**. The first build takes a few minutes. When it's live, open `https://braid-sync-<something>.onrender.com/health`: it should say `ok` (that also checks the database connection).
5. Note the service URL; the app needs it as `wss://…` in the next step.

About the free tier: Render puts a free service to sleep after 15 minutes with no traffic (WebSocket messages count as traffic, so it stays up while anyone is editing). The next visitor wakes it in about a minute. Meanwhile Braid shows **Offline** and keeps everyone's edits on their device; they sync as soon as it's up, nothing is lost. Free instances get 750 hours a month, enough to run all month.

## 4. Vercel: the app

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import `braid`.
2. Framework preset: **Next.js** (detected). Leave the build settings as they are.
3. **Environment Variables** (add before deploying):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | your **App string** (the pooled one) |
   | `BETTER_AUTH_SECRET` | the secret from step 2 (same as Render) |
   | `NEXT_PUBLIC_SYNC_URL` | `wss://braid-sync-<something>.onrender.com` (your Render URL, with `wss://`) |

   `BETTER_AUTH_URL` isn't needed: the app trusts its own Vercel addresses automatically. Set it only if you add a custom domain (e.g. `https://braid.example.com`).
4. **Deploy**. When it's done, open the URL Vercel gives you (`https://braid-<something>.vercel.app`) and sign up.

`NEXT_PUBLIC_SYNC_URL` is built into the page, so if you change it later, **redeploy** for it to take effect.

## 5. Check it works

- Sign up, create a workspace, open the Welcome doc and type: the status should say **Saved**.
- Open the same page in another browser (or incognito, signed in as someone you invited from **Settings → Members → Invite people**) and type in both: changes appear live.
- Reload: everything is still there (it's in the database).
- If the status says **Offline** right after deploying, the sync server is probably waking up; give it a minute.

## Updating

Push to `main`. Vercel redeploys the app automatically. Render redeploys the sync server automatically when files it uses change (`server/`, `src/db/`, `src/lib/`, `package.json`). If the push includes a new migration, run the `db:migrate` command from step 1 too, ideally before pushing.

## Free-tier limits to know

- **Neon:** 0.5 GB, 100 compute-hours a month; sleeps when idle and wakes by itself.
- **Supabase:** 500 MB; **paused after a week with no activity** until you click **Restore**.
- **Render:** sleeps after 15 idle minutes (see above); may restart at any time (Braid saves continuously, so a restart only means a brief **Offline**).
- **Vercel Hobby:** for personal, non-commercial use; functions run in one region (Singapore here).
- **Huddles:** use Google's free STUN server only. There's no TURN relay (that costs money), so a few strict networks can't connect.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Vercel build fails with `DATABASE_URL is not set` | Add the environment variables, then redeploy. |
| `prepared statement … already exists` | `DATABASE_URL` on Vercel isn't the pooled App string (Neon: hostname with `-pooler`; Supabase: port 6543). |
| Pages work but docs stay **Offline** | `NEXT_PUBLIC_SYNC_URL` is wrong (must start with `wss://`, no trailing slash), the Render service is asleep or failed (check `/health`), or you changed it without redeploying. |
| Docs show "Couldn't open this doc" | `BETTER_AUTH_SECRET` differs between Vercel and Render. |
| `/health` says `database unreachable` | `DATABASE_URL` on Render: use the Server string and check the password. (Neon: the first request after a long idle can take a second.) |
| "Invalid origin" when signing in on a custom domain | Set `BETTER_AUTH_URL` to `https://your.domain` on Vercel and redeploy. |
| Migrations hang or fail | Use the Server string for `MIGRATION_DATABASE_URL`, not the pooled one. |
