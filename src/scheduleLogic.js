// Pure scheduling logic, shared between the browser app (src/App.jsx) and
// the standalone reminder-email script (scripts/send-reminders.mjs). Keeping
// this in one place means the email script's "is this due soon" math can
// never drift out of sync with what the ledger UI shows.

export const toISO = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
};
export const todayISO = () => toISO(new Date());
export const addDays = (isoDate, days) => {
  const dt = new Date(isoDate + "T00:00:00");
  dt.setDate(dt.getDate() + Math.round(days));
  return toISO(dt);
};
export const daysBetween = (a, b) => {
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
};
export const formatDisplayDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function computeSchedule(med) {
  const daysPerBox = med.tabletsPerBox / med.tabletsPerDay;
  const reminders = [];
  let boxStart = med.lastFilledDate;
  let runOut = addDays(boxStart, daysPerBox);

  // current box + each remaining repeat
  for (let i = 0; i <= med.repeatsRemaining; i++) {
    const reminderDate = addDays(runOut, -med.refillThresholdDays);
    reminders.push({
      date: reminderDate,
      title: "{name} — refill needed",
      detail:
        i < med.repeatsRemaining
          ? `Supply runs out around ${formatDisplayDate(runOut)}. ${
              med.repeatsRemaining - i
            } repeat(s) left after this fill.`
          : `Supply runs out around ${formatDisplayDate(runOut)}. This is the last repeat — collect it, then book a doctor visit.`,
      runOutDate: runOut,
      isLast: i === med.repeatsRemaining,
    });
    boxStart = runOut;
    runOut = addDays(boxStart, daysPerBox);
  }

  // doctor visit reminder, ahead of final run-out
  const finalRunOut = reminders.length
    ? reminders[reminders.length - 1].runOutDate
    : runOut;
  const doctorDate = addDays(finalRunOut, -med.doctorThresholdDays);
  reminders.push({
    date: doctorDate,
    title: "{name} — book doctor appointment",
    detail: `Repeats will be used up by ${formatDisplayDate(
      finalRunOut
    )}. Book a doctor's visit for a new script.`,
    runOutDate: finalRunOut,
    isDoctor: true,
  });

  reminders.sort((a, b) => (a.date < b.date ? -1 : 1));

  const daysPerBoxRounded = Math.round(daysPerBox * 10) / 10;
  const daysSinceFill = daysBetween(med.lastFilledDate, todayISO());
  const tabletsUsed = Math.max(0, Math.floor(daysSinceFill * med.tabletsPerDay));
  const tabletsRemaining = Math.max(0, med.tabletsPerBox - tabletsUsed);
  const currentRunOut = addDays(med.lastFilledDate, daysPerBox);
  const daysLeft = daysBetween(todayISO(), currentRunOut);

  let status = "ok";
  if (daysLeft <= 0) status = "overdue";
  else if (daysLeft <= med.refillThresholdDays) status = "soon";
  if (med.repeatsRemaining === 0 && daysBetween(todayISO(), finalRunOut) <= med.doctorThresholdDays)
    status = status === "overdue" ? "overdue" : "doctor";

  return {
    daysPerBox: daysPerBoxRounded,
    tabletsRemaining,
    currentRunOut,
    daysLeft,
    status,
    reminders,
  };
}

export function buildICS(profiles, medications) {
  const escapeICS = (s) => String(s).replace(/([,;])/g, "\\$1");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RefillLedger//EN",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  medications.forEach((med) => {
    const profile = profiles.find((p) => p.id === med.profileId);
    const profileName = profile ? profile.name : "Unassigned";
    const schedule = computeSchedule(med);
    schedule.reminders.forEach((r, idx) => {
      const dt = r.date.replace(/-/g, "");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${med.id}-${idx}-${dt}@refill-ledger`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(r.date, 1).replace(/-/g, "")}`);
      lines.push(
        `SUMMARY:${escapeICS(r.title.replace("{name}", profileName + " – " + med.name))}`
      );
      lines.push(`DESCRIPTION:${escapeICS(r.detail)}`);
      lines.push("END:VEVENT");
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
