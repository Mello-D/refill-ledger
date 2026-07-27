import { useState, useEffect } from "react";
import { configureStorage, householdExists, createHousehold } from "./storageShim";

const CODE_STORAGE_KEY = "refill-ledger-household-code";

export default function HouseholdGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | form | confirm-create | connecting | ready | error
  const [codeInput, setCodeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(CODE_STORAGE_KEY);
    if (saved) {
      finalizeCode(saved, false);
    } else {
      setStatus("form");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finalizeCode(code, remember = true) {
    setStatus("connecting");
    setErrorMsg("");
    try {
      const exists = await householdExists(code);
      if (!exists) {
        // Saved code no longer exists (e.g. row deleted) — fall back to the form.
        localStorage.removeItem(CODE_STORAGE_KEY);
        setStatus("form");
        return;
      }
      configureStorage(code);
      if (remember) localStorage.setItem(CODE_STORAGE_KEY, code);
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e.message || "Something went wrong connecting to storage.");
      setStatus("error");
    }
  }

  async function handleContinue() {
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    setStatus("connecting");
    setErrorMsg("");
    try {
      const exists = await householdExists(trimmed);
      if (exists) {
        finalizeCode(trimmed);
      } else {
        setStatus("confirm-create");
      }
    } catch (e) {
      setErrorMsg(e.message || "Couldn't reach storage. Check your connection.");
      setStatus("error");
    }
  }

  async function handleCreate() {
    setStatus("connecting");
    setErrorMsg("");
    try {
      await createHousehold(codeInput.trim());
      finalizeCode(codeInput.trim());
    } catch (e) {
      setErrorMsg(e.message || "Couldn't create that household code.");
      setStatus("error");
    }
  }

  if (status === "ready") return children;

  return (
    <div style={styles.wrap}>
      <style>{GATE_CSS}</style>
      <div className="gate-card">
        <div className="gate-mark">℞</div>
        <h1>The Refill Ledger</h1>

        {(status === "checking" || status === "connecting") && (
          <p className="gate-status">Connecting…</p>
        )}

        {status === "form" && (
          <>
            <p className="gate-sub">
              Enter your household code. Use the same code on every device to share the
              same medication list.
            </p>
            <input
              className="gate-input"
              placeholder="e.g. cathcart-house-42"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
            />
            <button className="gate-btn" onClick={handleContinue} disabled={!codeInput.trim()}>
              Continue
            </button>
            <p className="gate-hint">
              First time? Just make one up — pick something long and not easily guessed,
              since anyone with this code can see and edit this data.
            </p>
          </>
        )}

        {status === "confirm-create" && (
          <>
            <p className="gate-sub">
              No household found with the code <strong>{codeInput.trim()}</strong>. Create
              a new one with this code?
            </p>
            <div className="gate-actions">
              <button className="gate-btn-ghost" onClick={() => setStatus("form")}>
                Go back
              </button>
              <button className="gate-btn" onClick={handleCreate}>
                Create household
              </button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <p className="gate-error">{errorMsg}</p>
            <button className="gate-btn" onClick={() => setStatus("form")}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F6F4EF",
    padding: "1.5rem",
  },
};

const GATE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');

.gate-card {
  font-family: 'Inter', sans-serif;
  background: #FFFFFF;
  border: 1px solid #DBD5C4;
  border-radius: 14px;
  padding: 2rem;
  max-width: 380px;
  width: 100%;
  text-align: center;
}
.gate-mark {
  font-family: 'Fraunces', serif;
  font-size: 1.6rem;
  font-weight: 600;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #3D6B5C;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
}
.gate-card h1 {
  font-family: 'Fraunces', serif;
  font-size: 1.3rem;
  font-weight: 600;
  margin: 0 0 0.8rem;
}
.gate-sub, .gate-status, .gate-hint, .gate-error {
  color: #6B6A5E;
  font-size: 0.88rem;
  line-height: 1.4;
  margin: 0 0 1rem;
}
.gate-error { color: #B5542A; }
.gate-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid #DBD5C4;
  border-radius: 8px;
  font-size: 0.95rem;
  font-family: 'Inter', sans-serif;
  background: #F6F4EF;
  margin-bottom: 0.9rem;
}
.gate-btn, .gate-btn-ghost {
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 8px;
  padding: 0.6rem 1.2rem;
  border: 1px solid transparent;
  cursor: pointer;
  width: 100%;
}
.gate-btn { background: #3D6B5C; color: #fff; }
.gate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gate-btn:hover:not(:disabled) { background: #2A4A3F; }
.gate-btn-ghost { background: transparent; border-color: #DBD5C4; color: #23271F; margin-bottom: 0.6rem; }
.gate-hint { font-size: 0.78rem; }
.gate-actions { display: flex; flex-direction: column; gap: 0.5rem; }
`;
