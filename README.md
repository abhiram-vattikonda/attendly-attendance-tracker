# Attendly — Medical Attendance Tracker

A responsive attendance website preloaded with the weekly timetable from the supplied image. It includes a daily register, monthly subject-wise attendance percentages, timetable administration, subject administration, backup export, and optional Supabase cloud sync with separate private data for every account.

## What's included

- **Overview:** monthly attendance percentage, present/absent/cancelled/unmarked totals, calendar, and subject-wise report.
- **Daily attendance:** mark each class as Present, Absent, Cancelled, or Unmarked. Change a subject for a specific date when the actual class differs from the timetable.
- **Saturday variable class:** Saturday 9 AM–12 PM is created as a variable subject. Choose the subject for each Saturday from the daily attendance screen.
- **Timetable admin:** edit a slot's day, time, subject, or variable status; add or remove slots.
- **Subject admin:** add or rename subjects.
- **Monthly generation:** create missing class records for a month without overwriting anything already marked.
- **Backup:** export your current data as JSON from the sidebar or Overview page.
- **Local mode:** works immediately without a backend; data is saved in the current browser only.
- **Cloud mode:** Supabase authentication + Row Level Security for private, cross-device data.
- **Multiple accounts:** every signed-up account gets its own private subjects, timetable and attendance records. Accounts never see each other's data.

## Attendance calculation

For each subject and month:

`Attendance % = Present / (Present + Absent) × 100`

Cancelled and Unmarked sessions are excluded from the denominator. A two-hour or three-hour timetable block counts as one class session, just like a one-hour block. Repeated periods for the same subject count as separate sessions.

## Multiple accounts

Cloud mode supports any number of accounts. Each account has its own subjects, timetable, and class records, and Row Level Security enforces that separation at the database level. To add another person, sign out and choose **Create account** on the sign-in screen. They can also sign in on another device and see their own data.

The schema is safe to run again on an older single-user database. Existing subjects, timetable slots, and attendance are assigned to the first profile so nothing is lost; new accounts start with a fresh copy of the default timetable.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. With no Supabase environment variables, Attendly runs in **Local mode** and saves data to this browser's `localStorage`.

To build a production bundle:

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages with cloud sync

The included GitHub Actions workflow builds and deploys the site whenever you push to `main` or `master`.

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor → New query**.
3. Copy the complete contents of [`supabase/schema.sql`](supabase/schema.sql), paste it into the editor, and run it once.
4. The schema creates the database tables, per-account Row Level Security policies, and an auth trigger that seeds each new account with the default subjects and weekly timetable.

### 2. Create accounts

After the site is deployed, open it and use the **Create account** tab. Every new account is seeded with the default subjects and timetable automatically.

You can also pre-create accounts in Supabase under **Authentication → Users → Add user**. The same seeding trigger runs for any auth user created there.

Email confirmation is enabled by default in Supabase. New accounts must confirm their email before signing in; you can adjust this under **Authentication → Sign In / Providers → Email**. To make confirmation links work, set **Authentication → URL Configuration → Site URL** to your published website URL.

### 3. Add the Supabase keys to GitHub

In Supabase, open **Project Settings → API** and copy:

- Project URL
- `anon` / publishable public key

In your GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**. Add these exact names:

| Secret name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/publishable key |

**Never add the Supabase `service_role` key to this website or to GitHub Pages.** The website uses the public key; Row Level Security protects the database.

### 4. Push the project to GitHub

Unzip this project, open a terminal inside the `attendance-tracker` folder, and run:

```bash
git init
git add .
git commit -m "Add Attendly attendance tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

If the repository already exists and contains a README or other files, clone it first and copy these project files into that repository instead of creating a separate git history.

### 5. Enable GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy Attendly to GitHub Pages** to finish successfully.
4. GitHub will show the website URL in **Settings → Pages**. It normally looks like `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`.
5. In Supabase, open **Authentication → URL Configuration** and set the Site URL to that published website URL. Add the same URL to the Redirect URLs list.
6. Open your website and create an account, or sign in with an account created in step 2.

After the first setup, every push to `main` automatically rebuilds and deploys the site.

## Local mode vs cloud mode

- **Local mode:** best for trying the app immediately. Data stays in that browser on that device and is not shared with another browser or device.
- **Cloud mode:** add the two Supabase secrets before the GitHub Actions build. Sign-in is required, attendance data is stored in your Supabase project, and each account has its own private workspace.
- Local-mode records are not automatically copied into Supabase. Export a JSON backup before switching modes if you need to keep the test records. The current app provides backup export; it does not currently include a JSON import tool.

## Timetable interpretation

The initial timetable follows the supplied image:

- Monday–Friday: 8–9 AM subject class, 9 AM–12 PM Clinical Postings, lunch 12–1 PM, then the listed afternoon subjects.
- Saturday: 8–9 AM General Medicine, 9 AM–12 PM variable subject, lunch 12–1 PM, then Psychiatry, Pediatrics, Radiology, and ECCA.
- The 4–5 PM Yoga/Sports labels are retained as the combined names shown in the image. You can rename or split these through Subjects and Timetable administration.

The supplied timetable does not show Sunday classes, so Sunday is left empty by default. You can add Sunday support only by extending the timetable schema and UI; the current timetable editor intentionally supports Monday–Saturday.

## Project structure

```text
attendance-tracker/
├── .github/workflows/deploy.yml  # Automatic GitHub Pages deployment
├── src/
│   ├── lib/data.js               # Local + Supabase data access
│   ├── App.jsx                   # App screens and admin workflows
│   ├── main.jsx                  # React entry point
│   └── styles.css                # Responsive UI styles
├── supabase/schema.sql           # Database schema, policies, and seed timetable
├── .env.example                  # Optional local Supabase configuration
├── package.json
└── vite.config.js
```
