import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import HouseholdGate from "./HouseholdGate.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HouseholdGate>
      <App />
    </HouseholdGate>
  </React.StrictMode>
);

// Register the service worker so the app can be installed and used offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is a nice-to-have, ignore failures */
    });
  });
}
