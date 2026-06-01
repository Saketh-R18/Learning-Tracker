# LearnClock — Learning Progress Tracker

A beautiful, multi-user learning tracker with clock-in/clock-out sessions, charts, and Supabase cloud storage. Track any topics you want — fully user-defined.

---

## 🚀 Setup in 4 steps

### Step 1 — Create your Supabase project (free)

1. Go to [https://supabase.com](https://supabase.com) and sign up
2. Click **New project**, give it a name (e.g. `learnclock`), set a database password, pick a region
3. Wait ~2 minutes for it to provision

### Step 2 — Create the database tables

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query** and paste the entire SQL block below, then click **Run**

```sql
-- Profiles table (stores display names)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  updated_at timestamptz default now()
);

-- Topics table (each user's learning subjects)
create table if not exists topics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  color text default '#5b73ff',
  goal_hours integer default 20,
  created_at timestamptz default now()
);

-- Sessions table (clock-in / clock-out records)
create table if not exists sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  topic_id uuid references topics on delete cascade not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz default now()
);

-- Row-level security (users can only see their own data)
alter table profiles enable row level security;
alter table topics enable row level security;
alter table sessions enable row level security;

create policy "Users manage own profile" on profiles for all using (auth.uid() = id);
create policy "Users manage own topics" on topics for all using (auth.uid() = user_id);
create policy "Users manage own sessions" on sessions for all using (auth.uid() = user_id);
```

### Step 3 — Get your API keys

1. In Supabase, go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like `https://xyzabc.supabase.co`)
   - **anon / public key** (long string starting with `eyJ...`)

3. Open `js/supabase-config.js` and replace the placeholders:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
```

### Step 4 — Deploy to GitHub Pages (free)

1. Create a new repository on [https://github.com](https://github.com) — make it **public**
2. Push all files to the repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
3. In your GitHub repo, go to **Settings → Pages**
4. Under **Source**, select **Deploy from a branch → main → / (root)**
5. Click **Save** — your app will be live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`

---

## 📁 File structure

```
learning-tracker/
├── index.html          ← Main app (single-page)
├── css/
│   └── style.css       ← All styles
├── js/
│   ├── supabase-config.js  ← ⚠️ Your API keys go here
│   ├── db.js               ← All Supabase queries
│   ├── auth.js             ← Login / register / logout
│   ├── tracker.js          ← Clock in/out logic + live timer
│   ├── progress.js         ← Charts and analytics
│   ├── sessions.js         ← Session history table
│   ├── topics.js           ← Topic management
│   └── app.js              ← App routing and orchestration
└── README.md
```

---

## ✨ Features

- **Multi-user** — anyone can register and get their own private data
- **User-defined topics** — add any subject with a custom color and hour goal
- **Clock in / Clock out** — separate for each topic, stored in the cloud
- **Live timer** — updates every second while a session is active
- **Progress charts** — bar chart per topic, daily line chart, goal progress bars
- **Session history** — full log with date, clock-in time, clock-out time, duration
- **Responsive** — works on desktop and mobile

---

## 🔒 Security note

Your `SUPABASE_ANON_KEY` is safe to expose in a public repo — it is the public key intended for browser use. Supabase's Row Level Security policies ensure each user can only access their own data.

---

## 🎨 Customization

- Change the accent color: edit `--accent` in `css/style.css`
- Change the app name: search for `LearnClock` in `index.html`
- Add more preset topics: edit the `.preset-chip` buttons in `index.html`
