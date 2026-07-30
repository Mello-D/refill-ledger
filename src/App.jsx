import { useState, useEffect, useCallback } from "react";
import {
  toISO,
  todayISO,
  addDays,
  daysBetween,
  formatDisplayDate,
  uid,
  computeSchedule,
  buildICS,
} from "./scheduleLogic";


// ---------- storage ----------
const STORAGE_KEY = "refill-ledger-data";
async function loadData() {
  try {
    const res = await window.storage.get(STORAGE_KEY, false);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) {
    /* key doesn't exist yet */
  }
  return { profiles: [], medications: [] };
}
async function saveData(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data), false);
  } catch (e) {
    console.error("Save failed", e);
  }
}

// ---------- UI atoms ----------
const PROFILE_ICONS = { person: "person", pet: "pet" };

function IconPerson({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4 20c1.2-4 4.2-6 8-6s6.8 2 8 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconHome({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5 12 4l8 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v9a1 1 0 0 0 1 1h4v-5h2v5h4a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconPaw({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <ellipse cx="12" cy="16" rx="5.4" ry="4.4" />
      <ellipse cx="5.3" cy="9.4" rx="2.1" ry="2.6" />
      <ellipse cx="10.2" cy="6.2" rx="2.1" ry="2.7" />
      <ellipse cx="15.6" cy="6.2" rx="2.1" ry="2.7" />
      <ellipse cx="18.7" cy="9.4" rx="2.1" ry="2.6" />
    </svg>
  );
}
function IconPaperScript({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15 3v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11h8M8 14.5h8M8 18h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconEscript({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 12.5l2 2 2-2M13 14.5l2-2 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabletGrid({ total, remaining, unit = "tablets" }) {
  const displayRemaining = unit === "ml" ? Math.round(remaining * 10) / 10 : Math.round(remaining);
  const unitLabel = unit === "ml" ? "mL" : "tablets";
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div className="tablet-count">
      <div className="tablet-count-row">
        <span className="tablet-count-num">{displayRemaining}</span>
        <span className="tablet-count-of"> / {total} {unitLabel}</span>
      </div>
      <div className="tablet-progress-track">
        <div className="tablet-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------- main component ----------
export default function RefillLedger() {
  const [data, setData] = useState(null);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showAddMed, setShowAddMed] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [newScriptMed, setNewScriptMed] = useState(null);
  const [toast, setToast] = useState(null);
  const [windowDays, setWindowDays] = useState(14);

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      // Land on the dashboard (activeProfileId stays null) rather than
      // jumping straight into whichever profile happens to be first.
    });
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    saveData(next);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  if (!data) {
    return (
      <div className="rl-root rl-loading">
        <style>{CSS}</style>
        <div className="loading-mark">Opening the ledger…</div>
      </div>
    );
  }

  const profiles = data.profiles;
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;
  const meds = data.medications.filter((m) => m.profileId === activeProfileId);

  function saveProfile(profile) {
    const exists = profiles.some((p) => p.id === profile.id);
    const nextProfiles = exists
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    persist({ ...data, profiles: nextProfiles });
    if (!exists) setActiveProfileId(profile.id);
    setShowAddProfile(false);
    setEditingProfile(null);
  }

  function removeProfile(id) {
    if (!confirm("Remove this profile and all its medications?")) return;
    const next = {
      profiles: profiles.filter((p) => p.id !== id),
      medications: data.medications.filter((m) => m.profileId !== id),
    };
    persist(next);
    if (activeProfileId === id) {
      setActiveProfileId(null);
    }
  }

  function saveMed(med) {
    const exists = data.medications.some((m) => m.id === med.id);
    const nextMeds = exists
      ? data.medications.map((m) => (m.id === med.id ? med : m))
      : [...data.medications, med];
    persist({ ...data, medications: nextMeds });
    setShowAddMed(false);
    setEditingMed(null);
  }

  function deleteMed(id) {
    if (!confirm("Delete this medication?")) return;
    persist({ ...data, medications: data.medications.filter((m) => m.id !== id) });
  }

  function markRefilled(med) {
    if (med.repeatsRemaining <= 0) {
      showToast("No repeats left — use \"New script from doctor\" instead");
      return;
    }
    const history = med.history || [];
    const updated = {
      ...med,
      lastFilledDate: todayISO(),
      repeatsRemaining: Math.max(0, med.repeatsRemaining - 1),
      history: [...history, { date: todayISO(), action: "Collected next box" }],
    };
    saveMed(updated);
    showToast(`${med.name}: next box collected, repeats decreased by 1`);
  }

  function logNewScript(med, newRepeats, filledDate) {
    const history = med.history || [];
    const updated = {
      ...med,
      lastFilledDate: filledDate,
      repeatsRemaining: newRepeats,
      history: [
        ...history,
        { date: todayISO(), action: `New script from doctor (${newRepeats} repeats)` },
      ],
    };
    saveMed(updated);
    setNewScriptMed(null);
    showToast(`${med.name}: new script logged with ${newRepeats} repeats`);
  }

  function downloadCalendar(scopeProfileId) {
    const scopedMeds = scopeProfileId
      ? data.medications.filter((m) => m.profileId === scopeProfileId)
      : data.medications;
    if (!scopedMeds.length) {
      showToast("No medications to export yet");
      return;
    }
    const ics = buildICS(data.profiles, scopedMeds);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scopeProfileId
      ? `refill-reminders-${(
          data.profiles.find((p) => p.id === scopeProfileId)?.name || "profile"
        ).toLowerCase().replace(/\s+/g, "-")}.ics`
      : "refill-reminders-all.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Calendar file downloaded — import it into your calendar app");
  }

  return (
    <div className="rl-root">
      <style>{CSS}</style>

      <header className="rl-header">
        <div className="rl-header-inner">
          <div className="rl-brand">
            <div className="rl-brand-mark">℞</div>
            <div>
              <h1>The Refill Ledger</h1>
              <p className="rl-tagline">One page for every prescription in the house.</p>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => downloadCalendar(null)}>
            Export all reminders
          </button>
        </div>
      </header>

      <div className="rl-body">
        <nav className="rl-profiles">
          <button
            className={"profile-tab" + (activeProfileId === null ? " active" : "")}
            onClick={() => setActiveProfileId(null)}
          >
            <span className="profile-icon">
              <IconHome size={16} />
            </span>
            Home
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              className={"profile-tab" + (p.id === activeProfileId ? " active" : "")}
              onClick={() => setActiveProfileId(p.id)}
            >
              <span className="profile-icon">
                {p.type === "pet" ? <IconPaw size={16} /> : <IconPerson size={16} />}
              </span>
              {p.name}
            </button>
          ))}
          <button className="profile-tab add-tab" onClick={() => setShowAddProfile(true)}>
            + Add person or pet
          </button>
        </nav>

        <main className="rl-main">
          {activeProfileId === null && (
            <Dashboard
              data={data}
              windowDays={windowDays}
              setWindowDays={setWindowDays}
              onSelectProfile={setActiveProfileId}
            />
          )}

          {activeProfileId !== null && !activeProfile && (
            <div className="empty-state">
              <p>That profile no longer exists.</p>
              <button className="btn btn-primary" onClick={() => setActiveProfileId(null)}>
                Back to home
              </button>
            </div>
          )}

          {activeProfile && (
            <>
              <div className="section-row">
                <h2>
                  {activeProfile.name}'s medications
                  <button className="link-btn" onClick={() => setEditingProfile(activeProfile)}>
                    edit reminder emails
                  </button>
                  <button
                    className="link-btn danger"
                    onClick={() => removeProfile(activeProfile.id)}
                  >
                    remove profile
                  </button>
                </h2>
                <p className="profile-emails-line">
                  {activeProfile.alertEmails && activeProfile.alertEmails.length
                    ? `Reminders go to: ${activeProfile.alertEmails.join(", ")}`
                    : "No reminder email set — using the default ALERT_EMAIL"}
                </p>
                <div className="section-actions">
                  <button
                    className="btn btn-ghost small"
                    onClick={() => downloadCalendar(activeProfile.id)}
                  >
                    Export {activeProfile.name}'s reminders
                  </button>
                  <button className="btn btn-primary small" onClick={() => setShowAddMed(true)}>
                    + Add medication
                  </button>
                </div>
              </div>

              {meds.length === 0 && (
                <div className="empty-state small">
                  <p>No medications logged for {activeProfile.name} yet.</p>
                </div>
              )}

              <div className="med-grid">
                {meds.map((med) => {
                  const s = computeSchedule(med);
                  const nextReminder = s.reminders.find((r) => r.date >= todayISO()) || s.reminders[0];
                  return (
                    <div
                      key={med.id}
                      className={
                        "med-card status-" + s.status + " script-" + (med.scriptType || "escript")
                      }
                    >
                      <div className="med-card-top">
                        <div>
                          <h3>
                            {med.name}
                            <span className={"script-chip script-" + (med.scriptType || "escript")}>
                              {med.scriptType === "paper" ? (
                                <>
                                  <IconPaperScript size={12} /> Paper
                                </>
                              ) : (
                                <>
                                  <IconEscript size={12} /> eScript
                                </>
                              )}
                            </span>
                          </h3>
                          <p className="med-sub">
                            {med.unit === "ml"
                              ? `${med.tabletsPerDay} mL/day`
                              : `${med.tabletsPerDay} tablet${med.tabletsPerDay !== 1 ? "s" : ""}/day`}{" "}
                            ·{" "}
                            {med.unit === "ml"
                              ? `${med.tabletsPerBox} mL per box`
                              : `${med.tabletsPerBox} per box`}{" "}
                            · {med.repeatsRemaining} repeat
                            {med.repeatsRemaining !== 1 ? "s" : ""} left
                          </p>
                        </div>
                        <span className={"status-pill status-" + s.status}>
                          {s.status === "overdue" && "Overdue"}
                          {s.status === "soon" && "Refill soon"}
                          {s.status === "doctor" && "See doctor"}
                          {s.status === "lastbox" && "Last box \u2014 no repeats"}
                          {s.status === "ok" && "On track"}
                        </span>
                      </div>

                      <TabletGrid
                        total={med.tabletsPerBox}
                        remaining={s.tabletsRemaining}
                        unit={med.unit || "tablets"}
                      />

                      <div className="med-meta">
                        <div>
                          <span className="meta-label">Current box runs out</span>
                          <span className="meta-value">{formatDisplayDate(s.currentRunOut)}</span>
                        </div>
                        <div>
                          <span className="meta-label">Next reminder</span>
                          <span className="meta-value">
                            {nextReminder ? formatDisplayDate(nextReminder.date) : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="med-actions">
                        {med.repeatsRemaining > 0 ? (
                          <button className="btn btn-primary small" onClick={() => markRefilled(med)}>
                            Collected next box
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary small"
                            onClick={() => setNewScriptMed(med)}
                          >
                            New script from doctor
                          </button>
                        )}
                        {med.repeatsRemaining > 0 && (
                          <button className="link-btn" onClick={() => setNewScriptMed(med)}>
                            log new script instead
                          </button>
                        )}
                        <button className="link-btn" onClick={() => setEditingMed(med)}>
                          edit
                        </button>
                        <button className="link-btn danger" onClick={() => deleteMed(med.id)}>
                          delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {(showAddProfile || editingProfile) && (
        <ProfileForm
          initial={editingProfile}
          onCancel={() => {
            setShowAddProfile(false);
            setEditingProfile(null);
          }}
          onSave={saveProfile}
        />
      )}

      {(showAddMed || editingMed) && (
        <MedForm
          initial={editingMed}
          profileId={activeProfileId}
          onCancel={() => {
            setShowAddMed(false);
            setEditingMed(null);
          }}
          onSave={saveMed}
        />
      )}

      {newScriptMed && (
        <NewScriptModal
          med={newScriptMed}
          onCancel={() => setNewScriptMed(null)}
          onConfirm={(repeats, filledDate) => logNewScript(newScriptMed, repeats, filledDate)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Dashboard({ data, windowDays, setWindowDays, onSelectProfile }) {
  const today = todayISO();

  const upcoming = [];
  data.medications.forEach((med) => {
    const profile = data.profiles.find((p) => p.id === med.profileId);
    const schedule = computeSchedule(med);
    schedule.reminders.forEach((r) => {
      // Use the actual run-out date (when the last tablet/dose would be
      // taken) rather than the reminder date — the reminder date is what
      // the emails are for, this table is meant to show real deadlines.
      const diff = daysBetween(today, r.runOutDate);
      if (diff <= windowDays) {
        upcoming.push({
          date: r.runOutDate,
          diff,
          profileName: profile ? profile.name : "Unassigned",
          profileId: med.profileId,
          medName: med.name,
          isDoctor: !!r.isDoctor,
          detail: r.detail,
        });
      }
    });
  });
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <div className="dashboard">
      {data.profiles.length === 0 && (
        <div className="empty-state">
          <p>No profiles yet — add one from the sidebar to begin.</p>
        </div>
      )}

      <div className="dashboard-table-header">
        <h3>Upcoming due dates</h3>
        <label className="window-select-label">
          Show scripts due in the next{" "}
          <select
            className="window-select"
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      {upcoming.length === 0 ? (
        <div className="empty-state small">
          <p>Nothing due in the next {windowDays} days.</p>
        </div>
      ) : (
        <div className="upcoming-table-wrap">
          <table className="upcoming-table">
            <thead>
              <tr>
                <th>Due date</th>
                <th>Who</th>
                <th>Medication</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((item, idx) => (
                <tr
                  key={idx}
                  className={item.diff < 0 ? "row-overdue" : ""}
                  onClick={() => onSelectProfile(item.profileId)}
                >
                  <td>
                    {formatDisplayDate(item.date)}
                    <span className="days-away">
                      {item.diff < 0
                        ? `overdue by ${-item.diff}d`
                        : item.diff === 0
                        ? "today"
                        : `in ${item.diff}d`}
                    </span>
                  </td>
                  <td>{item.profileName}</td>
                  <td>{item.medName}</td>
                  <td>
                    <span className={"action-chip " + (item.isDoctor ? "action-doctor" : "action-refill")}>
                      {item.isDoctor ? "See doctor" : "Refill"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ProfileForm({ initial, onCancel, onSave }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [type, setType] = useState(initial ? initial.type : "person");
  const [emailsInput, setEmailsInput] = useState(
    initial && initial.alertEmails ? initial.alertEmails.join(", ") : ""
  );

  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    const alertEmails = emailsInput
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    onSave({
      id: initial ? initial.id : uid(),
      name: name.trim(),
      type,
      alertEmails,
    });
  }

  return (
    <Modal title={initial ? "Edit profile" : "Add a profile"} onClose={onCancel}>
      <label className="field-label">Name</label>
      <input
        className="field-input"
        placeholder="e.g. Sarah, or Buddy"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <label className="field-label">Type</label>
      <div className="radio-row">
        <button
          className={"radio-btn" + (type === "person" ? " active" : "")}
          onClick={() => setType("person")}
        >
          <IconPerson size={16} /> Person
        </button>
        <button
          className={"radio-btn" + (type === "pet" ? " active" : "")}
          onClick={() => setType("pet")}
        >
          <IconPaw size={16} /> Pet
        </button>
      </div>

      <label className="field-label">Reminder email(s)</label>
      <input
        className="field-input"
        placeholder="e.g. dave@email.com, sarah@email.com"
        value={emailsInput}
        onChange={(e) => setEmailsInput(e.target.value)}
      />
      <p className="field-hint">
        Separate multiple addresses with commas — useful for a pet profile you both
        want reminders for. Leave blank to use the default ALERT_EMAIL instead.
      </p>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
          {initial ? "Save changes" : "Add profile"}
        </button>
      </div>
    </Modal>
  );
}

function MedForm({ initial, profileId, onCancel, onSave }) {
  const [form, setForm] = useState(
    initial || {
      id: uid(),
      profileId,
      name: "",
      tabletsPerBox: 30,
      tabletsPerDay: 1,
      repeatsRemaining: 6,
      lastFilledDate: todayISO(),
      refillThresholdDays: 7,
      doctorThresholdDays: 14,
      scriptType: "escript",
      unit: "tablets",
      history: [],
    }
  );

  const set = (key) => (e) => {
    const raw = e.target.value;
    const numeric = ["tabletsPerBox", "tabletsPerDay", "repeatsRemaining", "refillThresholdDays", "doctorThresholdDays"];
    setForm({ ...form, [key]: numeric.includes(key) ? Number(raw) : raw });
  };

  const canSave = form.name.trim() && form.tabletsPerBox > 0 && form.tabletsPerDay > 0;
  const isMl = form.unit === "ml";

  return (
    <Modal title={initial ? "Edit medication" : "Add medication"} onClose={onCancel}>
      <label className="field-label">Medication name</label>
      <input className="field-input" placeholder="e.g. Atorvastatin 20mg" value={form.name} onChange={set("name")} autoFocus />

      <label className="field-label">Script type</label>
      <div className="radio-row">
        <button
          className={"radio-btn" + (form.scriptType !== "paper" ? " active" : "")}
          onClick={() => setForm({ ...form, scriptType: "escript" })}
        >
          <IconEscript size={16} /> eScript
        </button>
        <button
          className={"radio-btn" + (form.scriptType === "paper" ? " active" : "")}
          onClick={() => setForm({ ...form, scriptType: "paper" })}
        >
          <IconPaperScript size={16} /> Paper
        </button>
      </div>

      <label className="field-label">Dose measured in</label>
      <div className="radio-row">
        <button
          className={"radio-btn" + (!isMl ? " active" : "")}
          onClick={() => setForm({ ...form, unit: "tablets" })}
        >
          Tablets
        </button>
        <button
          className={"radio-btn" + (isMl ? " active" : "")}
          onClick={() => setForm({ ...form, unit: "ml" })}
        >
          mL (liquid)
        </button>
      </div>

      <div className="field-row">
        <div>
          <label className="field-label">{isMl ? "Amount per box (mL)" : "Tablets per box"}</label>
          <input
            type="number"
            min="0.1"
            step={isMl ? "0.1" : "1"}
            className="field-input"
            value={form.tabletsPerBox}
            onChange={set("tabletsPerBox")}
          />
        </div>
        <div>
          <label className="field-label">{isMl ? "Amount per day (mL)" : "Tablets per day"}</label>
          <input
            type="number"
            min="0.1"
            step={isMl ? "0.1" : "0.25"}
            className="field-input"
            value={form.tabletsPerDay}
            onChange={set("tabletsPerDay")}
          />
        </div>
      </div>

      <div className="field-row">
        <div>
          <label className="field-label">Repeats remaining</label>
          <input type="number" min="0" className="field-input" value={form.repeatsRemaining} onChange={set("repeatsRemaining")} />
        </div>
        <div>
          <label className="field-label">Last filled date</label>
          <input type="date" className="field-input" value={form.lastFilledDate} onChange={set("lastFilledDate")} />
        </div>
      </div>

      <div className="field-row">
        <div>
          <label className="field-label">Remind me before running out (days)</label>
          <input type="number" min="0" className="field-input" value={form.refillThresholdDays} onChange={set("refillThresholdDays")} />
        </div>
        <div>
          <label className="field-label">Doctor reminder lead time (days)</label>
          <input type="number" min="0" className="field-input" value={form.doctorThresholdDays} onChange={set("doctorThresholdDays")} />
        </div>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!canSave} onClick={() => canSave && onSave(form)}>
          Save medication
        </button>
      </div>
    </Modal>
  );
}

function NewScriptModal({ med, onCancel, onConfirm }) {
  const [repeats, setRepeats] = useState(6);
  const [filledDate, setFilledDate] = useState(todayISO());

  return (
    <Modal title={`New script for ${med.name}`} onClose={onCancel}>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Use this when the doctor issues a brand new script — separate from just
        collecting the next box on an existing script's repeats.
      </p>
      <label className="field-label">Repeats on the new script</label>
      <input
        type="number"
        min="0"
        className="field-input"
        value={repeats}
        onChange={(e) => setRepeats(Number(e.target.value))}
        autoFocus
      />
      <label className="field-label">Date this box was collected</label>
      <input
        type="date"
        className="field-input"
        value={filledDate}
        onChange={(e) => setFilledDate(e.target.value)}
      />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onConfirm(repeats, filledDate)}>
          Save new script
        </button>
      </div>
    </Modal>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');

.rl-root {
  --bg: #F6F4EF;
  --surface: #FFFFFF;
  --surface-alt: #EFEBE0;
  --ink: #23271F;
  --ink-soft: #6B6A5E;
  --sage: #3D6B5C;
  --sage-dark: #2A4A3F;
  --rust: #B5542A;
  --rust-soft: #F3E1CE;
  --border: #DBD5C4;
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100%;
  padding-bottom: 3rem;
}
.rl-root * { box-sizing: border-box; }
.rl-loading { display:flex; align-items:center; justify-content:center; min-height: 300px; }
.loading-mark { font-family:'Fraunces',serif; font-size:1.2rem; color: var(--ink-soft); }

.rl-header { border-bottom: 1px solid var(--border); background: var(--surface); }
.rl-header-inner {
  max-width: 980px; margin: 0 auto; padding: 1.4rem 1.5rem;
  display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;
}
.rl-brand { display:flex; align-items:center; gap: 0.9rem; }
.rl-brand-mark {
  font-family:'Fraunces', serif; font-size:1.6rem; font-weight:600;
  width:48px; height:48px; border-radius:50%; background: var(--sage); color:#fff;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.rl-brand h1 { font-family:'Fraunces', serif; font-size:1.5rem; font-weight:600; margin:0; letter-spacing:-0.01em; }
.rl-tagline { margin:0.1rem 0 0; color: var(--ink-soft); font-size:0.88rem; }

.rl-body { max-width: 980px; margin: 0 auto; padding: 1.5rem; display:flex; gap:1.8rem; align-items:flex-start; flex-wrap:wrap; }
.rl-profiles { display:flex; flex-direction:column; gap:0.4rem; min-width:180px; }
.profile-tab {
  display:flex; align-items:center; gap:0.5rem; text-align:left;
  padding:0.55rem 0.8rem; border-radius:8px; border:1px solid transparent;
  background:transparent; color: var(--ink-soft); font-size:0.92rem; font-weight:500; cursor:pointer;
}
.profile-tab:hover { background: var(--surface-alt); }
.profile-tab.active { background: var(--surface); border-color: var(--border); color: var(--ink); font-weight:600; }
.profile-icon { color: var(--sage); display:flex; }
.add-tab { color: var(--sage-dark); font-style:italic; }

.rl-main { flex:1; min-width:280px; }
.section-row { display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:0.8rem; margin-bottom:1rem; }
.section-row h2 { font-family:'Fraunces', serif; font-size:1.25rem; font-weight:600; margin:0; display:flex; align-items:baseline; gap:0.8rem; flex-wrap:wrap; }
.profile-emails-line { margin: 0 0 0.9rem; font-size:0.82rem; color: var(--ink-soft); }
.field-hint { font-size:0.78rem; color: var(--ink-soft); margin:0.3rem 0 0; line-height:1.4; }
.section-actions { display:flex; gap:0.5rem; flex-wrap:wrap; }

.empty-state { background: var(--surface); border:1px dashed var(--border); border-radius:12px; padding:2rem; text-align:center; color: var(--ink-soft); }
.empty-state.small { padding:1.2rem; }
.empty-state p { margin: 0 0 1rem; }

.profile-chip-row { display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.6rem; }
.profile-jump-chip { display:flex; align-items:center; gap:0.4rem; padding:0.4rem 0.8rem; border-radius:99px; border:1px solid var(--border); background: var(--surface); color: var(--ink); font-size:0.85rem; font-weight:500; cursor:pointer; }
.profile-jump-chip:hover { background: var(--surface-alt); }

.dashboard-table-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem; margin: 0.4rem 0 0.8rem; }
.dashboard-table-header h3 { font-family:'Fraunces', serif; font-size:1.05rem; font-weight:600; margin:0; }
.window-select-label { font-size:0.85rem; color: var(--ink-soft); display:flex; align-items:center; gap:0.4rem; }
.window-select { font-family:'Inter', sans-serif; font-size:0.85rem; padding:0.3rem 0.5rem; border-radius:6px; border:1px solid var(--border); background: var(--surface); color: var(--ink); }

.upcoming-table-wrap { background: var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
.upcoming-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
.upcoming-table thead th { text-align:left; padding:0.6rem 0.9rem; background: var(--surface-alt); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.03em; color: var(--ink-soft); }
.upcoming-table tbody tr { cursor:pointer; border-top:1px solid var(--border); }
.upcoming-table tbody tr:hover { background: var(--surface-alt); }
.upcoming-table td { padding:0.65rem 0.9rem; vertical-align:middle; }
.days-away { display:block; font-size:0.72rem; color: var(--ink-soft); margin-top:0.1rem; }
.upcoming-table tr.row-overdue { background: #FBEFEA; }
.upcoming-table tr.row-overdue .days-away { color: var(--rust); font-weight:600; }
.action-chip { font-size:0.72rem; font-weight:600; padding:0.2rem 0.55rem; border-radius:99px; }
.action-chip.action-refill { background:#E1EEE8; color: var(--sage-dark); }
.action-chip.action-doctor { background:#EFE0F5; color:#7A3B90; }

.med-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:1rem; }
.med-card { background: var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.1rem; border-top:4px solid var(--sage); }
.med-card.status-soon { border-top-color: #D2952E; }
.med-card.status-overdue { border-top-color: var(--rust); }
.med-card.status-doctor { border-top-color: #8B4FA0; }
.med-card.status-lastbox { border-top-color: #6B7A99; }
.med-card.script-paper { box-shadow: inset 4px 0 0 #C9A66B; }
.med-card.script-escript { box-shadow: inset 4px 0 0 #4A7FAE; }
.med-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; margin-bottom:0.7rem; }
.med-card h3 { font-family:'Fraunces', serif; font-size:1.05rem; font-weight:600; margin:0 0 0.2rem; }
.script-chip { display:inline-flex; align-items:center; gap:0.25rem; font-size:0.62rem; font-weight:700; letter-spacing:0.03em; text-transform:uppercase; padding:0.15rem 0.45rem; border-radius:99px; margin-left:0.5rem; vertical-align:middle; }
.script-chip.script-paper { background:#F1E6D2; color:#8A6A34; }
.script-chip.script-escript { background:#DCEAF2; color:#2C5C78; }
.med-sub { margin:0; font-size:0.8rem; color: var(--ink-soft); }

.status-pill { font-size:0.72rem; font-weight:600; padding:0.25rem 0.6rem; border-radius:99px; white-space:nowrap; background: var(--surface-alt); color: var(--ink-soft); }
.status-pill.status-soon { background:#FBEBCB; color:#8A5A0E; }
.status-pill.status-overdue { background: var(--rust-soft); color: var(--rust); }
.status-pill.status-doctor { background:#EFE0F5; color:#7A3B90; }
.status-pill.status-lastbox { background:#E3E7EF; color:#4B5A78; }
.status-pill.status-ok { background:#E1EEE8; color: var(--sage-dark); }

.tablet-count { margin: 0.6rem 0 0.8rem; }
.tablet-count-row { display:flex; align-items:baseline; margin-bottom:0.35rem; }
.tablet-count-num { font-family:'Fraunces', serif; font-size:1.3rem; font-weight:700; color: var(--sage-dark); }
.tablet-count-of { color: var(--ink-soft); font-size:0.85rem; }
.tablet-progress-track { height:6px; border-radius:99px; background: var(--surface-alt); border:1px solid var(--border); overflow:hidden; }
.tablet-progress-fill { height:100%; background: var(--sage); border-radius:99px; transition: width 0.2s ease; }

.med-meta { display:flex; gap:1.2rem; margin-bottom:0.9rem; flex-wrap:wrap; }
.meta-label { display:block; font-size:0.72rem; color: var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; }
.meta-value { display:block; font-size:0.9rem; font-weight:600; margin-top:0.1rem; }

.med-actions { display:flex; align-items:center; gap:0.9rem; flex-wrap:wrap; padding-top:0.6rem; border-top:1px solid var(--border); }

.btn { font-family:'Inter', sans-serif; font-size:0.88rem; font-weight:600; border-radius:8px; padding:0.55rem 1rem; border:1px solid transparent; cursor:pointer; }
.btn.small { padding:0.4rem 0.75rem; font-size:0.82rem; }
.btn-primary { background: var(--sage); color:#fff; }
.btn-primary:hover { background: var(--sage-dark); }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
.btn-ghost { background:transparent; border-color: var(--border); color: var(--ink); }
.btn-ghost:hover { background: var(--surface-alt); }

.link-btn { background:none; border:none; color: var(--sage-dark); font-size:0.82rem; cursor:pointer; padding:0; text-decoration:underline; text-underline-offset:2px; }
.link-btn.danger { color: var(--rust); }

.modal-overlay { position:fixed; inset:0; background:rgba(35,39,31,0.45); display:flex; align-items:center; justify-content:center; padding:1rem; z-index:50; }
.modal { background: var(--surface); border-radius:14px; padding:1.5rem; max-width:420px; width:100%; max-height:90vh; overflow-y:auto; }
.modal-title { font-family:'Fraunces', serif; font-size:1.15rem; font-weight:600; margin:0 0 1rem; }
.field-label { display:block; font-size:0.78rem; font-weight:600; color: var(--ink-soft); margin:0.7rem 0 0.3rem; }
.field-input { width:100%; padding:0.5rem 0.65rem; border:1px solid var(--border); border-radius:7px; font-size:0.9rem; font-family:'Inter', sans-serif; background: var(--bg); color: var(--ink); }
.field-row { display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; }
.radio-row { display:flex; gap:0.6rem; margin-top:0.3rem; }
.radio-btn { display:flex; align-items:center; gap:0.4rem; padding:0.45rem 0.8rem; border-radius:8px; border:1px solid var(--border); background:var(--bg); color: var(--ink-soft); font-size:0.85rem; cursor:pointer; }
.radio-btn.active { border-color: var(--sage); color: var(--sage-dark); background:#E1EEE8; font-weight:600; }
.modal-actions { display:flex; justify-content:flex-end; gap:0.6rem; margin-top:1.3rem; }

.toast { position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%); background: var(--ink); color:#fff; padding:0.65rem 1.1rem; border-radius:8px; font-size:0.85rem; z-index:60; }

@media (max-width:640px) {
  .rl-body { flex-direction:column; }
  .rl-profiles { flex-direction:row; flex-wrap:wrap; width:100%; }
  .field-row { grid-template-columns:1fr; }
}
`;
