import { useState, useRef, useEffect } from "react";
import {
    MessageSquare, X, Send, Minimize2, Bot,
    Download, Loader2, Trash2, AlertTriangle, RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── API key from .env ────────────────────────────────────────────────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";

// ─── Model fallback chain ─────────────────────────────────────────────────────
const MODELS = [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", rpd: 20 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", rpd: 20 },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", rpd: 20 },
    { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", rpd: 20 },
];

function geminiUrl(modelId) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;
}

// ─── Custom Q&A — answered locally, never sent to Gemini ─────────────────────
// Each entry has:
//   keywords : ALL of these words must appear in the user's message (lowercase)
//   answer   : the exact reply to return
// Add as many entries as you need.
// ─── Developer info — edit these with your real details ──────────────────────
const DEVELOPER = {
    name: "Lloyd Ramirez",         // ← your full name
    role: "Computer Programmer",            // ← your role/title
    agency: "DA-MIMAROPA",           // ← your agency
    email: "lloyd11ramirez@gmail.com", // ← your email (or remove line)
};

const DEV_ANSWER =
    `${DEVELOPER.name} is the ${DEVELOPER.role} of ${DEVELOPER.agency} ` +
    `and the developer of this IT Support Ticketing System.`;

const CUSTOM_QA = [
    // ── Developer identity — catches every natural way to ask ─────────────────
    { keywords: ["who", "developer"], answer: DEV_ANSWER },
    { keywords: ["who", "developed"], answer: DEV_ANSWER },
    { keywords: ["who", "made"], answer: DEV_ANSWER },
    { keywords: ["who", "built"], answer: DEV_ANSWER },
    { keywords: ["who", "created"], answer: DEV_ANSWER },
    { keywords: ["who", "programmed"], answer: DEV_ANSWER },
    { keywords: ["who", "coded"], answer: DEV_ANSWER },
    { keywords: ["developer"], answer: DEV_ANSWER },

    // ── Name-based lookups for the developer ─────────────────────────────────
    // Add every first-name variant people might type (typos included)
    { keywords: ["lloyd"], answer: DEV_ANSWER },
    { keywords: ["loyd"], answer: DEV_ANSWER },   // common typo
    { keywords: ["ramirez"], answer: DEV_ANSWER },

    // ── System info ───────────────────────────────────────────────────────────
    {
        keywords: ["version"],
        answer: "DA-MIMAROPA IT Support Ticketing System v1.0.0"
    },
    {
        keywords: ["contact", "support"],
        answer: `For system support, contact ${DEVELOPER.name} at ${DEVELOPER.email}.`
    },

    // ── Add your own below ────────────────────────────────────────────────────
    // { keywords: ["purpose"], answer: "This system tracks IT support tickets for all DA-MIMAROPA offices." },
];

// Returns a custom answer if the message matches any FAQ entry, otherwise null.
function checkCustomQA(message) {
    const lower = message.toLowerCase();
    for (const entry of CUSTOM_QA) {
        if (entry.keywords.every(kw => lower.includes(kw))) {
            return entry.answer;
        }
    }
    return null;
}

const exhaustedModels = new Set();

async function callGemini(payload) {
    for (const model of MODELS) {
        if (exhaustedModels.has(model.id)) continue;

        try {
            const res = await fetch(geminiUrl(model.id), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (text) return { text, model: model.label };
                throw new Error("Empty response from model");
            }

            const err = await res.json().catch(() => ({}));
            const msg = err?.error?.message ?? "";

            if (res.status === 429 || msg.toLowerCase().includes("quota")) {
                exhaustedModels.add(model.id);
                console.warn(`[ChatBot] ${model.label} quota exhausted, trying next…`);
                continue;
            }

            if (res.status === 404 || msg.toLowerCase().includes("not found")) {
                exhaustedModels.add(model.id);
                continue;
            }

            throw new Error(msg || `HTTP ${res.status}`);

        } catch (err) {
            if (err.message.includes("fetch") || err.message.includes("JSON")) continue;
            throw err;
        }
    }

    throw new Error(
        "All available Gemini models have hit their daily quota.\n\n" +
        "Options:\n" +
        "• Wait until midnight (UTC) for quotas to reset\n" +
        "• Enable billing at https://aistudio.google.com — costs ~$0.01/day for typical use\n" +
        "• Create a new API key at https://aistudio.google.com/app/apikey"
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
    if (!ts) return "—";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function tsToDate(ts) {
    if (!ts) return null;
    if (ts?.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d) ? null : d;
}

// ─── Build FULL data context ──────────────────────────────────────────────────
// Sends every ticket as a row so the AI can answer ANY question about the data.
// For very large datasets (>500 tickets), we chunk only the fields needed to
// keep prompt size reasonable, but nothing is hidden from the model.
function buildDataContext(tickets) {
    if (!tickets.length) return "No ticket data available yet.";

    // ── Summary block (fast reference for common stats) ──────────────────────
    const total = tickets.length;
    const open = tickets.filter(t => t.status === "Open").length;
    const inProgress = tickets.filter(t => t.status === "In Progress").length;
    const resolved = tickets.filter(t => t.status === "Resolved").length;
    const closed = tickets.filter(t => t.status === "Closed").length;
    const high = tickets.filter(t => t.urgency === "High").length;
    const medium = tickets.filter(t => t.urgency === "Medium").length;
    const low = tickets.filter(t => t.urgency === "Low").length;
    const resRate = Math.round(((resolved + closed) / total) * 100);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
    const todayCount = tickets.filter(t => { const d = tsToDate(t.createdAt); return d && d >= today; }).length;
    const monthCount = tickets.filter(t => { const d = tsToDate(t.createdAt); return d && d >= thisMonth; }).length;

    const resTimes = tickets
        .filter(t => (t.status === "Resolved" || t.status === "Closed") && t.createdAt && t.resolvedDate)
        .map(t => {
            const c = tsToDate(t.createdAt), r = tsToDate(t.resolvedDate);
            return c && r ? (r - c) / 86400000 : null;
        }).filter(n => n !== null);
    const avgRes = resTimes.length
        ? (resTimes.reduce((a, b) => a + b, 0) / resTimes.length).toFixed(1)
        : "N/A";

    // ── Full ticket roster ───────────────────────────────────────────────────
    // Each ticket is a compact single-line record. Fields that are empty are
    // omitted to keep the prompt lean.
    const ticketLines = tickets.map((t, idx) => {
        const name = [t.firstName, t.lastName].filter(Boolean).join(" ") || "—";
        const office = t.office || t.officeName || "Unknown";
        const category = t.issueCategory || t.category || "Unknown";
        const device = t.deviceName || "—";
        const created = formatDate(t.createdAt);
        const resolvedOn = t.resolvedDate ? formatDate(t.resolvedDate) : "—";
        const tech = t.resolvedBy || t.assignedTechnician || "—";
        const ticketId = t.ticketId || String(idx + 1);

        return (
            `#${ticketId} | ${name} | ${office} | ${t.status} | ${t.urgency} | ` +
            `${category} | ${device} | Tech: ${tech} | Created: ${created} | Resolved: ${resolvedOn}`
        );
    });

    return `
COMPLETE TICKET DATA — DA-MIMAROPA IT Support System
=====================================================
Generated: ${new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

── SUMMARY ──
Total=${total} | Open=${open} | In Progress=${inProgress} | Resolved=${resolved} | Closed=${closed}
Resolution rate=${resRate}% | Avg resolution time=${avgRes} days
Urgency: High=${high} | Medium=${medium} | Low=${low}
New today=${todayCount} | New this month=${monthCount}

── ALL ${total} TICKETS ──
Format: #ID | Name | Office | Status | Urgency | Category | Device | Tech | Created | Resolved
${ticketLines.join("\n")}
`.trim();
}

function extractReportData(text) {
    const rows = [];
    text.split("\n").forEach(line => {
        const m = line.match(/^[-•*]?\s*(.+?):\s*(\d+)\s*$/);
        if (m) rows.push({ label: m[1].trim(), value: parseInt(m[2], 10) });
    });
    return rows.length >= 2 ? rows : null;
}

function exportData(data, format) {
    const rows = data.map(r => ({ Label: r.label, Count: r.value }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const date = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const a = document.createElement("a");
        a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
        a.download = `da-mimaropa-report-${date}.csv`;
        a.click();
    } else {
        XLSX.writeFile(wb, `da-mimaropa-report-${date}.xlsx`);
    }
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
    const isUser = msg.role === "user";
    const isError = msg.isError;
    const reportData = !isUser ? extractReportData(msg.content ?? "") : null;

    if (isUser) {
        return (
            <div className="flex justify-end mb-3">
                <div className="max-w-[82%] bg-emerald-700 text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-sm leading-relaxed">
                    {msg.content}
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2 mb-3">
            <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${isError ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"
                }`}>
                {isError
                    ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    : <Bot className="w-3.5 h-3.5 text-emerald-600" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className={`text-sm px-4 py-3 rounded-2xl rounded-bl-sm leading-relaxed whitespace-pre-wrap ${isError
                        ? "bg-red-50 border border-red-100 text-red-800"
                        : "bg-white border border-gray-100 text-gray-800"
                    }`}>
                    {msg.content}
                </div>

                {msg.model && (
                    <p className="text-[10px] text-gray-300 mt-1 ml-1">via {msg.model}</p>
                )}

                {reportData && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                        <button onClick={() => exportData(reportData, "csv")}
                            className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition">
                            <Download className="w-3 h-3" /> Export CSV
                        </button>
                        <button onClick={() => exportData(reportData, "excel")}
                            className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition">
                            <Download className="w-3 h-3" /> Export Excel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

const SUGGESTIONS = [
    "How many open tickets right now?",
    "Which office has the most unresolved tickets?",
    "List all names with open tickets",
    "Give me a report by office",
    "List all high urgency tickets with names",
    "Who resolved the most tickets?",
    "Top issue categories this month?",
    "What is our overall resolution rate?",
    "Average resolution time?",
    "Show all unresolved tickets for each person",
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function TicketChatBot({ tickets = [] }) {
    const [open, setOpen] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [showSugg, setShowSugg] = useState(true);
    const [activeModel, setActiveModel] = useState(MODELS[0].label);

    const [messages, setMessages] = useState([{
        role: "assistant",
        content:
            "Hi! I'm your IT ticket assistant.\n\n" +
            `I have full access to all ${tickets.length} ticket records — including names, offices, statuses, and history.\n\n` +
            "Try asking:\n" +
            "• \"List all names with open tickets\"\n" +
            "• \"Which office has the most issues?\"\n" +
            "• \"Generate a report by category\"",
    }]);

    // Re-generate greeting if ticket count changes (e.g. on first load)
    const prevCount = useRef(tickets.length);
    useEffect(() => {
        if (tickets.length !== prevCount.current) {
            prevCount.current = tickets.length;
            setMessages([{
                role: "assistant",
                content:
                    "Hi! I'm your IT ticket assistant.\n\n" +
                    `I have full access to all ${tickets.length} ticket records — including names, offices, statuses, and history.\n\n` +
                    "Try asking:\n" +
                    "• \"List all names with open tickets\"\n" +
                    "• \"Which office has the most issues?\"\n" +
                    "• \"Generate a report by category\"",
            }]);
        }
    }, [tickets.length]);

    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const apiKeyMissing = !GEMINI_API_KEY || GEMINI_API_KEY === "your_gemini_api_key_here";

    useEffect(() => {
        if (open && !minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, open, minimized]);

    useEffect(() => {
        if (open && !minimized) setTimeout(() => inputRef.current?.focus(), 100);
    }, [open, minimized]);

    async function sendMessage(text) {
        const userText = (text ?? input).trim();
        if (!userText || loading) return;

        setInput("");
        setShowSugg(false);
        setMessages(prev => [...prev, { role: "user", content: userText }]);
        setLoading(true);

        // ── Check custom Q&A first — no API call needed ───────────────────────
        const customAnswer = checkCustomQA(userText);
        if (customAnswer) {
            setMessages(prev => [...prev, { role: "assistant", content: customAnswer }]);
            setLoading(false);
            return;
        }

        try {
            if (apiKeyMissing) throw new Error(
                "Gemini API key not set.\n\n" +
                "1. Go to https://aistudio.google.com/app/apikey\n" +
                "2. Create a free key\n" +
                "3. Add VITE_GEMINI_API_KEY=your_key to your .env\n" +
                "4. Restart the dev server"
            );

            // Build full data context — ALL tickets, not just a summary
            const dataContext = buildDataContext(tickets);

            const systemInstruction =
                `You are an IT support ticket analyst for DA-MIMAROPA (Department of Agriculture, MIMAROPA Region, Philippines).\n` +
                `You have access to the COMPLETE ticket dataset below — every record, every name, every field.\n` +
                `Rules:\n` +
                `- Answer questions using ONLY the provided ticket data\n` +
                `- When asked for names, list ALL matching names — never say "data not available"\n` +
                `- For tabular reports, use bullet format: "- Label: number"\n` +
                `- Be concise but complete; never truncate name or ticket lists\n` +
                `- If genuinely no data matches, say so clearly\n\n` +
                dataContext;

            const history = messages.slice(1).map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            }));

            const { text: reply, model } = await callGemini({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [
                    ...history,
                    { role: "user", parts: [{ text: userText }] },
                ],
                generationConfig: {
                    temperature: 0.2,
                    // Increase output tokens so long name/ticket lists aren't cut off
                    maxOutputTokens: 2048,
                },
            });

            setActiveModel(model);
            setMessages(prev => [...prev, { role: "assistant", content: reply, model }]);

        } catch (err) {
            console.error("ChatBot error:", err);
            setMessages(prev => [...prev, { role: "assistant", content: err.message, isError: true }]);
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    function clearChat() {
        setMessages([{
            role: "assistant",
            content:
                `Chat cleared. I still have all ${tickets.length} tickets loaded.\n\nWhat would you like to know?`,
        }]);
        setShowSugg(true);
    }

    const availableCount = MODELS.filter(m => !exhaustedModels.has(m.id)).length;

    return (
        <>
            {!open && (
                <button onClick={() => setOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                    title="Open ticket assistant">
                    <MessageSquare className="w-6 h-6" />
                    {tickets.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-white text-emerald-800 text-[10px] font-semibold rounded-full px-1.5 py-0.5 border border-emerald-200 shadow-sm">
                            {tickets.length}
                        </span>
                    )}
                </button>
            )}

            {open && (
                <div className="fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                    style={{ width: 390, height: minimized ? "auto" : 580 }}>

                    {/* Header */}
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-950 shrink-0">
                        <div className="w-7 h-7 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-semibold leading-tight">Ticket Assistant</div>
                            <div className="text-emerald-400 text-[10px] flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                                {activeModel} · {tickets.length} tickets loaded · {availableCount}/{MODELS.length} models
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button onClick={clearChat} title="Clear chat"
                                className="text-emerald-400 hover:text-white p-1.5 rounded-lg hover:bg-emerald-900 transition">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setMinimized(m => !m)} title={minimized ? "Restore" : "Minimize"}
                                className="text-emerald-400 hover:text-white p-1.5 rounded-lg hover:bg-emerald-900 transition">
                                <Minimize2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setOpen(false); setMinimized(false); }} title="Close"
                                className="text-emerald-400 hover:text-white p-1.5 rounded-lg hover:bg-emerald-900 transition">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {!minimized && (
                        <>
                            {/* API key warning */}
                            {apiKeyMissing && (
                                <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 shrink-0 flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    <span>
                                        <strong>API key missing.</strong> Add{" "}
                                        <code className="bg-amber-100 px-1 rounded font-mono">VITE_GEMINI_API_KEY</code>{" "}
                                        to your <code className="bg-amber-100 px-1 rounded font-mono">.env</code>.{" "}
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                                            className="underline font-semibold hover:text-amber-900">Get free key →</a>
                                    </span>
                                </div>
                            )}

                            {/* All models exhausted */}
                            {!apiKeyMissing && availableCount === 0 && (
                                <div className="mx-3 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-800 shrink-0 flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                                    <span>
                                        All models hit daily quota. Resets at midnight UTC.{" "}
                                        <button onClick={() => { exhaustedModels.clear(); setActiveModel(MODELS[0].label); }}
                                            className="underline font-semibold inline-flex items-center gap-1">
                                            <RefreshCw className="w-3 h-3" /> Retry now
                                        </button>
                                    </span>
                                </div>
                            )}

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 min-h-0">
                                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

                                {showSugg && messages.length <= 1 && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Try asking</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {SUGGESTIONS.map((s, i) => (
                                                <button key={i} onClick={() => sendMessage(s)}
                                                    className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition text-left">
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {loading && (
                                    <div className="flex items-start gap-2 mb-3">
                                        <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                                            <Bot className="w-3.5 h-3.5 text-emerald-600" />
                                        </div>
                                        <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                                            <span className="text-sm text-gray-400">Thinking…</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            {/* Input */}
                            <div className="px-3 py-3 border-t border-gray-100 bg-white shrink-0">
                                <div className="flex items-end gap-2">
                                    <textarea ref={inputRef} rows={1} value={input} disabled={loading}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask about tickets or request a report…"
                                        className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 bg-white placeholder-gray-400 leading-relaxed disabled:opacity-60"
                                        style={{ maxHeight: 100, minHeight: 40 }}
                                        onInput={e => {
                                            e.target.style.height = "auto";
                                            e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                                        }}
                                    />
                                    <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
                                        className="w-9 h-9 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center shrink-0 transition active:scale-95">
                                        <Send className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1.5 px-1">
                                    <span className="text-[10px] text-gray-300">Enter to send · Shift+Enter for newline</span>
                                    <button onClick={clearChat} className="text-[10px] text-gray-300 hover:text-gray-500 transition">
                                        Clear chat
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
}