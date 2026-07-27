# The Refill Ledger

A standalone, installable version of the medication/script tracker — no Claude
account needed. Data is stored in your own browser (`localStorage`) instead of
Claude's storage.

## What's different from the Claude artifact version

- **Storage**: `src/storageShim.js` polyfills the same `window.storage` API
  the app was originally written against, but backs it with a shared
  Supabase table instead of Claude's account-linked storage. `App.jsx` itself
  is unchanged.
- **Access**: instead of individual logins, everyone uses one shared
  household code (see "Multi-device setup" below). Anyone who enters the
  same code on any device/browser sees and edits the same data. Profiles
  (you, your wife, pets) still exist as before, inside that shared data.
- **Installable**: includes a PWA manifest + service worker, so Android Chrome
  (and desktop Chrome/Edge) will offer "Install app," giving it a home-screen
  icon and a full-screen, no-browser-chrome window.

## Multi-device setup (Supabase)

This only needs doing once.

### 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) and sign up (free, no card needed).
2. Click **New project**, give it any name, set a database password (save it
   somewhere — you likely won't need it again, but just in case), pick any
   region, and create it. Takes about a minute to spin up.

### 2. Create the table
1. In your new project, go to the **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase-setup.sql` from this project, copy its entire contents,
   paste into the SQL editor, and click **Run**.
4. You should see "Success. No rows returned."

### 3. Get your project's API credentials
1. Go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key (not the `service_role`
   one — that one must never be exposed in a website).

### 4. Add them locally (for testing on your PC)
1. Copy `.env.local.example` to a new file called `.env.local`.
2. Paste in your Project URL and anon key.
3. Run `npm run dev` and confirm the app loads and asks for a household code.

### 5. Add them to GitHub (for the deployed site)
1. On your repo, go to **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**, name it `VITE_SUPABASE_URL`, paste your
   Project URL, save.
3. Repeat for `VITE_SUPABASE_ANON_KEY` with your anon key.
4. Push any commit (or re-run the workflow from the **Actions** tab) —
   the deployed site will now be built with these values baked in.

### 6. Pick a household code
The first time you (or your wife) open the deployed site, it'll ask for a
household code. Make one up — **something long and not easily guessed**
(e.g. a random phrase, not a 4-digit PIN), since anyone with this exact code
can read and edit this data. Use the *same* code on every device you want
sharing the same medication list.

A quick note on the security model: there's no per-person login here, so
protection comes entirely from the code itself being hard to guess — similar
to a "anyone with this link" shared document. That's a reasonable trade-off
for household medication logistics, but worth knowing plainly.

## 1. Get it running locally (optional, but good for testing)

You'll need [Node.js](https://nodejs.org) installed (any recent LTS version).

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Add a profile and a
medication, refresh the page — your data should still be there, proving the
localStorage shim works.

## 2. Push it to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Refill Ledger"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/refill-ledger.git
git push -u origin main
```

(Create the empty `refill-ledger` repo on GitHub first, via the "New
repository" button — don't initialize it with a README, so the push above
doesn't conflict.)

## 3. Turn on GitHub Pages

This repo already includes `.github/workflows/deploy.yml`, which builds and
deploys automatically on every push to `main`. You just need to flip one
setting:

1. On GitHub, go to your repo → **Settings** → **Pages**.
2. Under "Build and deployment", set **Source** to **GitHub Actions**.
3. Push any commit (or re-run the workflow from the **Actions** tab).
4. After a minute or two, your site will be live at:
   `https://YOUR-USERNAME.github.io/refill-ledger/`

That's it — no separate hosting account needed, and it stays free at this
scale.

## 4. Install it on your Android phone

1. Open the GitHub Pages URL above in Chrome on your phone.
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. It'll now open full-screen from your home screen, like a normal app.

## Automated email reminders (no exporting needed)

This runs entirely on GitHub's infrastructure, once a day, and emails you
whenever something is due — no need to open the app or re-export a calendar
file.

### 1. Create a free Resend account
1. Go to [resend.com](https://resend.com) and sign up (no card required).
2. Go to **API Keys** → **Create API Key**, copy it — you'll only see it once.

Resend's free tier includes a shared testing sender
(`onboarding@resend.dev`) that works without verifying your own domain,
which is enough to get started. If emails land in spam initially, or you
outgrow the shared sender, connecting your own domain (Resend's guide walks
through it) improves deliverability — not required to get going, though.

### 2. Add four more GitHub secrets
Same place as before (**Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**):

| Secret name | Value |
|---|---|
| `HOUSEHOLD_CODE` | the household code you set up in the app (e.g. `Test123`, or whatever you're actually using) |
| `RESEND_API_KEY` | the key from step 1 |
| `ALERT_EMAIL` | the email address you want reminders sent to |

(`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are reused from the ones
you already added.)

### 3. That's it — it runs automatically
`.github/workflows/send-reminders.yml` runs daily (07:00 UTC by default —
edit the `cron` line in that file if you want a different local time) and
checks every medication for reminders due *that day*. If anything matches,
you get one email listing everything due.

### Test it immediately, without waiting a day
1. Go to your repo's **Actions** tab.
2. Click **Send refill reminder emails** in the left sidebar.
3. Click **Run workflow** → **Run workflow** again to confirm.
4. Check the run's log — it'll say either "No reminders due today" or that it
   sent an email. If you want to force a real test email, temporarily add a
   medication in the app with a refill threshold high enough that today
   falls inside its reminder window, run the workflow, then delete the test
   medication afterward.

### Per-profile email addresses
Each profile (you, your wife, each pet) can have its own reminder email
address — set in the app via **"edit reminder emails"** next to a profile's
name. You can list multiple, comma-separated (e.g. both your emails on a
pet's profile so you both get notified). Any profile left blank falls back
to the `ALERT_EMAIL` secret, if you've set one — so `ALERT_EMAIL` is now
optional if every profile has its own address(es) configured.

### How "due" is decided
Each medication's reminder dates (the same ones shown in the app and put
into the `.ics` export) are calculated once. The email script checks
whether *today* matches one of those exact dates — so you get one email per
reminder, not repeated daily nagging once you're inside the window. If you
miss a day (e.g. GitHub happened to skip a run), that specific one-off email
just won't arrive; the next real reminder date will still fire normally.
