# Braid

**The multiplayer workspace with a rewind button.** Boards, docs and an infinite canvas your team edits together — then branch any page, replay how it came together, and talk in a huddle without leaving it.

A free, open-source hobby project built phase by phase.

## Run it in GitHub Codespaces

1. On the repo page, click **Code → Codespaces → Create codespace on main**.
2. Wait for setup to finish. It installs packages, creates `.env` with a fresh secret, starts Postgres and runs the database migrations.
3. In the terminal:
   ```bash
   npm run dev
   ```
   This starts two things: the web app on port **3000** and the live sync server on port **1234**.
4. Both ports must be **public** so your browser can reach them. `npm run dev` tries to do this for you; if it prints "Couldn't make ports public automatically", open the **Ports** tab, right-click **3000** and **1234** → **Port Visibility → Public**.
5. In the **Ports** tab, click the globe icon next to port **3000**.
6. Create an account, name your workspace, and open **Welcome to Braid**. Open the same doc in a second browser (or an incognito window signed in as someone else) to see live cursors.

## Run it on your own machine

You need Node 22+ and Postgres 16 (or Docker).

```bash
docker run -d --name braid-db -e POSTGRES_USER=braid -e POSTGRES_PASSWORD=braid -e POSTGRES_DB=braid -p 5432:5432 postgres:16
cp .env.example .env          # then set DATABASE_URL to ...@localhost:5432/braid
npm install
npm run db:migrate
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app (http://localhost:3000) and the sync server (ws://localhost:1234) |
| `npm run sync` | Start only the sync server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Check types and lint |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Roadmap

- [x] **Phase 0 — Foundation:** accounts, workspaces, sidebar, create/rename/trash pages, Codespaces setup
- [x] **Phase 1 — Live docs:** real-time editor with cursors and presence (Yjs, Tiptap, Hocuspocus)
- [ ] **Phase 2 — Live boards:** kanban with drag and drop, cursor chat, reactions
- [ ] **Phase 3 — Offline-first:** keep working offline, merge on reconnect
- [ ] **Phase 4 — Rewind:** version history and replay player
- [ ] **Phase 5 — Branches:** fork a page, compare, merge
- [ ] **Phase 6 — Collaboration:** invites, permissions, mentions, inbox, ⌘K search
- [ ] **Phase 7 — Sessions & automations:** timed retros with voting, when-then rules
- [ ] **Phase 8 — Huddles:** peer-to-peer voice and Follow mode
- [ ] **Phase 9 — Canvas & Catch-up:** infinite canvas and "while you were away" digest

## Stack

- **Next.js 16** (App Router, Cache Components, Server Actions) + **TypeScript** + **Tailwind CSS 4**
- **shadcn/ui** components (Radix UI) in `src/components/ui`, themed to the Braid palette in `globals.css`
- **Sonner** toast notifications
- **Postgres 16** with **Drizzle ORM**
- **Better Auth** for email and password sign-in
- **Yjs** + **Tiptap** for the collaborative editor, synced by a **Hocuspocus** server that saves to Postgres

## Project layout

```
src/
  app/
    (auth)/            sign-in and sign-up
    onboarding/        create a workspace
    w/[slug]/          the workspace: sidebar, home, pages, trash, settings
    api/auth/          Better Auth endpoints
  components/
    ui/                shadcn/ui components (add more with `npx shadcn@latest add <name>`)
  db/                  Drizzle schema and client
  lib/
    auth.ts            Better Auth server config
    dal.ts             data access layer: every read checks who's asking
    actions.ts         Server Actions: every write re-checks permissions
  components/editor/   the live doc editor, toolbar and presence
  lib/sync-token.ts    signed tickets that let a browser open one page on the sync server
  proxy.ts             redirects signed-out visitors before rendering
server/
  sync.ts              the Hocuspocus sync server (saves docs to the page_doc table)
drizzle/               SQL migrations
.devcontainer/         Codespaces / dev container setup
```

## How live editing works

1. When you open a doc, the browser asks Next.js for a **sync ticket**. Next.js checks you're a member of the workspace and returns a ticket signed with `BETTER_AUTH_SECRET`, valid for 10 minutes.
2. The browser opens a WebSocket to the sync server with that ticket. The server checks the signature and that it's for this page, then loads the doc from Postgres.
3. Every keystroke is a small Yjs update sent to the server and on to everyone else in the doc. Yjs merges simultaneous edits without conflicts.
4. The server saves the doc to Postgres about a second after people stop typing.

## License

MIT
