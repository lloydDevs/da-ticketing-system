import { useEffect, useState } from "react";
import {
    collection, onSnapshot, query, orderBy,
    writeBatch, doc
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
    Bell, CheckCheck, Trash2,
    Clock, AlertCircle,
    Loader2, BellOff, Eye,
    ChevronDown, ChevronUp, Filter,
    CheckCircle2, CircleDot, RefreshCw, XCircle,
    Printer, Monitor, Wifi, HardDrive, Wrench
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
    if (!ts) return "—";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d)) return "—";
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function formatFullDate(ts) {
    if (!ts) return "—";
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-PH", {
        month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true
    });
}

// Build the main sentence from ticket fields
function buildSentence(ticket) {
    const name = [ticket.firstName, ticket.lastName].filter(Boolean).join(" ") || "Someone";
    const office = ticket.office || ticket.officeName || null;
    const dept = ticket.department || null;
    const category = ticket.issueCategory || ticket.category || "an issue";
    const location = ticket.location || null;

    let who = name;
    if (office) who += ` from ${office}`;
    if (dept) who += ` (${dept})`;

    let sentence = `${who} submitted a ${category} ticket`;
    if (location) sentence += ` at ${location}`;
    sentence += ".";
    return sentence;
}

function buildStatusSentence(ticket) {
    const status = ticket.status;
    if (status === "Resolved") {
        const tech = ticket.resolvedBy || ticket.assignedTechnician;
        const action = ticket.actionTaken || ticket.resolutionSummary;
        let s = "Ticket was resolved";
        if (tech) s += ` by ${tech}`;
        if (action) s += ` — ${action}`;
        s += ".";
        return s;
    }
    if (status === "In Progress") {
        const tech = ticket.assignedTechnician;
        return tech ? `Currently being handled by ${tech}.` : "Ticket is currently in progress.";
    }
    if (status === "Closed") return "This ticket has been closed.";
    return null;
}

const URGENCY_CONFIG = {
    High: {
        bar: "bg-red-500",
        badge: "bg-red-50 text-red-700 border border-red-200",
        dot: "bg-red-500",
        ring: "ring-1 ring-red-100",
        icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
    },
    Medium: {
        bar: "bg-amber-400",
        badge: "bg-amber-50 text-amber-700 border border-amber-200",
        dot: "bg-amber-400",
        ring: "ring-1 ring-amber-100",
        icon: <CircleDot className="w-3.5 h-3.5 text-amber-500" />,
    },
    Low: {
        bar: "bg-emerald-500",
        badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        dot: "bg-emerald-500",
        ring: "ring-1 ring-emerald-100",
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
    },
};

const STATUS_CONFIG = {
    Open: { cls: "bg-blue-50 text-blue-700 border border-blue-200", icon: <CircleDot className="w-3 h-3" /> },
    "In Progress": { cls: "bg-amber-50 text-amber-700 border border-amber-200", icon: <RefreshCw className="w-3 h-3" /> },
    Resolved: { cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    Closed: { cls: "bg-gray-100 text-gray-500 border border-gray-200", icon: <XCircle className="w-3 h-3" /> },
};

// Category icon mapping
function CategoryIcon({ category }) {
    const cat = (category || "").toLowerCase();
    const cls = "w-4 h-4";
    if (cat.includes("printer")) return <Printer className={cls} />;
    if (cat.includes("network") || cat.includes("wifi") || cat.includes("internet")) return <Wifi className={cls} />;
    if (cat.includes("hardware") || cat.includes("computer") || cat.includes("pc")) return <HardDrive className={cls} />;
    if (cat.includes("software") || cat.includes("system")) return <Monitor className={cls} />;
    return <Wrench className={cls} />;
}

// ─── Single notification card ─────────────────────────────────────────────────
function NotificationItem({ ticket, selected, onSelect, onMarkRead, onDelete }) {
    const [expanded, setExpanded] = useState(false);
    const cfg = URGENCY_CONFIG[ticket.urgency] || URGENCY_CONFIG.Low;
    const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.Open;
    const isUnread = !ticket.isViewed;
    const mainSentence = buildSentence(ticket);
    const statusSentence = buildStatusSentence(ticket);

    return (
        <div className={`relative rounded-xl border overflow-hidden transition-all ${isUnread
            ? `bg-white border-emerald-200 ${cfg.ring} shadow-sm`
            : "bg-white border-gray-100"
            }`}>
            {/* Urgency left bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />

            <div className="pl-5 pr-4 py-3.5">
                <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onSelect(ticket._docId)}
                        className="mt-1 w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer shrink-0"
                    />

                    {/* Category icon avatar */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isUnread ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
                        }`}>
                        <CategoryIcon category={ticket.issueCategory || ticket.category} />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                        {/* Top meta row */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono text-gray-400 font-semibold uppercase">
                                    {ticket.ticketId || ticket._docId?.slice(0, 8).toUpperCase()}
                                </span>
                                {isUnread && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-600 text-white uppercase tracking-wide">
                                        New
                                    </span>
                                )}
                            </div>
                            <span className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
                                <Clock className="w-3 h-3" />
                                {formatDate(ticket.createdAt)}
                            </span>
                        </div>

                        {/* ── MAIN SENTENCE ── */}
                        <p className={`text-sm leading-relaxed ${isUnread ? "text-gray-900 font-medium" : "text-gray-700 font-normal"
                            }`}>
                            {mainSentence}
                        </p>

                        {ticket.description && (
                            <p className="mt-1 text-xs text-gray-500 italic leading-relaxed line-clamp-2">
                                &ldquo;{ticket.description}&rdquo;
                            </p>
                        )}

                        {/* Status + urgency badges */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${statusCfg.cls}`}>
                                {statusCfg.icon}
                                {ticket.status}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${cfg.badge}`}>
                                {cfg.icon}
                                {ticket.urgency} urgency
                            </span>
                        </div>

                        {/* ── EXPANDED CONTENT ── */}
                        {expanded && (
                            <div className="mt-3 space-y-2">
                                {/* Status sentence */}
                                {statusSentence && (
                                    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs leading-relaxed ${ticket.status === "Resolved"
                                        ? "bg-emerald-50 border border-emerald-100 text-emerald-800"
                                        : "bg-amber-50 border border-amber-100 text-amber-800"
                                        }`}>
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        {statusSentence}
                                    </div>
                                )}

                                {/* Detail rows */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-500 pt-1">
                                    {ticket.email && (
                                        <span><span className="text-gray-400">Email: </span>{ticket.email}</span>
                                    )}
                                    {ticket.contactNumber && (
                                        <span><span className="text-gray-400">Contact: </span>{ticket.contactNumber}</span>
                                    )}
                                    {ticket.deviceName && (
                                        <span><span className="text-gray-400">Device: </span>{ticket.deviceName}</span>
                                    )}
                                    {ticket.assignedTechnician && (
                                        <span><span className="text-gray-400">Technician: </span>{ticket.assignedTechnician}</span>
                                    )}
                                    {ticket.resolvedDate && (
                                        <span className="col-span-2">
                                            <span className="text-gray-400">Resolved on: </span>
                                            {formatFullDate(ticket.resolvedDate)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Action row */}
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50">
                            <button
                                onClick={() => setExpanded(e => !e)}
                                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                {expanded
                                    ? <><ChevronUp className="w-3 h-3" /> Show less</>
                                    : <><ChevronDown className="w-3 h-3" /> Show details</>
                                }
                            </button>

                            <div className="flex items-center gap-1">
                                {isUnread && (
                                    <button
                                        onClick={() => onMarkRead(ticket._docId)}
                                        className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Mark read
                                    </button>
                                )}
                                {/* <button
                                    onClick={() => onDelete(ticket._docId)}
                                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                </button> */}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Confirm action</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{message}</p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const FILTER_TABS = ["All", "Unread", "Read"];
const URGENCY_FILTERS = ["All Urgency", "High", "Medium", "Low"];

export default function Notifications() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(new Set());
    const [activeTab, setActiveTab] = useState("All");
    const [urgencyFilter, setUrgencyFilter] = useState("All Urgency");
    const [confirm, setConfirm] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map((d) => ({ _docId: d.id, ...d.data() })));
            setLoading(false);
        });
        return unsub;
    }, []);

    const filtered = tickets.filter((t) => {
        const matchTab =
            activeTab === "All" ||
            (activeTab === "Unread" && !t.isViewed) ||
            (activeTab === "Read" && t.isViewed);
        const matchUrgency = urgencyFilter === "All Urgency" || t.urgency === urgencyFilter;
        return matchTab && matchUrgency;
    });

    const unreadCount = tickets.filter((t) => !t.isViewed).length;
    const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t._docId));
    const someSelected = selected.size > 0;

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) setSelected(new Set());
        else setSelected(new Set(filtered.map((t) => t._docId)));
    };

    async function markRead(ids) {
        setActionLoading(true);
        const arr = Array.from(ids);
        for (let i = 0; i < arr.length; i += 400) {
            const batch = writeBatch(db);
            arr.slice(i, i + 400).forEach((id) =>
                batch.update(doc(db, "tickets", id), { isViewed: true })
            );
            await batch.commit();
        }
        setSelected(new Set());
        setActionLoading(false);
    }

    async function markAllRead() {
        const unread = tickets.filter((t) => !t.isViewed).map((t) => t._docId);
        if (!unread.length) return;
        await markRead(unread);
    }

    async function deleteItems(ids) {
        setActionLoading(true);
        const arr = Array.from(ids);
        for (let i = 0; i < arr.length; i += 400) {
            const batch = writeBatch(db);
            arr.slice(i, i + 400).forEach((id) => batch.delete(doc(db, "tickets", id)));
            await batch.commit();
        }
        setSelected(new Set());
        setConfirm(null);
        setActionLoading(false);
    }

    function requestDelete(ids) {
        const count = ids.size ?? 1;
        setConfirm({
            message: `Delete ${count} ticket${count !== 1 ? "s" : ""}? This cannot be undone.`,
            ids,
        });
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                <span className="ml-3 text-sm text-gray-400">Loading notifications…</span>
            </div>
        );
    }

    const renderList = (items) =>
        items.map((ticket) => (
            <NotificationItem
                key={ticket._docId}
                ticket={ticket}
                selected={selected.has(ticket._docId)}
                onSelect={toggleSelect}
                onMarkRead={(id) => markRead(new Set([id]))}
                onDelete={(id) => requestDelete(new Set([id]))}
            />
        ));

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-4">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>
                        {unreadCount > 0 && (
                            <span className="min-w-[22px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold">
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {tickets.length} total tickets · {unreadCount} unread
                    </p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={markAllRead}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all as read
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    {FILTER_TABS.map((tab) => {
                        const count =
                            tab === "All" ? tickets.length
                                : tab === "Unread" ? tickets.filter((t) => !t.isViewed).length
                                    : tickets.filter((t) => t.isViewed).length;
                        return (
                            <button
                                key={tab}
                                onClick={() => { setActiveTab(tab); setSelected(new Set()); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === tab
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {tab}
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${activeTab === tab ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                                    }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    <select
                        value={urgencyFilter}
                        onChange={(e) => { setUrgencyFilter(e.target.value); setSelected(new Set()); }}
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-white outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
                    >
                        {URGENCY_FILTERS.map((f) => <option key={f}>{f}</option>)}
                    </select>
                </div>
            </div>

            {/* Bulk action bar */}
            {someSelected && (
                <div className="flex items-center justify-between gap-3 bg-emerald-950 text-white px-4 py-2.5 rounded-xl shadow-lg">
                    <div className="flex items-center gap-3">
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                            className="w-3.5 h-3.5 rounded accent-emerald-400 cursor-pointer" />
                        <span className="text-sm font-medium">{selected.size} selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => markRead(selected)} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition disabled:opacity-50">
                            <Eye className="w-3.5 h-3.5" /> Mark read
                        </button>
                        {/* <button onClick={() => requestDelete(selected)} disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-50">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button> */}
                        <button onClick={() => setSelected(new Set())}
                            className="text-xs text-emerald-300 hover:text-white px-2 py-1.5 transition">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Select all hint */}
            {!someSelected && filtered.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                    <input type="checkbox" checked={false} onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer" />
                    <span className="text-xs text-gray-400">Select all {filtered.length} items</span>
                </div>
            )}

            {/* Empty state */}
            {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <BellOff className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium text-sm">No notifications</p>
                    <p className="text-gray-400 text-xs mt-1">
                        {activeTab === "Unread"
                            ? "You're all caught up! No unread tickets."
                            : "No tickets match your current filter."}
                    </p>
                </div>
            )}

            {/* List */}
            {filtered.length > 0 && (
                <div className="space-y-2">
                    {activeTab === "All" ? (
                        <>
                            {filtered.some((t) => !t.isViewed) && (
                                <>
                                    <div className="flex items-center gap-2 pt-1">
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unread</span>
                                        <span className="flex-1 h-px bg-gray-200" />
                                        <span className="text-xs text-gray-400">{filtered.filter((t) => !t.isViewed).length}</span>
                                    </div>
                                    {renderList(filtered.filter((t) => !t.isViewed))}
                                </>
                            )}
                            {filtered.some((t) => t.isViewed) && (
                                <>
                                    <div className="flex items-center gap-2 pt-3">
                                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Read</span>
                                        <span className="flex-1 h-px bg-gray-200" />
                                        <span className="text-xs text-gray-400">{filtered.filter((t) => t.isViewed).length}</span>
                                    </div>
                                    {renderList(filtered.filter((t) => t.isViewed))}
                                </>
                            )}
                        </>
                    ) : (
                        renderList(filtered)
                    )}
                </div>
            )}

            {confirm && (
                <ConfirmDialog
                    message={confirm.message}
                    onConfirm={() => deleteItems(confirm.ids)}
                    onCancel={() => setConfirm(null)}
                />
            )}
        </div>
    );
}