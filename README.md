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
- [x] **Phase 2 — Live boards:** kanban with drag and drop, live pointers, cursor chat, card details, reactions
- [x] **Phase 3 — Offline-first:** keep working offline, local copies in the browser, merge on reconnect
- [x] **Phase 4 — Rewind:** version history and replay player
- [x] **Phase 5 — Branches:** fork a page, compare, merge
- [x] **Phase 6 — Collaboration:** invites, permissions, mentions, inbox, ⌘K search
- [x] **Phase 7 — Sessions & automations:** timed live sessions with recaps, when-then board rules
- [x] **Phase 8 — Huddles & follow mode:** drop-in voice/video/screen share on any page (WebRTC), follow a teammate's view
- [ ] **Phase 9 — Canvas & Catch-up:** infinite canvas and "while you were away" digest

## Stack

- **Next.js 16** (App Router, Cache Components, Server Actions) + **TypeScript** + **Tailwind CSS 4**
- **shadcn/ui** for every control (button, input, select, date picker, checkbox, toggle, dialog, dropdown, tooltip…), themed to the Braid palette in `globals.css`
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
  components/collab/   shared live-sync hooks, presence avatars and status badge
  components/editor/   the live doc editor and toolbar
  components/board/    the live kanban board, card dialog and live pointers
  lib/board-model.ts   how a board is stored in Yjs (columns, cards, ordering)
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

### Boards

A board is a Yjs document with two maps: `columns` and `cards`. Each card stores its column and a sortable position key ([fractional indexing](https://www.npmjs.com/package/fractional-indexing)) instead of living inside a list. Moving a card only changes those two fields, so if two people drag the same card at once, one move wins and the card is never duplicated. New boards get their starter columns from the sync server, so two people opening a board at the same moment can't both add them.

Live pointers, cursor chat (press <kbd>/</kbd>) and "Ravi is editing" badges use Yjs *awareness*: short-lived state that's shared while you're connected and never saved.

### Offline

Every doc and board you open is also saved in your browser (IndexedDB, via `y-indexeddb`), under a name that includes your user id. So:

- Pages open instantly from the local copy, then catch up with the server.
- If you go offline, the app disconnects from the sync server straight away, keeps working, and shows **Offline · changes saved on this device**. Edits survive closing the tab.
- When you're back, Yjs merges your edits with everyone else's. You get a **Back online** toast saying whether anything was merged.
- Signing out deletes your local copies from that browser.

Next.js's `experimental.useOffline` makes navigations and Server Actions wait and retry instead of failing, and powers the offline banner. Reloading the page while offline still needs the network; a service worker (Phase 9+) would remove that limit.

To try it: open a doc, then in Chrome DevTools → Network, switch **No throttling** to **Offline**.

### Rewind

The sync server keeps every change, not just the latest state. It groups each person's edits into steps (a step ends after 1 second of quiet or after 5 seconds of typing) and saves them to the `page_update` table with the author and time. Pages that existed before history was turned on get one starting step, credited to "Braid".

Click **Rewind** on any doc or board to open the player:

- Scrub the slider, step through one change at a time, or press play at 1×, 4× or 16×. **Skip pauses between edits** jumps over long gaps.
- Each person has a lane, so you can see who changed what and when. Steps more than 10 minutes apart are shown as separate sessions.
- **Copy link to this moment** gives a `?at=` link that opens Rewind at that exact step.
- **Restore this moment** makes the page look like it did then, for everyone, live. The restore is a new change in history, so you can rewind past it and undo it. Guests and pages in the Trash can view history but can't restore.

The player rebuilds the past in your browser by replaying the saved changes into a separate Yjs document, with a checkpoint every 25 steps so scrubbing stays fast.

### Branches

A branch is a private copy of a doc or board that you (and anyone else) can edit on its own, then review and merge back. Open **Branches** in a page's header to start one or switch between them.

- **Edit apart.** Changes on a branch don't touch the page until it's merged. Others can join the branch and edit it live, like any page.
- **Review.** **Review & merge** shows what the branch changed: for docs, added, removed and edited lines (with the exact words); for boards, cards added, removed, moved or edited. The **Page after merge** tab previews the result.
- **Merge.** Merging lands live for everyone on the page. If the page changed in the meantime, both sets of changes are kept, and you can **Update branch from page** first to bring it up to date. Merges show up in Rewind, so they can be undone.
- **Close.** Close a branch to drop it without merging; reopen it any time. Merged and closed branches become view-only for everyone, straight away, even people who have them open.

How it works: the sync server makes the branch from the page the first time it's opened, so the two share their Yjs history. Merging just sends the page the branch changes it doesn't have yet, and Yjs combines them with whatever else changed. A branch also keeps a copy of the page as it was when the branch started (`page_branch.base`), which review compares against to show only the branch's own changes.

### Collaboration

- **Invites.** Owners and admins make invite links in **Settings → Members → Invite people**: pick the role, how long the link works (1, 7 or 30 days) and an optional note. Braid doesn't send email (that would need a paid service), so you copy the link and send it however you like. Someone without an account signs up from the link and lands back on it to join. Links can be revoked any time.
- **Roles.** Owner (everything), admin (invite and manage people), member (edit), guest (view only). Owners and admins change roles and remove people from the members table; anyone can leave, except the last owner. The rules live in one place, `src/lib/permissions.ts`, used by both the UI and the server.
- **@mentions.** Type **@** in a doc to mention someone. They get a notification quoting the sentence, and see their own mentions highlighted.
- **Inbox.** Mentions, card assignments, merged branches and new members land in **Inbox**, with an unread count in the sidebar. Braid checks for new ones every 15 seconds while the tab is open and shows a toast for each.
- **⌘K / Ctrl K.** Jump to any page, create a doc, board or canvas, go to Inbox, Trash or Settings, or switch workspace, all from the keyboard. There's also a **Search** button at the top of the sidebar.

### Live sessions

Start a timed session on any doc or board from **Session → Start a live session…**: give it a name, a length and (optionally) a goal. Everyone in the workspace gets a heads-up, and everyone on the page sees a red **Live** banner with the countdown and who's joined. Anyone can **Join**; members can add **+5 min** or **End session**. Live sessions also show on the workspace home under **Live now**.

When a session ends, Braid writes a recap from the page's Rewind history: how many edits each person made, what changed (lines for docs, cards for boards), and a **Replay this session** button that opens Rewind at the session's first change. A session nobody ends closes itself two minutes after its timer runs out. Past sessions are under **Session → Past sessions**.

Start/join/extend/end messages travel over the same sync connection as edits (the sync server passes them on), so the banner updates instantly for everyone.

### Automations

Boards have **Automations**: rules like *"When a card moves to Done, check off its checklist and notify whoever made it."* Pick from templates built from your own columns, or build your own:

- **When:** a card is added (to a column, or anywhere), moves to a column, gets a label, or its checklist is all done.
- **Then** (up to 6 steps): move it, set or clear its label, assign someone, unassign everyone, set a due date N days out, clear the due date, check off its checklist, notify its assignees / its creator / a person.

Rules run on the sync server (`server/automations.ts`), not in browsers, so each one fires once per change however many people have the board open, including for offline edits when they sync. Changes a rule makes are tagged so they can't set off other rules, which rules out loops. Each board keeps a log of recent runs, rules can be paused with a switch, and nobody is notified about their own change. Branches don't run automations; they run once a branch is merged.

### Huddles

Every doc and board has a **Huddle** button: drop-in voice, plus camera and screen share, with whoever's on the page. The button shows who's already in it. The huddle panel shows everyone's tile (video when it's on), a green ring when someone is speaking, and mute, camera, share and leave controls. Leaving the page leaves the huddle. If your browser doesn't share a microphone you join listen-only.

How it works: browsers talk to each other directly with WebRTC, so audio and video never pass through Braid's servers. The sync server only relays the short setup messages, and only to the one person each is for, stamped with who really sent it. Who's in the huddle lives in Yjs awareness. For each pair of people, the one with the larger random peer id makes the offer, so two people joining at once don't collide. Each call has one audio and one video slot; mute, camera and screen share just change what's in the slot.

Routes between networks are found with Google's free STUN server. There's no TURN relay (that needs a paid service), so a few strict networks (some offices, some mobile carriers) can't connect directly; the panel says so when that happens.

### Follow mode

Click a teammate's avatar (next to "Saved") to follow them: your view follows theirs as they scroll, and on boards it opens the card they open. A frame in their colour and a **Following Ravi · Stop** chip show you're following. Scrolling, clicking or typing yourself, or Esc, stops it; so does them leaving the page. Each browser shares where it's looking in Yjs awareness, described so it works across screen sizes (which block is at the top of a doc; how far across a board).

## License

MIT
