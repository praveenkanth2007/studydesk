# NeonFlow – Smart Student Collaboration & Task Management

Real-time student workspace: personal tasks (Kanban / list / calendar / weekly planner), classes & study groups,
assignments with submissions and grading, live chat, shared files, analytics and an AI study assistant.

**Stack:** HTML + CSS + vanilla JS (no framework) · Chart.js · Node.js + Express · Socket.IO · Neon serverless PostgreSQL (`pg`).

---------------------------------------------------------------------

## 1. Quick start (about 10 minutes)

### Step 1 – Create a Neon database
1. Sign up at https://neon.tech and click **New project** (any region, Postgres 16/17).
2. On the project dashboard click **Connect** and copy the **connection string**. It looks like  
   `postgresql://neondb_owner:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`  
   (If it ends with `&channel_binding=require`, delete that part.)

### Step 2 – Configure
```bash
cp .env.example .env          # Windows: copy .env.example .env
```
Edit `.env`:
```
DATABASE_URL=<paste your Neon connection string>
DB_SSL=true
JWT_SECRET=<32+ random chars>      # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
FACULTY_SIGNUP_CODE=<a secret code for faculty sign-up>
```

### Step 3 – Install, create tables, run
```bash
npm install
npm run migrate        # creates all tables in Neon (safe to re-run)
npm run seed           # OPTIONAL, development only: demo users/team/assignment (password: Password123)
npm start              # http://localhost:5000
```
Demo accounts after `npm run seed`: `asha@`, `ben@`, `chen@` (students), `faculty@`, `admin@` — all `@demo.neonflow.dev`.

### Step 4 – Make yourself an administrator (optional)
Register normally, then: `npm run make-admin -- you@college.edu`

### Step 5 – Try the main workflows
1. Register a student and a faculty account (faculty needs `FACULTY_SIGNUP_CODE`).
2. **Faculty:** Teams → *Create team* → type **Class**. Copy the **invitation code**.
3. **Student:** Teams → *Join with code*.
4. **Faculty:** Assignments → *New assignment* → choose the class, set a due date → *Create*.
5. **Student:** open the assignment → *Start working* → *Submit* (text and/or file).
6. **Faculty:** open the assignment → *Grade* (or *Return for corrections*).
7. Open **Chat** in two browsers (one per user) and watch messages arrive live.
8. My Tasks → create a task, drag it between columns, refresh the page — it persists.

---------------------------------------------------------------------

## 2. Architecture

```
public/               static frontend (served by Express)
  *.html  css/app.css  js/api.js (helpers) shell.js (sidebar/topbar/socket) taskui.js + one script per page
src/
  server.js app.js    HTTP + Socket.IO bootstrap, helmet CSP, CORS, rate limits
  config/             env validation, pg Pool + transaction helper
  middleware/         auth (JWT in HttpOnly cookie), validation errors, rate limiting, origin check
  validators/         input validation
  routes/index.js     all REST endpoints
  controllers/        auth, tasks, teams, chat, assignments, files, notifications, insights, ai
  services/           access control (team/channel/assignment membership), notifications, AI logic
  socket/             authenticated Socket.IO (per-user rooms, presence)
database/schema.sql   14 tables + read_receipts, FKs, CHECKs, indexes      database/seed.sql  dev data
scripts/              migrate · seed · make-admin          tests/api-smoke.js  end-to-end API + realtime test
```
Layering note: controllers contain the SQL (parameterized) and call `services/` for shared authorization;
there is no separate repositories layer.

**Tables:** users, teams, team_members, channels, messages, personal_tasks, subtasks, assignments, assignment_recipients,
submissions, comments, notifications, shared_files, activity_logs (+ read_receipts for unread counts).
Personal tasks (`personal_tasks.user_id`) are separate from official assignment records; a task may *link* to an assignment
without changing it or anyone else's data. Tasks are private unless the owner sets `shared_team_id` (team sees title/status/due only — never notes).

## 3. Security model
- Passwords: bcrypt (cost 12). Sessions: JWT in an **HttpOnly, SameSite=Lax, Secure (in production)** cookie. No tokens in JavaScript.
- Roles: student / faculty / admin. Faculty sign-up requires a secret code; admin is granted only via `make-admin` or by another admin.
- **Every query is scoped on the server**: team membership, channel→team, assignment recipient/staff and file access are checked per request.
  Non-members get 404 (existence is not revealed). Submissions are visible only to the student and team staff.
- Parameterized SQL everywhere; whitelisted sort/filter values; LIKE wildcards escaped.
- XSS: all dynamic text is HTML-escaped; strict CSP (`script-src 'self'`, no inline scripts).
- Rate limits on login/register/password/join-code/upload/AI. Origin check on state-changing requests.
- Uploads: extension allow-list, random stored names, size limit (`MAX_UPLOAD_MB`), downloaded as attachments with `nosniff`.
- Secrets live only in `.env` (git-ignored). Errors shown to users are friendly; details go to server logs only.

## 4. AI Study Assistant
Works out of the box with built-in logic over *your real data*: next-task ranking, 3-day schedule, deadline-conflict detection,
assignment summary, assignment → subtasks, weekly report. To also use an LLM for the free-form chat box, set `ANTHROPIC_API_KEY`
(and optionally `AI_MODEL`). The key is only used server-side; if it is missing or the provider fails, the app falls back automatically.

## 5. Testing
```bash
npm start &                      # in another terminal, with a freshly seeded DB (use a throw-away Neon branch/database!)
npm install                      # includes socket.io-client
BASE=http://localhost:5000 npm run test:api
```
`tests/api-smoke.js` checks registration/login, role rules, privacy between users, tasks/subtasks, teams & invite codes,
channels, live Socket.IO delivery, assignments → submission → review → grade/return, uploads/downloads, analytics, AI endpoints,
admin protection and CSRF. **It creates and modifies data — never run it against production.**

## 6. Deployment
Express serves the frontend too, so a single Node host is enough (Render, Railway, Fly.io, a VPS…).
1. Push to GitHub (`.env` is ignored). 2. Create a Web Service: build `npm install`, start `npm start`.
3. Set env vars: `NODE_ENV=production`, `DATABASE_URL`, `DB_SSL=true`, `JWT_SECRET`, `FACULTY_SIGNUP_CODE`, `UPLOAD_DIR`.
4. Run `npm run migrate` once (e.g. from the host shell). 5. Use the host's HTTPS URL — `Secure` cookies require HTTPS.
6. **Uploads are stored on disk**: attach a persistent disk and point `UPLOAD_DIR` at it (ephemeral filesystems lose files on redeploy).
7. Socket.IO needs a host that supports WebSockets and a single instance (or sticky sessions + an adapter if you scale out).
8. Static frontend on another host: set `CLIENT_ORIGIN` and serve with the same site/domain family so cookies are sent (same-site recommended).

## 7. Known limitations
- No email verification or password-reset email yet (needs an email provider). Admins can change roles but not reset passwords.
- Presence (online dots) is broadcast to all connected users — fine for a college, not for a large public service.
- Files live on local disk (see deployment). No virus scanning.
- Group (multi-student) submissions and rubric grading are not implemented; assignments go to a team or selected students.
- Live-AI path (`ANTHROPIC_API_KEY`) was not exercised in testing; the built-in path was.
