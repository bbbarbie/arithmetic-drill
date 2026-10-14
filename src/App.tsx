import { useEffect, useState } from "react";
import { CoachTab } from "./components/CoachTab.tsx";
import { CheckerTab } from "./components/CheckerTab.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { SupportBanner } from "./components/SupportBanner.tsx";
import { loadSettings, saveSettings, type Settings } from "./lib/settings.ts";
import { detectSpeechSupport } from "./lib/speech/capabilities.ts";

type Tab = "coach" | "checker";

export function App() {
  const [tab, setTab] = useState<Tab>("coach");
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const support = detectSpeechSupport();

  useEffect(() => saveSettings(settings), [settings]);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Quant Drill</h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "coach"} className={tab === "coach" ? "tab active" : "tab"} onClick={() => setTab("coach")}>
            Interview Coach
          </button>
          <button role="tab" aria-selected={tab === "checker"} className={tab === "checker" ? "tab active" : "tab"} onClick={() => setTab("checker")}>
            Answer Checker
          </button>
        </nav>
        <button className="ghost" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
          {showSettings ? "Close settings" : "Settings"}
        </button>
      </header>

      <SupportBanner support={support} />

      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} support={support} />}

      <main>
        {tab === "coach" ? <CoachTab settings={settings} support={support} onSettingsChange={setSettings} /> : <CheckerTab settings={settings} support={support} />}
      </main>

      <footer className="footnote">
        Microphone capture only hears what reaches your mic. It does not capture audio from other apps or browser tabs; play interview
        audio through speakers if you want the checker to hear it. No audio is recorded or stored by this app.
      </footer>
    </div>
  );
}
