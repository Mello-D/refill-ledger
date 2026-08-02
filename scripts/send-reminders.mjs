// Standalone script (not part of the browser app) meant to run on a daily
// schedule via GitHub Actions. It reads the household's data straight out of
// Supabase, runs it through the exact same scheduling logic the ledger UI
// uses, and emails you (via your own Gmail account) about anything due today.
//
// Required environment variables (see .github/workflows/send-reminders.yml):
//   SUPABASE_URL          - same as VITE_SUPABASE_URL
//   SUPABASE_ANON_KEY      - same as VITE_SUPABASE_ANON_KEY
//   HOUSEHOLD_CODE          - the household code this script should check
//   GMAIL_USER              - the Gmail address emails are sent FROM
//   GMAIL_APP_PASSWORD      - a 16-character App Password (not your normal
//                             Gmail password) — generate one at
//                             myaccount.google.com/apppasswords, which
//                             requires 2-Step Verification to be turned on
//   ALERT_EMAIL             - optional fallback recipient for profiles with
//                             no alertEmails of their own

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { computeSchedule, todayISO, daysBetween } from "../src/scheduleLogic.js";

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  HOUSEHOLD_CODE,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  ALERT_EMAIL,
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
requireEnv("GMAIL_USER", GMAIL_USER);
requireEnv("GMAIL_APP_PASSWORD", GMAIL_APP_PASSWORD);
// ALERT_EMAIL is optional — it's only used as a fallback for profiles that
// don't have their own alertEmails set. If every profile has its own
// email(s) configured in the app, this can be left unset.
if (!ALERT_EMAIL) {
  console.warn(
    "ALERT_EMAIL is not set — profiles without their own reminder email(s) will be skipped."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

async function fetchHouseholdData() {
  const { data, error } = await supabase.rpc("get_household", { code: HOUSEHOLD_CODE });
  if (error) throw error;
  const store = data || {};
  const raw = store["personal:refill-ledger-data"];
  if (!raw) return { profiles: [], medications: [] };
  return JSON.parse(raw);
}

async function sendEmail(to, subject, htmlBody) {
  await transporter.sendMail({
    from: `Refill Ledger <${GMAIL_USER}>`,
    to: to.join(", "),
    subject,
    html: htmlBody,
  });
}

function buildEmailHtml(items) {
  const rows = items
    .map(
      ({ profileName, medName, reminder, daysOverdue }) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${profileName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;"><strong>${medName}</strong></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${
          reminder.isDoctor ? "Book doctor appointment" : "Refill needed"
        }</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${
          daysOverdue === 0 ? "First flagged today" : `Flagged ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} ago`
        }</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${reminder.detail}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:650px;">
      <h2 style="color:#3D6B5C;">The Refill Ledger — today's reminders</h2>
      <p style="color:#6B6A5E;font-size:0.9em;">
        These will keep appearing daily until each medication is marked as
        collected (or a new script logged) in the app.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Who</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Medication</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Action</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #3D6B5C;">Since</th>
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

  // Group today's reminders by recipient EMAIL ADDRESS rather than by
  // profile — so if the same address is set on multiple profiles (or a
  // profile has several due items), everything lands in one combined email
  // with a table showing which profile/medication each row belongs to.
  const byEmail = new Map(); // email -> items[]

  for (const med of data.medications) {
    const profile = data.profiles.find((p) => p.id === med.profileId);
    const profileName = profile ? profile.name : "Unassigned";
    const alertEmails =
      profile && profile.alertEmails && profile.alertEmails.length
        ? profile.alertEmails
        : ALERT_EMAIL
        ? [ALERT_EMAIL]
        : [];

    if (alertEmails.length === 0) continue;

    const schedule = computeSchedule(med);
    for (const reminder of schedule.reminders) {
      const daysOverdue = daysBetween(reminder.date, today);
      // Once a reminder's date has arrived, keep including it every day
      // (not just the exact date) until the medication is actually
      // collected/renewed — at which point computeSchedule recalculates
      // fresh dates from the new lastFilledDate and this reminder simply
      // stops existing. daysOverdue < 0 means the date hasn't arrived yet.
      if (daysOverdue < 0) continue;

      for (const email of alertEmails) {
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email).push({ profileName, medName: med.name, reminder, daysOverdue });
      }
    }
  }

  if (byEmail.size === 0) {
    console.log(`No reminders due today (${today}). Nothing to send.`);
    return;
  }

  for (const [email, items] of byEmail) {
    const subject = `Refill Ledger: ${items.length} reminder${items.length > 1 ? "s" : ""} today`;
    await sendEmail([email], subject, buildEmailHtml(items));
    console.log(`Sent email to ${email} (${items.length} item(s)).`);
  }
}

main().catch((err) => {
  console.error("Failed to run reminder check:", err);
  process.exit(1);
});
