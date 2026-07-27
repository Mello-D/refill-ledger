import { supabase } from "./supabaseClient";

// Replaces the localStorage-based shim with one backed by a shared Supabase
// table. All data for a household lives in one row, keyed by a household
// code the user chooses (see HouseholdGate.jsx) — so any device that enters
// the same code sees the same data.
//
// Reads/writes go through Postgres functions (see supabase-setup.sql)
// rather than direct table access, so there is no way to list or dump every
// household's data — only the one row matching a known code is ever
// touched.

let currentCode = null;

export function configureStorage(code) {
  currentCode = code;
}

export function getCurrentCode() {
  return currentCode;
}

export async function householdExists(code) {
  const { data, error } = await supabase.rpc("household_exists", { code });
  if (error) throw error;
  return !!data;
}

export async function createHousehold(code) {
  const { error } = await supabase.rpc("create_household", { code });
  if (error) throw error;
}

async function fetchStore() {
  if (!currentCode) throw new Error("No household code set yet");
  const { data, error } = await supabase.rpc("get_household", { code: currentCode });
  if (error) throw error;
  return data || {};
}

async function writeStore(store) {
  const { error } = await supabase.rpc("save_household", {
    code: currentCode,
    new_store: store,
  });
  if (error) throw error;
}

function namespacedKey(key, shared) {
  return `${shared ? "shared" : "personal"}:${key}`;
}

window.storage = {
  async get(key, shared = false) {
    const store = await fetchStore();
    const nk = namespacedKey(key, shared);
    if (!(nk in store)) throw new Error(`Key not found: ${key}`);
    return { key, value: store[nk], shared };
  },

  async set(key, value, shared = false) {
    const store = await fetchStore();
    const nk = namespacedKey(key, shared);
    store[nk] = value;
    await writeStore(store);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    const store = await fetchStore();
    const nk = namespacedKey(key, shared);
    const existed = nk in store;
    delete store[nk];
    await writeStore(store);
    return { key, deleted: existed, shared };
  },

  async list(prefix = "", shared = false) {
    const store = await fetchStore();
    const base = `${shared ? "shared" : "personal"}:${prefix}`;
    const keys = Object.keys(store)
      .filter((k) => k.startsWith(base))
      .map((k) => k.slice(`${shared ? "shared" : "personal"}:`.length));
    return { keys, prefix, shared };
  },
};
