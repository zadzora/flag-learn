import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronLeft, ChevronRight, Clipboard, ExternalLink, Hourglass, ListChecks, Loader2, MessageSquare, Pencil, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react"
import TopBar from "../components/TopBar"

/**
 * Dev only (`/dev/trivia`, `npm run dev`): the trivia question editor.
 *
 * No AI runs from here. New questions are written by Claude Code in a chat,
 * on the subscription: the page builds the request to paste there, and
 * Claude hands its drafts in with `node scripts/trivia-queue.mjs add`
 * (.claude/skills/trivia). The queue lives on disk (.trivia-editor/queue.json)
 * and the page polls it, so drafts appear here as Claude writes them.
 *
 * Every draft is checked by the same rules as `npm run check:trivia` and
 * compared with the bank for near duplicates, and nothing reaches
 * data/trivia/*.json until it is approved - all at once, or one by one with
 * approve / reject / edit / "Claude, change this" (a request Claude picks up
 * from the queue). A question can also be written by hand. The back end is
 * scripts/trivia-editor-server.mjs, which exists only inside the dev server.
 */

type Row = Record<string, unknown>
type Similar = { id: string; pack: string; q: string; answer: unknown; score: number }
type Judged = { row: Row; errors: string[]; warnings: string[]; similar: Similar[] }
type Draft = Judged & { key: string; pack: string; source: "claude" | "own"; note?: string; request?: string }
type Thin = { code: string; name: string; count: number }
type PackInfo = { prefix: string; region: string | null; type?: string; rows: Row[] }
type Country = { code: string; name: string; region: string }
type BankInfo = {
    packs: Record<string, PackInfo>
    categories: Record<string, string>
    types: string[]
    limits: Record<string, number>
    countries: Country[]
    thin: Record<string, Thin[]>
}

const THEME_KEY = "flag-master-theme"
const SETTINGS_KEY = "trivia-editor-settings-v1"

const panel = "rounded-[10px] border border-slate-200 bg-white dark:border-[#1C2338] dark:bg-[#0F1424]"
const muted = "text-slate-500 dark:text-[#8C97B3]"
const label = "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500"
const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-[#2A3352] dark:bg-[#0B0F1C]"
const button = "inline-flex min-h-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
const plain = `${button} border-slate-300 hover:border-slate-500 dark:border-[#2A3352] dark:hover:border-slate-400`
const good = `${button} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`
const bad = `${button} border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950`
const ai = `${button} border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950`

function readJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
        return fallback
    }
}
function writeJson(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch {
        // A full or blocked storage only loses the convenience of surviving a reload.
    }
}

async function api<T>(route: string, body?: unknown): Promise<T> {
    const response = await fetch(`/__trivia/${route}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({ error: `${response.status} ${response.statusText}` }))
    if (!response.ok) throw new Error(data.error ?? `${response.status}`)
    return data as T
}

/** The type a draft is played as: a type pack's own, else the row's, else pick-one. */
const typeOf = (draft: { row: Row; pack: string }, info: BankInfo | null) => info?.packs[draft.pack]?.type ?? (draft.row.type as string) ?? "choice"

/** Arrays edited as text keep their empty lines while typing; they are dropped before checking and saving. */
function clean(row: Row): Row {
    const out: Row = {}
    for (const [key, value] of Object.entries(row)) {
        if (Array.isArray(value)) {
            const list = key === "pairs" || key === "at" ? value : value.filter(item => !(typeof item === "string" && item.trim() === ""))
            out[key] = list.map(item => (typeof item === "string" ? item.trim() : item))
        } else out[key] = typeof value === "string" && key !== "unit" ? value.trim() : value
    }
    return out
}

/** A fresh hand-written question with every field its type needs. */
function template(pack: string, info: BankInfo, type: string): Row {
    const region = info.packs[pack]?.region
    const base: Row = { kind: region ? "about" : "world", cat: "nature", level: 1, q: "", fact: "" }
    if (!region) base.region = "world"
    if (region) base.country = []
    const own: Record<string, Row> = {
        choice: { answer: "", wrong: ["", "", ""] },
        multi: { answers: [], wrong: [] },
        order: { items: [], nums: [], unit: "", low: "smallest", high: "largest" },
        number: { answer: 0, unit: "" },
        typed: { answer: "" },
        letters: { answer: "" },
        match: { pairs: [], left: "", right: "" },
        pin: { at: [0, 0] },
        clues: { kind: "about", country: [], clues: ["", "", ""] },
    }
    const row = { ...base, ...own[type] }
    if (type !== "choice") row.type = type
    if (type === "clues") delete row.region
    return row
}

// --- Small pieces ------------------------------------------------------------

function Field({ name, hint, children }: { name: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
                <span className={label}>{name}</span>
                {hint && <span className={`text-[11px] ${muted}`}>{hint}</span>}
            </span>
            {children}
        </label>
    )
}

/** A list edited one entry per line. Keeps its own text so a half-typed line or number is not reformatted under the cursor. */
function LinesField({ name, value, onChange, numbers, separator, rows = 4, hint }: {
    name: string; value: unknown; onChange: (next: unknown[]) => void; numbers?: boolean; separator?: string; rows?: number; hint?: string
}) {
    const toText = (v: unknown) => (Array.isArray(v) ? v.map(item => (Array.isArray(item) ? item.join(` ${separator} `) : String(item))).join("\n") : "")
    const [text, setText] = useState(() => toText(value))
    return (
        <Field name={name} hint={hint}>
            <textarea
                className={`${input} font-mono`}
                rows={rows}
                value={text}
                onChange={event => {
                    setText(event.target.value)
                    const lines = event.target.value.split("\n")
                    if (separator) onChange(lines.filter(line => line.trim()).map(line => line.split(separator).map(part => part.trim())))
                    else if (numbers) onChange(lines.filter(line => line.trim()).map(line => Number(line.replace(",", "."))))
                    else onChange(lines)
                }}
            />
        </Field>
    )
}

function NumberField({ name, value, onChange, hint }: { name: string; value: unknown; onChange: (next: number | undefined) => void; hint?: string }) {
    const [text, setText] = useState(value === undefined ? "" : String(value))
    return (
        <Field name={name} hint={hint}>
            <input
                className={input}
                inputMode="decimal"
                value={text}
                onChange={event => {
                    setText(event.target.value)
                    const n = Number(event.target.value.replace(",", "."))
                    onChange(event.target.value.trim() === "" || !Number.isFinite(n) ? undefined : n)
                }}
            />
        </Field>
    )
}

function Counter({ text, limit }: { text: unknown; limit: number }) {
    const n = typeof text === "string" ? text.length : 0
    return <span className={n > limit ? "font-bold text-rose-600" : ""}>{n}/{limit}</span>
}

function FlagChip({ code, countries }: { code: string; countries: Map<string, Country> }) {
    const country = countries.get(code)
    return (
        <span className="inline-flex items-center gap-1.5">
            <img src={`/flags/${code}.svg`} alt="" className="h-3.5 w-5 rounded-[2px] object-cover ring-1 ring-black/10" />
            <span>{country?.name ?? code}</span>
            <span className={`text-[11px] ${muted}`}>{code}</span>
        </span>
    )
}

// --- Preview -----------------------------------------------------------------

function Preview({ draft, info, countries }: { draft: Draft; info: BankInfo; countries: Map<string, Country> }) {
    const row = draft.row
    const type = typeOf(draft, info)
    const which = row.kind === "which"
    const show = (value: unknown) => (which && typeof value === "string" ? <FlagChip code={value} countries={countries} /> : String(value))
    const option = (value: unknown, right: boolean, key: number | string) => (
        <li key={key} className={`rounded-md border px-3 py-1.5 text-sm ${right ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-200 dark:border-[#2A3352]"}`}>
            {show(value)}
        </li>
    )
    const image = row.image as Record<string, string> | undefined
    const at = row.at as [number, number] | undefined

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                {[draft.pack, type, String(row.kind ?? "?"), info.categories[row.cat as string] ?? String(row.cat ?? "?"), `level ${row.level ?? "?"}`, row.region ? `region ${row.region}` : "", row.asOf ? `asOf ${row.asOf}` : ""]
                    .filter(Boolean)
                    .map((tag, i) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-[#1C2338]">{tag}</span>)}
                {Array.isArray(row.country) && row.country.map(code => (
                    <span key={String(code)} className="rounded bg-sky-50 px-1.5 py-0.5 dark:bg-sky-950"><FlagChip code={String(code)} countries={countries} /></span>
                ))}
                {draft.source === "own" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">vlastná</span>}
            </div>

            {image && (
                <div className={`text-sm ${muted}`}>
                    Obrázok: {image.text ? <span className="text-2xl text-slate-900 dark:text-white" lang={image.lang}>{image.text}</span> : Object.entries(image).map(([kind, code]) => <span key={kind}>{kind} <FlagChip code={code} countries={countries} /></span>)}
                </div>
            )}

            <p className="text-lg font-bold leading-snug">{String(row.q ?? "")}</p>

            {type === "choice" && <ul className="grid gap-1.5 sm:grid-cols-2">{[option(row.answer, true, "a"), ...((row.wrong as unknown[]) ?? []).map((w, i) => option(w, false, i))]}</ul>}
            {type === "multi" && <ul className="grid gap-1.5 sm:grid-cols-2">{[...((row.answers as unknown[]) ?? []).map((a, i) => option(a, true, `a${i}`)), ...((row.wrong as unknown[]) ?? []).map((w, i) => option(w, false, i))]}</ul>}
            {type === "order" && (
                <ol className="flex flex-col gap-1 text-sm">
                    <li className={`text-xs ${muted}`}>{String(row.low ?? "")} ↓</li>
                    {((row.items as unknown[]) ?? []).map((item, i) => (
                        <li key={i} className="flex justify-between gap-3 rounded-md border border-slate-200 px-3 py-1 dark:border-[#2A3352]">
                            <span>{show(item)}</span>
                            <span className={muted}>{String((row.nums as unknown[])?.[i] ?? "?")} {String(row.unit ?? "")}</span>
                        </li>
                    ))}
                    <li className={`text-xs ${muted}`}>↓ {String(row.high ?? "")}</li>
                </ol>
            )}
            {(type === "number" || type === "typed" || type === "letters") && (
                <p className="text-sm">
                    Odpoveď: <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{String(row.answer ?? "")} {type === "number" ? String(row.unit ?? "") : ""}</span>
                    {row.tol !== undefined && <span className={muted}> ± {String(row.tol)}</span>}
                    {Array.isArray(row.accept) && row.accept.length > 0 && <span className={muted}> · aj: {row.accept.join(", ")}</span>}
                </p>
            )}
            {type === "choice" && Array.isArray(row.accept) && row.accept.length > 0 && <p className={`text-sm ${muted}`}>Aj: {row.accept.join(", ")}</p>}
            {type === "match" && (
                <table className="text-sm">
                    <thead><tr className={label}><th className="pr-4 text-left">{String(row.left ?? "")}</th><th className="text-left">{String(row.right ?? "")}</th></tr></thead>
                    <tbody>
                        {((row.pairs as [string, string][]) ?? []).map((pair, i) => (
                            <tr key={i}><td className="pr-4">{show(pair[0])}</td><td>{pair[1]}</td></tr>
                        ))}
                    </tbody>
                </table>
            )}
            {type === "pin" && at && (
                <p className="text-sm">
                    Bod: lon {at[0]}, lat {at[1]}{row.near ? ` · plný počet do ${row.near} km` : ""}{row.view ? ` · mapa ${row.view}` : ""}{" "}
                    <a className="inline-flex items-center gap-1 text-sky-600 underline" href={`https://www.openstreetmap.org/?mlat=${at[1]}&mlon=${at[0]}#map=7/${at[1]}/${at[0]}`} target="_blank" rel="noreferrer">
                        overiť na mape <ExternalLink size={12} />
                    </a>
                </p>
            )}
            {type === "clues" && <ol className="list-decimal pl-5 text-sm">{((row.clues as string[]) ?? []).map((clue, i) => <li key={i}>{clue}</li>)}</ol>}

            <p className={`border-l-2 border-sky-400 pl-3 text-sm italic ${muted}`}>{String(row.fact ?? "")}</p>

            {draft.note && <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-200"><Sparkles size={13} className="mr-1 inline" />{draft.note}</p>}
            <Verdict draft={draft} countries={countries} />
        </div>
    )
}

function Verdict({ draft }: { draft: Draft; countries: Map<string, Country> }) {
    return (
        <div className="flex flex-col gap-1.5 text-sm">
            {draft.errors.map(error => <p key={error} className="rounded-md bg-rose-50 px-3 py-1.5 text-rose-800 dark:bg-rose-950 dark:text-rose-200">✗ {error}</p>)}
            {draft.warnings.map(warning => <p key={warning} className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">! {warning}</p>)}
            {draft.similar.length > 0 && (
                <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <p className="font-semibold">Podobné otázky v banke:</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                        {draft.similar.map(s => (
                            <li key={s.id}><span className="font-mono text-xs">{s.id}</span> {s.q} <span className="opacity-70">→ {Array.isArray(s.answer) ? s.answer.join(", ") : String(s.answer ?? "")} ({Math.round(s.score * 100)}%)</span></li>
                        ))}
                    </ul>
                </div>
            )}
            {!draft.errors.length && !draft.warnings.length && !draft.similar.length && <p className="text-emerald-700 dark:text-emerald-400">✓ Prejde kontrolou, žiadna podobná otázka.</p>}
        </div>
    )
}

// --- Editing -----------------------------------------------------------------

const isWhich = (row: Row) => row.kind === "which"

function Editor({ draft, info, onChange }: { draft: Draft; info: BankInfo; onChange: (row: Row) => void }) {
    const row = draft.row
    const type = typeOf(draft, info)
    const [raw, setRaw] = useState(false)
    const [rawText, setRawText] = useState(() => JSON.stringify(row, null, 2))
    const [rawError, setRawError] = useState("")
    const set = (key: string, value: unknown) => {
        const next = { ...row }
        if (value === undefined || value === "") delete next[key]
        else next[key] = value
        onChange(next)
    }
    const str = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : row[key] === undefined ? "" : String(row[key]))
    const text = (key: string, name: string, hint?: ReactNode) => (
        <Field name={name} hint={hint}><input className={input} value={str(key)} onChange={event => set(key, event.target.value)} /></Field>
    )
    const regionalPack = info.packs[draft.pack]?.region

    if (raw) {
        return (
            <div className="flex flex-col gap-2">
                <textarea className={`${input} font-mono`} rows={16} value={rawText} onChange={event => setRawText(event.target.value)} />
                {rawError && <p className="text-sm text-rose-600">{rawError}</p>}
                <div className="flex gap-2">
                    <button type="button" className={good} onClick={() => {
                        try {
                            const parsed = JSON.parse(rawText)
                            setRawError("")
                            onChange(parsed)
                            setRaw(false)
                        } catch (error) {
                            setRawError(error instanceof Error ? error.message : String(error))
                        }
                    }}>Použiť JSON</button>
                    <button type="button" className={plain} onClick={() => setRaw(false)}>Späť na formulár</button>
                </div>
            </div>
        )
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex justify-end">
                <button type="button" className={plain} onClick={() => { setRawText(JSON.stringify(row, null, 2)); setRaw(true) }}>Upraviť ako JSON</button>
            </div>
            {!info.packs[draft.pack]?.type && (
                <Field name="type">
                    <select className={input} value={type} onChange={event => set("type", event.target.value === "choice" ? undefined : event.target.value)}>
                        {info.types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
            )}
            <Field name="kind">
                <select className={input} value={str("kind")} onChange={event => set("kind", event.target.value)}>
                    {["about", "which", "world"].map(k => <option key={k} value={k}>{k}</option>)}
                </select>
            </Field>
            {row.kind === "about" && (
                <Field name="country" hint="kódy, oddelené čiarkou">
                    <input className={input} value={Array.isArray(row.country) ? row.country.join(", ") : ""} onChange={event => set("country", event.target.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean))} />
                </Field>
            )}
            {row.kind === "world" && (
                <Field name="region">
                    <select className={input} value={str("region")} onChange={event => set("region", event.target.value)}>
                        <option value="">-</option>
                        {(regionalPack ? [draft.pack] : ["world", "europe", "asia", "africa", "americas", "oceania"]).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </Field>
            )}
            <Field name="cat">
                <select className={input} value={str("cat")} onChange={event => set("cat", event.target.value)}>
                    {Object.entries(info.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </Field>
            <Field name="level">
                <select className={input} value={str("level")} onChange={event => set("level", Number(event.target.value))}>
                    {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </Field>
            <div className="sm:col-span-2">
                <Field name="q" hint={<Counter text={row.q} limit={info.limits.question} />}>
                    <textarea className={input} rows={2} value={str("q")} onChange={event => set("q", event.target.value)} />
                </Field>
            </div>

            {(type === "choice" || type === "typed" || type === "letters") && text("answer", isWhich(row) ? "answer (kód krajiny)" : "answer")}
            {type === "number" && <NumberField name="answer" value={row.answer} onChange={n => set("answer", n)} />}
            {type === "choice" && <LinesField name="wrong" hint={isWhich(row) ? "3 kódy, po riadku" : "presne 3, po riadku"} value={row.wrong} onChange={v => set("wrong", v)} rows={3} />}
            {(type === "choice" || type === "typed") && !isWhich(row) && <LinesField name="accept" hint="iné pravopisy, voliteľné" value={row.accept} onChange={v => set("accept", v.length ? v : undefined)} rows={2} />}
            {type === "multi" && <LinesField name="answers" hint="2-4 správne" value={row.answers} onChange={v => set("answers", v)} />}
            {type === "multi" && <LinesField name="wrong" hint="2-5 nesprávne" value={row.wrong} onChange={v => set("wrong", v)} />}
            {type === "order" && <LinesField name="items" hint="od najmenšieho" value={row.items} onChange={v => set("items", v)} />}
            {type === "order" && <LinesField name="nums" numbers hint="hodnoty, rastúce" value={row.nums} onChange={v => set("nums", v)} />}
            {type === "order" && text("low", "low", "napr. smallest")}
            {type === "order" && text("high", "high", "napr. largest")}
            {(type === "order" || type === "number") && (
                <Field name="unit" hint={'"" = počet, "year" = rok'}><input className={input} value={str("unit")} onChange={event => onChange({ ...row, unit: event.target.value })} /></Field>
            )}
            {type === "number" && <NumberField name="tol" hint="voliteľná tolerancia" value={row.tol} onChange={n => set("tol", n)} />}
            {type === "match" && <div className="sm:col-span-2"><LinesField name="pairs" separator="|" hint="ľavá | pravá, po riadku" value={row.pairs} onChange={v => set("pairs", v)} /></div>}
            {type === "match" && text("left", "left (nadpis)")}
            {type === "match" && text("right", "right (nadpis)")}
            {type === "pin" && (
                <Field name="at" hint="longitude, latitude">
                    <input className={input} defaultValue={Array.isArray(row.at) ? row.at.join(", ") : ""} onChange={event => set("at", event.target.value.split(",").map(s => Number(s.trim())))} />
                </Field>
            )}
            {type === "pin" && <NumberField name="near" hint="km, predvolene 100" value={row.near} onChange={n => set("near", n)} />}
            {type === "pin" && (
                <Field name="view">
                    <select className={input} value={str("view")} onChange={event => set("view", event.target.value || undefined)}>
                        <option value="">kontinent otázky</option>
                        {["world", "europe", "africa", "asia", "americas", "oceania"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </Field>
            )}
            {type === "clues" && <div className="sm:col-span-2"><LinesField name="clues" hint="3 indície, najťažšia prvá" value={row.clues} onChange={v => set("clues", v)} rows={3} /></div>}

            <div className="sm:col-span-2">
                <Field name="fact" hint={<Counter text={row.fact} limit={info.limits.fact} />}>
                    <textarea className={input} rows={2} value={str("fact")} onChange={event => set("fact", event.target.value)} />
                </Field>
            </div>
            <NumberField name="asOf" hint="rok, ak fakt môže zastarať" value={row.asOf} onChange={n => set("asOf", n)} />
        </div>
    )
}

// --- One draft ---------------------------------------------------------------

const FIX_ERRORS = "Oprav, čo hlási kontrola."

function DraftCard({ draft, info, countries, busy, editing, onEdit, onRow, onApprove, onReject, onRequest }: {
    draft: Draft; info: BankInfo; countries: Map<string, Country>; busy: boolean; editing: boolean
    onEdit: (on: boolean) => void; onRow: (row: Row) => void; onApprove: () => void; onReject: () => void; onRequest: (text: string) => void
}) {
    const [instruction, setInstruction] = useState("")
    return (
        <article className={`${panel} p-4 ${draft.errors.length ? "border-l-4 !border-l-rose-500" : ""}`}>
            {draft.request && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                    <Hourglass size={14} />
                    <span className="flex-1">Čaká na Clauda: <b>{draft.request}</b></span>
                    <button type="button" className={`${plain} !py-0.5`} disabled={busy} onClick={() => onRequest("")}>Zrušiť</button>
                </div>
            )}
            <div className={`grid gap-6 ${editing ? "lg:grid-cols-2" : ""}`}>
                {editing && <Editor key={draft.key} draft={draft} info={info} onChange={onRow} />}
                <Preview draft={draft} info={info} countries={countries} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-[#1C2338]">
                <button type="button" className={good} disabled={busy || draft.errors.length > 0} onClick={onApprove} title="A"><Check size={15} />Schváliť</button>
                <button type="button" className={bad} disabled={busy} onClick={onReject} title="R"><X size={15} />Zamietnuť</button>
                <button type="button" className={plain} disabled={busy} onClick={() => onEdit(!editing)} title="E"><Pencil size={14} />{editing ? "Hotovo" : "Upraviť"}</button>
                {draft.errors.length > 0 && !draft.request && <button type="button" className={ai} disabled={busy} onClick={() => onRequest(FIX_ERRORS)}><Wand2 size={14} />Nech Claude opraví chyby</button>}
                <form className="flex min-w-[220px] flex-1 gap-2" onSubmit={event => { event.preventDefault(); if (instruction.trim()) { onRequest(instruction.trim()); setInstruction("") } }}>
                    <input className={input} placeholder="Požiadavka pre Clauda (napr. ťažšie, iné možnosti, kratší fakt)" value={instruction} onChange={event => setInstruction(event.target.value)} />
                    <button type="submit" className={ai} disabled={busy || !instruction.trim()}><MessageSquare size={14} />Poslať</button>
                </form>
                {busy && <Loader2 size={16} className="animate-spin text-violet-500" />}
            </div>
        </article>
    )
}

// --- The request to paste into Claude Code -----------------------------------

type Settings = { pack: string; type: string; count: number; level: number; cat: string; country: string; topic: string }
const DEFAULT_SETTINGS: Settings = { pack: "europe", type: "choice", count: 5, level: 0, cat: "", country: "", topic: "" }

/** What the developer pastes into the chat. The trivia skill reads it; the wording only has to be unambiguous. */
function requestText(settings: Settings, info: BankInfo, countries: Map<string, Country>): string {
    const pack = info.packs[settings.pack]
    const type = pack?.type ?? settings.type
    const parts = [
        `Trivia: navrhni ${settings.count} ${settings.count === 1 ? "otázku" : settings.count < 5 ? "otázky" : "otázok"} do balíka "${settings.pack}"`,
        `typ ${type}`,
        settings.level ? `level ${settings.level}` : "levely mix",
        settings.cat ? `kategória ${settings.cat}` : "kategórie mix",
    ]
    let text = parts.join(", ")
    if (settings.country) text += `, o krajine ${countries.get(settings.country)?.name ?? settings.country} (${settings.country})`
    else if (pack?.region && !settings.topic.trim()) text += ", prednostne o najmenej pokrytých krajinách"
    text += "."
    if (settings.topic.trim()) text += ` Téma: ${settings.topic.trim()}`
    return text
}

const REQUESTS_TEXT = "Trivia: sprav úpravy, o ktoré žiadam v editore."

function CopyBox({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm dark:bg-[#1C2338]">{text}</code>
            <button type="button" className={plain} onClick={() => {
                navigator.clipboard.writeText(text).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1500)
                }, () => undefined)
            }}>
                <Clipboard size={14} />{copied ? "Skopírované" : "Kopírovať"}
            </button>
        </div>
    )
}

// --- The page ----------------------------------------------------------------

const POLL_MS = 3000

export default function TriviaEditor() {
    const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light")
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
        localStorage.setItem(THEME_KEY, theme)
    }, [theme])

    const [info, setInfo] = useState<BankInfo | null>(null)
    const [loadError, setLoadError] = useState("")
    const reload = useCallback(() => {
        api<BankInfo>("bank").then(setInfo, error => setLoadError(error.message))
    }, [])
    useEffect(reload, [reload])

    const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) }))
    useEffect(() => writeJson(SETTINGS_KEY, settings), [settings])
    const change = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }))

    const [drafts, setDrafts] = useState<Draft[]>([])
    const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set())
    const [editingKey, setEditingKey] = useState<string | null>(null)
    const [oneByOne, setOneByOne] = useState(false)
    const [cursor, setCursor] = useState(0)
    const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
    const [bankOpen, setBankOpen] = useState(false)
    const [search, setSearch] = useState("")
    const fail = (error: unknown) => setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) })

    // --- The queue on disk, polled. A draft being edited keeps what is on screen:
    // the server's copy may be a keystroke behind, and would undo typing.
    const stamp = useRef("")
    const pending = useRef(new Map<string, number>())
    const merge = useEffectEvent((server: Draft[]) => {
        setDrafts(local => server.map(d => {
            const mine = local.find(l => l.key === d.key)
            return mine && (d.key === editingKey || pending.current.has(d.key)) ? { ...d, row: mine.row } : d
        }))
    })
    const poll = useEffectEvent(() => {
        api<{ drafts?: Draft[]; stamp: string; unchanged?: boolean }>(`queue?since=${encodeURIComponent(stamp.current)}`).then(result => {
            stamp.current = result.stamp
            if (result.drafts) merge(result.drafts)
        }, () => undefined)
    })
    useEffect(() => {
        poll()
        const timer = window.setInterval(() => { if (!document.hidden) poll() }, POLL_MS)
        return () => window.clearInterval(timer)
    }, [])

    const countries = useMemo(() => new Map((info?.countries ?? []).map(c => [c.code, c])), [info])
    const pack = info?.packs[settings.pack]
    const packType = pack?.type
    const regionCountries = useMemo(() => (info?.countries ?? []).filter(c => !pack?.region || c.region === pack.region).sort((a, b) => a.name.localeCompare(b.name)), [info, pack])

    const busy = (key: string, on: boolean) => setBusyKeys(prev => {
        const next = new Set(prev)
        if (on) next.add(key)
        else next.delete(key)
        return next
    })
    const patchDraft = (key: string, patch: Partial<Draft>) => setDrafts(list => list.map(d => (d.key === key ? { ...d, ...patch } : d)))
    const removeDrafts = (keys: string[]) => setDrafts(list => list.filter(d => !keys.includes(d.key)))

    // An edit is shown at once and stored a moment after typing stops; the reply carries the new verdict.
    const editRow = (draft: Draft, row: Row) => {
        patchDraft(draft.key, { row })
        window.clearTimeout(pending.current.get(draft.key))
        pending.current.set(draft.key, window.setTimeout(() => {
            api<Draft & { stamp: string }>("update", { key: draft.key, row: clean(row) }).then(
                judged => {
                    pending.current.delete(draft.key)
                    stamp.current = judged.stamp
                    patchDraft(draft.key, { errors: judged.errors, warnings: judged.warnings, similar: judged.similar })
                },
                error => {
                    pending.current.delete(draft.key)
                    fail(error)
                },
            )
        }, 400))
    }

    async function addOwn() {
        if (!info) return
        const row = template(settings.pack, info, packType ?? settings.type)
        if (settings.country && row.kind === "about") row.country = [settings.country]
        try {
            const draft = await api<Draft & { stamp: string }>("add", { pack: settings.pack, row })
            stamp.current = draft.stamp
            setDrafts(list => [draft, ...list])
            setEditingKey(draft.key)
            setOneByOne(false)
        } catch (error) {
            fail(error)
        }
    }

    async function approve(list: Draft[]) {
        const keys = list.map(d => d.key)
        keys.forEach(k => busy(k, true))
        try {
            const { saved, failed, stamp: next } = await api<{ saved: { key: string; id: string; pack: string }[]; failed: { key: string; errors: string[] }[]; stamp: string }>("approve", { keys })
            stamp.current = next
            removeDrafts(saved.map(s => s.key))
            for (const f of failed) patchDraft(f.key, { errors: f.errors })
            const ids = saved.map(s => s.id).join(", ")
            setMessage({ tone: saved.length ? "ok" : "error", text: `Uložené ${saved.length}${ids ? `: ${ids}` : ""}.${failed.length ? ` ${failed.length} neprešlo kontrolou.` : ""}` })
            reload()
        } catch (error) {
            fail(error)
        } finally {
            keys.forEach(k => busy(k, false))
        }
    }

    function reject(draft: Draft) {
        removeDrafts([draft.key])
        api<{ stamp: string }>("reject", { key: draft.key }).then(result => { stamp.current = result.stamp }, fail)
    }

    async function request(draft: Draft, text: string) {
        busy(draft.key, true)
        try {
            const judged = await api<Draft & { stamp: string }>("request", { key: draft.key, text })
            stamp.current = judged.stamp
            patchDraft(draft.key, { request: judged.request })
        } catch (error) {
            fail(error)
        } finally {
            busy(draft.key, false)
        }
    }

    const ready = drafts.filter(d => !d.errors.length && !d.request)
    const requested = drafts.filter(d => d.request).length
    const at = Math.max(0, Math.min(cursor, drafts.length - 1))
    const shown = oneByOne ? drafts.slice(at, at + 1) : drafts
    const current = oneByOne ? shown[0] : undefined

    // One by one: A approve, R reject, E edit, arrows move. Ignored while typing.
    const onKey = useEffectEvent((event: KeyboardEvent) => {
        if (!current) return
        const target = event.target as HTMLElement
        if (target.closest("input, textarea, select")) return
        if (event.key === "a" && !current.errors.length) approve([current])
        else if (event.key === "r") reject(current)
        else if (event.key === "e") setEditingKey(k => (k === current.key ? null : current.key))
        else if (event.key === "ArrowRight") setCursor(c => Math.min(c + 1, drafts.length - 1))
        else if (event.key === "ArrowLeft") setCursor(c => Math.max(c - 1, 0))
    })
    useEffect(() => {
        const handler = (event: KeyboardEvent) => onKey(event)
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [])

    const bankRows = useMemo(() => {
        const rows = pack?.rows ?? []
        const term = search.trim().toLowerCase()
        return term ? rows.filter(row => JSON.stringify(row).toLowerCase().includes(term)) : rows
    }, [pack, search])

    return (
        <div className="flex min-h-screen flex-col text-slate-900 dark:text-[#E8ECF6]">
            <TopBar title="Trivia editor (dev)" theme={theme} onToggleTheme={() => setTheme(t => (t === "light" ? "dark" : "light"))} />

            <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-8 sm:px-6">
                <div>
                    <h1 className="!text-3xl font-extrabold tracking-[-0.02em]">Trivia editor</h1>
                    <p className={`mt-1 text-sm ${muted}`}>
                        Otázky píše Claude Code v chate (bez API), kontroluje ich <code>check:trivia</code>, do <code>data/trivia/</code> ide len to, čo schváliš. Iba dev server.
                    </p>
                </div>

                {loadError && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">Banka sa nenačítala: {loadError}. Beží <code>npm run dev</code>?</p>}

                {info && (
                    <section className={`${panel} mt-6 p-4`}>
                        <h2 className="!text-lg font-bold">Zadanie pre Clauda</h2>
                        <p className={`mb-3 text-sm ${muted}`}>Nastav, čo chceš, skopíruj text a vlož ho do Claude Code. Návrhy sa tu objavia samy.</p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                            <Field name="balík">
                                <select className={input} value={settings.pack} onChange={event => change({ pack: event.target.value, country: "" })}>
                                    {Object.entries(info.packs).map(([name, p]) => <option key={name} value={name}>{name} ({p.rows.length}){p.type ? ` · ${p.type}` : ""}</option>)}
                                </select>
                            </Field>
                            <Field name="typ">
                                <select className={input} value={packType ?? settings.type} disabled={!!packType} onChange={event => change({ type: event.target.value })}>
                                    {(packType ? [packType] : info.types).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                            <Field name="počet">
                                <input className={input} type="number" min={1} max={30} value={settings.count} onChange={event => change({ count: Math.max(1, Number(event.target.value) || 1) })} />
                            </Field>
                            <Field name="level">
                                <select className={input} value={settings.level} onChange={event => change({ level: Number(event.target.value) })}>
                                    <option value={0}>mix</option>
                                    {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </Field>
                            <Field name="kategória">
                                <select className={input} value={settings.cat} onChange={event => change({ cat: event.target.value })}>
                                    <option value="">mix</option>
                                    {Object.entries(info.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                </select>
                            </Field>
                            <Field name="krajina">
                                <select className={input} value={settings.country} onChange={event => change({ country: event.target.value })}>
                                    <option value="">{pack?.region ? "auto (najmenej pokryté)" : "žiadna"}</option>
                                    {regionCountries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                                </select>
                            </Field>
                            <div className="sm:col-span-2 lg:col-span-6">
                                <Field name="o čom (voliteľné)" hint="napr. „rieky vo východnej Európe“ alebo „história Japonska po roku 1945“">
                                    <textarea className={input} rows={2} value={settings.topic} onChange={event => change({ topic: event.target.value })} />
                                </Field>
                            </div>
                        </div>
                        <div className="mt-3"><CopyBox text={requestText(settings, info, countries)} /></div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button type="button" className={plain} onClick={addOwn}><Plus size={15} />Vlastná otázka</button>
                            {pack?.region && !settings.country && (info.thin[settings.pack]?.length ?? 0) > 0 && (
                                <span className={`text-xs ${muted}`}>Najmenej pokryté: {info.thin[settings.pack].map(t => `${t.name} (${t.count})`).join(", ")}</span>
                            )}
                        </div>
                    </section>
                )}

                {message && (
                    <p className={`mt-4 rounded-md px-3 py-2 text-sm ${message.tone === "ok" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200"}`}>
                        {message.text}
                    </p>
                )}

                {info && (
                    <section className="mt-8">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="!text-2xl font-bold">Na schválenie <span className={`text-base font-semibold ${muted}`}>{drafts.length} · {ready.length} pripravených</span></h2>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={plain} disabled={!drafts.length} onClick={() => { setOneByOne(o => !o); setCursor(0) }}>
                                    <ListChecks size={15} />{oneByOne ? "Zobraziť všetky" : "Po jednej"}
                                </button>
                                <button type="button" className={good} disabled={!ready.length} onClick={() => approve(ready)}><Check size={15} />Schváliť všetky bez chýb ({ready.length})</button>
                                <button type="button" className={bad} disabled={!drafts.length} onClick={() => { if (confirm(`Zamietnuť všetkých ${drafts.length} návrhov?`)) drafts.forEach(reject) }}><Trash2 size={15} />Zamietnuť všetky</button>
                            </div>
                        </div>

                        {requested > 0 && (
                            <div className="mt-3 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                                <p className="mb-2"><Sparkles size={13} className="mr-1 inline" />{requested} {requested === 1 ? "návrh čaká" : "návrhy čakajú"} na úpravu od Clauda. Vlož toto do Claude Code:</p>
                                <CopyBox text={REQUESTS_TEXT} />
                            </div>
                        )}

                        {oneByOne && current && (
                            <div className="mt-3 flex items-center gap-3 text-sm">
                                <button type="button" className={plain} disabled={at <= 0} onClick={() => setCursor(Math.max(0, at - 1))}><ChevronLeft size={15} /></button>
                                <span>{at + 1} / {drafts.length}</span>
                                <button type="button" className={plain} disabled={at >= drafts.length - 1} onClick={() => setCursor(at + 1)}><ChevronRight size={15} /></button>
                                <span className={muted}>Klávesy: A schváliť · R zamietnuť · E upraviť · ← →</span>
                            </div>
                        )}

                        {!drafts.length && <p className={`mt-4 text-sm ${muted}`}>Žiadne návrhy. Skopíruj zadanie do Claude Code alebo napíš vlastnú otázku.</p>}

                        <div className="mt-4 flex flex-col gap-4">
                            {shown.map(draft => (
                                <DraftCard
                                    key={draft.key}
                                    draft={draft}
                                    info={info}
                                    countries={countries}
                                    busy={busyKeys.has(draft.key)}
                                    editing={editingKey === draft.key}
                                    onEdit={on => setEditingKey(on ? draft.key : null)}
                                    onRow={row => editRow(draft, row)}
                                    onApprove={() => approve([draft])}
                                    onReject={() => reject(draft)}
                                    onRequest={text => request(draft, text)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {info && pack && (
                    <section className="mt-12">
                        <button type="button" className={plain} onClick={() => setBankOpen(o => !o)}>
                            {bankOpen ? "Skryť" : "Ukázať"} banku: {settings.pack} ({pack.rows.length})
                        </button>
                        {bankOpen && (
                            <div className={`${panel} mt-3 p-4`}>
                                <input className={input} placeholder="Hľadať v balíku…" value={search} onChange={event => setSearch(event.target.value)} />
                                <ul className="mt-3 flex max-h-[480px] flex-col gap-1 overflow-y-auto text-sm">
                                    {bankRows.map(row => (
                                        <li key={String(row.id)} className="flex gap-3 border-b border-slate-100 py-1 dark:border-[#1C2338]">
                                            <span className="w-14 shrink-0 font-mono text-xs text-slate-400">{String(row.id)}</span>
                                            <span className="flex-1">{String(row.q)}</span>
                                            <span className={`max-w-[30%] truncate ${muted}`}>{Array.isArray(row.answer) ? row.answer.join(", ") : String(row.answer ?? row.answers ?? "")}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                )}
            </main>
        </div>
    )
}
