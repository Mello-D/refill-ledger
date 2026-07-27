// Standalone script (not part of the browser app) meant to run on a daily
// schedule via GitHub Actions. It reads the household's data straight out of
// Supabase, runs it through the exact same scheduling logic the ledger UI
// uses, and emails you (via Resend's API) about anything due today.
//
// Required environment variables (see .github/workflows/send-reminders.yml):
//   SUPABASE_URL          - same as VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY      - same as VITE_SUPABASE_ANON_KEY
//   HOUSEHOLD_CODE          - the household code this script should check
//   RESEND_API_KEY          - from resend.com
//   ALERT_EMAIL             - where to send reminder emails
//   ALERT_FROM_EMAIL        - optional; defaults to Resend's shared test sender

import { createClient } from "@supabase/supabase-js";
import { computeSchedule, todayISO } from "../src/scheduleLogic.js";

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  HOUSEHOLD_CODE,
  RESEND_API_KEY,
  ALERT_EMAIL,
  ALERT_FROM_EMAIL,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
requireEnv("SUPABASE_URL", SUPABASE_URL);
requireEnv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
requireEnv("HOUSEHOLD_CODE", HOUSEHOLD_CODE);
requireEnv("RESEND_API_KEY", RESEND_API_KEY);
// ALERT_EMAIL is now optional — it's only used as a fallback for profiles
// that don't have their own alertEmails set. If every profile has its own
// email(s) configured in the app, this can be left unset.
if (!ALERT_EMAIL) {
  console.warn(
    "ALERT_EMAIL is not set — profiles without their own reminder email(s) will be skipped."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchHouseholdData() {
  const { data, error } = await supabase.rpc("get_household", { code: HOUSEHOLD_CODE });
  if (error) throw error;
  const store = data || {};
  const raw = store["personal:refill-ledger-data"];
  if (!raw) return { profiles: [], medications: [] };
  return JSON.parse(raw);
}

async function sendEmail(to, subject, htmlBody) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL || "Refill Ledger <onboarding@resend.dev>",
      to,
      subject,
      html: htmlBody,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error (${res.status}): ${text}`);
  }
}

function buildEmailHtml(profileName, items) {
  const rows = items
    .map(
      ({ medName, reminder }) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${medName}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${
          reminder.isDoctor ? "Book doctor appointment" : "Refill needed"
        }</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${reminder.detail}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:600px;">
      <h2 style="color:#3D6B5C;">The Refill Ledger — ${profileName}'s reminders for today</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Medication</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Action</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Details</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function main() {
  const data = await fetchHouseholdData();
  const today = todayISO();

  // Group today's reminders by profile, so each profile can be emailed to
  // its own recipient list.
  const byProfile = new Map(); // profileId -> { profileName, alertEmails, items: [] }

  for (const med of data.medications) {
    const profile = data.profiles.find((p) => p.id === med.profileId);
    const profileName = profile ? profile.name : "Unassigned";
    const alertEmails =
      profile && profile.alertEmails && profile.alertEmails.length
        ? profile.alertEmails
        : ALERT_EMAIL
        ? [ALERT_EMAIL]
        : [];

    const schedule = computeSchedule(med);
    for (const reminder of schedule.reminders) {
      if (reminder.date !== today) continue;
      const key = med.profileId || "unassigned";
      if (!byProfile.has(key)) {
        byProfile.set(key, { profileName, alertEmails, items: [] });
      }
      byProfile.get(key).items.push({ medName: med.name, reminder });
    }
  }

  if (byProfile.size === 0) {
    console.log(`No reminders due today (${today}). Nothing to send.`);
    return;
  }

  for (const [, { profileName, alertEmails, items }] of byProfile) {
    if (alertEmails.length === 0) {
      console.warn(
        `Skipping ${items.length} reminder(s) for ${profileName} — no alertEmails set on this ` +
          `profile and no default ALERT_EMAIL configured.`
      );
      continue;
    }
    const subject = `Refill Ledger: ${items.length} reminder${
      items.length > 1 ? "s" : ""
    } for ${profileName} today`;
    await sendEmail(alertEmails, subject, buildEmailHtml(profileName, items));
    console.log(`Sent email to ${alertEmails.join(", ")} for ${profileName} (${items.length} item(s)).`);
  }
}

main().catch((err) => {
  console.error("Failed to run reminder check:", err);
  process.exit(1);
});
