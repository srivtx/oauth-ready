"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { guideCost, PROVIDERS, type ProviderPreset } from "@/lib/agent/providers";

export interface ByoSettings {
  provider: string;
  model: string;
  apiKey: string;
}

const STORE = "oauthready:byo";
const DEFAULT = PROVIDERS[0].models[0];

/** Visitor's own key, if they chose to keep it. Lives only in this browser. */
export function loadByo(): ByoSettings | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? sessionStorage.getItem(STORE) ?? "null");
    return v?.apiKey ? v : null;
  } catch {
    return null;
  }
}

/** Arrow-key navigation for a group of role="radio" buttons. */
function onRadioKeys(e: React.KeyboardEvent<HTMLElement>, cols = 1) {
  const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: cols, ArrowLeft: -1, ArrowUp: -cols };
  if (!(e.key in keys)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = items[(i + keys[e.key] + items.length) % items.length];
  next.focus();
  next.click();
}

function ProviderMark({ p, active }: { p: ProviderPreset; active: boolean }) {
  return (
    <span className={`grain relative flex h-9 w-9 shrink-0 items-center justify-center ${active ? "bg-accent" : "bg-field-deep"}`}>
      {p.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.logo}
          alt=""
          width={18}
          height={18}
          // All marks are black on transparent: invert on the dark tile, keep black on the pink one.
          style={{ filter: active ? "none" : "invert(1)" }}
        />
      ) : (
        <span className={`font-pixel text-sm ${active ? "text-[#13221a]" : "text-white"}`}>{p.label.slice(0, 2)}</span>
      )}
    </span>
  );
}

export function ModelSettings({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<ByoSettings | null>(null);
  const [mode, setMode] = useState<"default" | "byo">("default");
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  const [model, setModel] = useState(DEFAULT.id);
  const [custom, setCustom] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [reveal, setReveal] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = loadByo();
    setSaved(v);
    if (v) {
      setMode("byo");
      setProvider(v.provider);
      const p = PROVIDERS.find((x) => x.id === v.provider);
      if (p?.models.some((m) => m.id === v.model)) setModel(v.model);
      else setCustom(v.model);
      setApiKey(v.apiKey);
      try {
        setRemember(!!localStorage.getItem(STORE));
      } catch {}
    }
  }, []);

  // The search box's /model command opens this dialog.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("oauthready:model", show);
    return () => window.removeEventListener("oauthready:model", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Lock the page behind the dialog so scrolling past the end of the list doesn't move the site.
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
    };
  }, [open]);

  const preset = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const chosenModel = custom.trim() || model;
  const canSave = mode === "default" || apiKey.trim().length > 8;

  const save = () => {
    const v = mode === "byo" && apiKey.trim() ? { provider, model: chosenModel, apiKey: apiKey.trim() } : null;
    try {
      localStorage.removeItem(STORE);
      sessionStorage.removeItem(STORE);
      if (v) (remember ? localStorage : sessionStorage).setItem(STORE, JSON.stringify(v));
    } catch {}
    setSaved(v);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[11px] hover:border-accent ${compact ? "border-line text-muted hover:text-text" : "border-[#13221a] bg-[#0d1611] text-white/90"}`}
        title="Choose the model / bring your own API key"
      >
        <span className={`h-1.5 w-1.5 ${saved ? "bg-agent" : "bg-tested"}`} />
        {saved ? `${saved.model} · your key` : `${DEFAULT.id} · default`}
        <span className="font-pixel text-[9px] text-accent">edit</span>
      </button>

      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/70 p-3 font-sans text-text backdrop-blur-sm sm:items-center sm:p-6" onClick={() => setOpen(false)}>
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Choose the model"
            onClick={(e) => e.stopPropagation()}
            className="fade-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-line bg-panel shadow-[8px_8px_0_rgba(0,0,0,0.5)]"
          >
            {/* Header strip */}
            <div className="field grain flex items-center justify-between px-5 py-3">
              <div>
                <div className="font-pixel text-[11px] text-[#13221a]">agent / model</div>
                <div className="text-lg font-semibold text-white">Which brain runs the research?</div>
              </div>
              <button onClick={() => setOpen(false)} className="font-pixel text-[11px] text-white/80 hover:text-white">
                esc ✕
              </button>
            </div>

            <div className="no-scrollbar overflow-y-auto overscroll-contain p-5">
              {/* Mode */}
              <div role="radiogroup" aria-label="Mode" onKeyDown={(e) => onRadioKeys(e, 2)} className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["default", "Use the default", `${DEFAULT.id} via OpenCode · ${guideCost(DEFAULT.price)} a guide, paid by this site`],
                    ["byo", "Bring your own key", "Any allow-listed provider and model. You pay, you choose."],
                  ] as const
                ).map(([id, title, sub]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={mode === id}
                    tabIndex={mode === id ? 0 : -1}
                    data-autofocus={mode === id ? "" : undefined}
                    onClick={() => setMode(id)}
                    className={`flex items-start gap-3 border p-3 text-left transition ${mode === id ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${mode === id ? "border-accent bg-accent" : "border-muted"}`}>
                      {mode === id && <span className="h-1.5 w-1.5 bg-[#13221a]" />}
                    </span>
                    <span>
                      <span className="block font-medium">{title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>

              {mode === "byo" && (
                <div className="fade-in">
                  {/* Providers */}
                  <div className="mt-5 font-pixel text-[11px] text-faint">01 / provider</div>
                  <div role="radiogroup" aria-label="Provider" onKeyDown={(e) => onRadioKeys(e, 3)} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PROVIDERS.map((p) => {
                      const active = p.id === provider;
                      return (
                        <button
                          key={p.id}
                          role="radio"
                          aria-checked={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => {
                            setProvider(p.id);
                            setModel(p.models[0].id);
                            setCustom("");
                          }}
                          className={`flex items-center gap-2.5 border p-2 text-left text-sm transition ${active ? "border-accent" : "border-line hover:border-muted"}`}
                        >
                          <ProviderMark p={p} active={active} />
                          <span className="min-w-0 truncate">{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Models */}
                  <div className="mt-5 flex items-baseline justify-between">
                    <span className="font-pixel text-[11px] text-faint">02 / model</span>
                    <span className="font-mono text-[10px] text-faint">price per 1M tokens · in / out</span>
                  </div>
                  <div role="radiogroup" aria-label="Model" onKeyDown={(e) => onRadioKeys(e)} className="mt-2 space-y-1.5">
                    {preset.models.map((m) => {
                      const active = !custom && m.id === model;
                      return (
                        <button
                          key={m.id}
                          role="radio"
                          aria-checked={active}
                          tabIndex={active ? 0 : -1}
                          onClick={() => {
                            setModel(m.id);
                            setCustom("");
                          }}
                          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2 text-left transition ${active ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
                        >
                          <span className={`font-pixel text-[10px] ${active ? "text-accent" : "text-faint"}`}>{active ? "▶" : "·"}</span>
                          <span className="font-mono text-sm">{m.id}</span>
                          <span className="text-xs text-muted">{m.note}</span>
                          {m.price && (
                            <span className="ml-auto flex gap-1.5 font-mono text-[10px]">
                              <span className="border border-line px-1.5 py-px text-muted">
                                ${m.price[0]} / ${m.price[1]}
                              </span>
                              <span className="bg-field-deep px-1.5 py-px text-white">{guideCost(m.price)} a guide</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <input
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="or type another model id…"
                      className={`w-full border bg-bg px-3 py-2 font-mono text-sm outline-none placeholder:text-faint focus:border-accent ${custom ? "border-accent" : "border-line"}`}
                    />
                  </div>

                  {/* Key */}
                  <div className="mt-5 flex items-baseline justify-between">
                    <label htmlFor="byo-key" className="font-pixel text-[11px] text-faint">
                      03 / api key
                    </label>
                    <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-accent hover:underline">
                      get a {preset.label} key ↗
                    </a>
                  </div>
                  <div className="mt-2 flex border border-line focus-within:border-accent">
                    <input
                      id="byo-key"
                      type={reveal ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={preset.keyHint}
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-bg px-3 py-2 font-mono text-sm outline-none placeholder:text-faint"
                    />
                    <button onClick={() => setReveal((r) => !r)} className="border-l border-line px-3 font-pixel text-[10px] text-muted hover:text-text">
                      {reveal ? "hide" : "show"}
                    </button>
                  </div>

                  <button
                    role="switch"
                    aria-checked={remember}
                    onClick={() => setRemember((r) => !r)}
                    className="mt-3 flex items-center gap-2.5 text-sm text-muted hover:text-text"
                  >
                    <span className={`relative h-4 w-8 border ${remember ? "border-accent bg-accent/20" : "border-line"}`}>
                      <span className={`absolute top-0.5 h-2.5 w-2.5 transition-all ${remember ? "left-[18px] bg-accent" : "left-0.5 bg-muted"}`} />
                    </span>
                    Remember on this device
                  </button>
                  <p className="mt-2 text-xs leading-relaxed text-faint">
                    Your key goes only with your own requests and is used once. It&apos;s never stored on our server or written to logs. If you don&apos;t tick remember,
                    it&apos;s forgotten when you close the tab.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
              <span className="truncate font-mono text-[11px] text-faint">
                {mode === "default" ? `→ ${DEFAULT.id} · site key` : `→ ${chosenModel} · ${preset.label} · your key`}
              </span>
              <button
                onClick={save}
                disabled={!canSave}
                className="shrink-0 whitespace-nowrap bg-accent px-4 py-2 font-pixel text-[11px] text-[#13221a] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mode === "byo" && !canSave ? "paste a key" : "save"}
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
