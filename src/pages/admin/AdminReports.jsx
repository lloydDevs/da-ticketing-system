import { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { OFFICES, ISSUE_CATEGORIES } from "../../data/offices";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import {
    FileDown, FileText, Filter, X, BarChart2,
    Ticket, CheckCircle, Clock, AlertTriangle, UserCheck,
    TrendingUp, ChevronDown, ChevronUp, FilePlus,
} from "lucide-react";
import DeviceTroubleReport from "./DeviceTroubleReport";
import { exportAnalyticsPDF } from "./exportAnalyticsPDF";


// ─── Header image (base64) ────────────────────────────────────────────────────
// Place your extracted header PNG as a base64 string here.
// Import from a separate file to keep this file readable:
//   import { HEADER_IMAGE_B64 } from "./headerImage.js";
// Or paste the string directly into HEADER_IMAGE_B64 below.
import { HEADER_IMAGE_B64 } from "./headerImage.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"];
const URGENCY_OPTIONS = ["High", "Medium", "Low"];

const URGENCY_BADGE = {
    High: "bg-red-50 text-red-700 border border-red-100",
    Medium: "bg-amber-50 text-amber-700 border border-amber-100",
    Low: "bg-emerald-50 text-emerald-700 border border-emerald-100",
};
const STATUS_BADGE = {
    Open: "bg-blue-50 text-blue-700 border border-blue-100",
    "In Progress": "bg-amber-50 text-amber-700 border border-amber-100",
    Resolved: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    Closed: "bg-gray-100 text-gray-500 border border-gray-200",
};


// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
    if (!ts) return "—";
    if (ts?.seconds)
        return new Date(ts.seconds * 1000).toLocaleDateString("en-PH", {
            month: "short", day: "numeric", year: "numeric",
        });
    const d = new Date(ts);
    return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function tsToDate(ts) {
    if (!ts) return null;
    if (ts?.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d) ? null : d;
}

// ─── PDF export — one form per ticket ────────────────────────────────────────
function exportPDF(tickets) {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = 210;
    const pageH = 297;
    const mL = 18;   // left margin
    const mR = 18;   // right margin
    const cW = pageW - mL - mR;

    // ── Colours ───────────────────────────────────────────────────────────────
    const BLACK = [0, 0, 0];
    const DARK = [50, 50, 50];
    const MID = [120, 120, 120];

    // ── Layout constants ──────────────────────────────────────────────────────
    const LABEL_W = 46;   // width of the label column (e.g. "Department/Location")
    const LINE_GAP = 10;   // vertical gap between field rows
    const COLON_X = mL + LABEL_W;   // x position of the colon

    // ─── Utility: draw a single underlined field row ──────────────────────────
    // label   : left-side label text
    // value   : right-side value text
    // y       : top of the row
    // lineRows: how many underlines to draw (default 1)
    const drawFieldRow = (label, value, y, lineRows = 1) => {
        const lineH = 7;   // height per underline row

        // Label text
        doc.setFontSize(9)
            .setFont("helvetica", "normal")
            .setTextColor(...DARK);
        doc.text(label, mL, y + lineH - 2);

        // Colon
        doc.text(":", COLON_X - 2, y + lineH - 2);

        // Value text — split across rows if needed
        doc.setTextColor(...BLACK);
        const valX = COLON_X + 4;
        const valW = mL + cW - valX;
        const lines = doc.splitTextToSize(value || "", valW);

        for (let r = 0; r < lineRows; r++) {
            // Underline
            doc.setDrawColor(...DARK);
            doc.setLineWidth(0.3);
            const lineY = y + (r + 1) * lineH;
            doc.line(valX - 2, lineY, mL + cW, lineY);

            // Text on this underline
            if (lines[r]) {
                doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(...BLACK);
                doc.text(lines[r], valX, lineY - 2);
            }
        }

        return y + lineRows * lineH;  // returns new y after this field
    };

    // ─── Utility: right-aligned label + underline (for Date / Request No.) ────
    const drawRightField = (label, value, y) => {
        const labelX = mL + cW * 0.55;
        const lineY = y + 7;

        doc.setFontSize(9)
            .setFont("helvetica", "normal")
            .setTextColor(...DARK);
        doc.text(label, labelX, lineY - 2);
        doc.text(":", labelX + doc.getTextWidth(label) + 1, lineY - 2);

        const valX = labelX + doc.getTextWidth(label) + 4;
        doc.setDrawColor(...DARK);
        doc.setLineWidth(0.3);
        doc.line(valX, lineY, mL + cW, lineY);

        if (value) {
            doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(...BLACK);
            doc.text(value, valX + 1, lineY - 2);
        }

        return lineY;
    };

    // ─── Footer ───────────────────────────────────────────────────────────────
    // Matches the PDF: a horizontal rule near the bottom, then three lines of
    // meta-text (Doc No., Rev No., Issued Date) stacked on the left beneath it.
    const drawFooter = (ticketPage, ticketTotal) => {
        // The three footer lines need ~14mm of space; place the rule at -16mm
        const ruleY = pageH - 18;

        doc.setDrawColor(...DARK);

        doc.setFontSize(7.5)
            .setFont("helvetica", "normal")
            .setTextColor(...DARK);

        // Three stacked lines below the rule (4 mm apart)
        doc.text("Doc. No.: DAMIMAROPA-F079-2023", mL, ruleY + 4);
        doc.text("Rev. No.: 0", mL, ruleY + 8);
        doc.text("Issued Date: 10/23/23", mL, ruleY + 12);
    };

    // ─── Draw one form page ───────────────────────────────────────────────────
    const drawForm = (ticket, isFirst, ticketPage, ticketTotal) => {
        if (!isFirst) doc.addPage();
        let y = 8;

        // ── (1) Header image ──────────────────────────────────────────────────
        try {
            doc.addImage(HEADER_IMAGE_B64, "PNG", mL, y, cW, 28);
        } catch (_) {
            doc.setFontSize(10)
                .setFont("helvetica", "bold")
                .setTextColor(...DARK);
            doc.text("Republic of the Philippines", pageW / 2, y + 6, { align: "center" });
            doc.text("DEPARTMENT OF AGRICULTURE", pageW / 2, y + 11, { align: "center" });
            doc.text("MIMAROPA REGION", pageW / 2, y + 16, { align: "center" });
        }
        y += 32;

        // ── (2) Form title ────────────────────────────────────────────────────
        doc.setFontSize(13)
            .setFont("helvetica", "bold")
            .setTextColor(...BLACK);
        doc.text("REQUEST FOR TECHNICAL SUPPORT", pageW / 2, y + 7, { align: "center" });
        y += 18;

        // ── (3) Date row (right-aligned) ──────────────────────────────────────
        drawRightField("Date", formatDate(ticket.createdAt), y);
        y += 14;

        // ── (4) Department/Location ───────────────────────────────────────────
        const deptStr = [ticket.office, ticket.department].filter(Boolean).join(" — ");
        const locStr = ticket.location || "";
        y = drawFieldRow(
            "Department/Location",
            [deptStr, locStr].filter(Boolean).join("  /  "),
            y
        ) + 3;

        // ── (5) Subject ───────────────────────────────────────────────────────
        const subject = [ticket.issueCategory, ticket.deviceName].filter(Boolean).join(" — ");
        y = drawFieldRow("Subject", subject, y) + 3;

        // ── (6) Details (3 underlines) ────────────────────────────────────────
        y = drawFieldRow("Details", ticket.description || "", y, 3) + 3;

        y += 8;

        // ── (7) Dashed separator ──────────────────────────────────────────────
        doc.setLineDashPattern([1, 1], 0);
        doc.setDrawColor(...MID);
        doc.setLineWidth(0.5);
        doc.line(mL, y, mL + cW, y);
        doc.setLineDashPattern([], 0);
        y += 10;

        // ── (8) IT section heading ────────────────────────────────────────────
        doc.setFontSize(10)
            .setFont("helvetica", "bold")
            .setTextColor(...BLACK);
        doc.text("To be accomplished by IT Technical Support", mL, y);
        y += 10;

        // ── (9) Request No. and Date (right side) ─────────────────────────────
        drawRightField("Request No.", ticket.ticketId || "", y);
        y += 9;
        drawRightField("Date", formatDate(ticket.resolvedDate) || "", y);
        y += 14;

        // ── (10) Remarks / Actions Taken (4 underlines) ───────────────────────
        y = drawFieldRow(
            "Remarks/Actions Taken",
            ticket.actionTaken || ticket.resolutionSummary || "",
            y,
            4
        ) + 3;

        y += 14;

        // ── (11) Signature block ──────────────────────────────────────────────
        const sigW = (cW - 20) / 2;
        const sig2X = mL + sigW + 20;

        const drawSig = (label, name, sx) => {
            // Label
            doc.setFontSize(9)
                .setFont("helvetica", "normal")
                .setTextColor(...DARK);
            doc.text(label, sx, y);

            // Printed name (centered above line)
            if (name) {
                doc.setFontSize(9)
                    .setFont("helvetica", "normal")
                    .setTextColor(...BLACK);
                doc.text(name, sx + sigW / 2, y + 12, { align: "center" });
            }

            // Signature underline
            doc.setDrawColor(...BLACK);
            doc.setLineWidth(0.4);
            doc.line(sx, y + 16, sx + sigW, y + 16);
        };

        drawSig(
            "Requested by:",
            `${ticket.firstName || ""} ${ticket.lastName || ""}`.trim(),
            mL
        );
        drawSig(
            "Received/Acted by:",
            ticket.resolvedBy || ticket.assignedTechnician || "",
            sig2X
        );

        // ── (12) Footer ───────────────────────────────────────────────────────
        drawFooter(ticketPage, ticketTotal);
    };

    // ─── Render all tickets ───────────────────────────────────────────────────
    tickets.forEach((ticket, i) => {
        drawForm(ticket, i === 0, 1, 1);
    });

    const datePart = new Date().toISOString().slice(0, 10);
    doc.save(`DA-MIMAROPA-IT-Forms-${datePart}.pdf`);
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, iconBg, iconColor, sub }) {
    return (
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                <Icon className="w-4 h-4" style={{ color: iconColor }} />
            </div>
            <div className="min-w-0">
                <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

// ─── Mini horizontal bar ─────────────────────────────────────────────────────
function MiniBar({ label, value, max, color }) {
    const width = max > 0 ? (value / max) * 100 : 0;
    return (
        <div className="flex items-center gap-3">
            <div className="w-28 text-right text-xs text-gray-500 shrink-0 truncate">{label}</div>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, background: color }} />
            </div>
            <div className="w-8 text-xs text-gray-500 shrink-0 text-right">{value}</div>
        </div>
    );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function Pill({ label, onRemove }) {
    return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-full">
            {label}
            <button onClick={onRemove} className="hover:text-emerald-900 transition">
                <X className="w-3 h-3" />
            </button>
        </span>
    );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
    if (sortCol !== col) return <ChevronDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 text-emerald-600" />
        : <ChevronDown className="w-3 h-3 text-emerald-600" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminReports() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pdfLoading, setPdfLoading] = useState(false);

    // ── Filters ──
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selStatus, setSelStatus] = useState([]);
    const [selUrgency, setSelUrgency] = useState([]);
    const [selOffice, setSelOffice] = useState("All");
    const [selCategory, setSelCategory] = useState("All");
    const [selTech, setSelTech] = useState("All");
    const [showFilters, setShowFilters] = useState(true);

    // ── Table sort ──
    const [sortCol, setSortCol] = useState("createdAt");
    const [sortDir, setSortDir] = useState("desc");

    // ── Firestore live stream ──
    useEffect(() => {
        const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setTickets(snap.docs.map((d) => ({ _docId: d.id, ...d.data() })));
            setLoading(false);
        });
        return unsub;
    }, []);

    // ── Derived option lists ──
    const officeOptions = useMemo(() =>
        ["All", ...Array.from(new Set(tickets.map(t => t.office).filter(Boolean))).sort()],
        [tickets]);

    const categoryOptions = useMemo(() =>
        ["All", ...(ISSUE_CATEGORIES?.length
            ? ISSUE_CATEGORIES
            : Array.from(new Set(tickets.map(t => t.issueCategory).filter(Boolean))).sort())],
        [tickets]);

    const techOptions = useMemo(() =>
        ["All", ...Array.from(new Set([
            ...tickets.map(t => t.assignedTechnician),
            ...tickets.map(t => t.resolvedBy),
        ].filter(Boolean))).sort()],
        [tickets]);

    // ── Filtered data ──
    const filtered = useMemo(() => {
        return tickets.filter((t) => {
            const created = tsToDate(t.createdAt);
            if (dateFrom) { const from = new Date(dateFrom); if (!created || created < from) return false; }
            if (dateTo) { const to = new Date(dateTo); to.setHours(23, 59, 59, 999); if (!created || created > to) return false; }
            if (selStatus.length && !selStatus.includes(t.status)) return false;
            if (selUrgency.length && !selUrgency.includes(t.urgency)) return false;
            if (selOffice !== "All" && t.office !== selOffice) return false;
            if (selCategory !== "All" && t.issueCategory !== selCategory) return false;
            if (selTech !== "All" && t.assignedTechnician !== selTech && t.resolvedBy !== selTech) return false;
            return true;
        });
    }, [tickets, dateFrom, dateTo, selStatus, selUrgency, selOffice, selCategory, selTech]);

    // ── Sorted data ──
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            let av, bv;
            if (sortCol === "createdAt" || sortCol === "resolvedDate") {
                av = tsToDate(a[sortCol])?.getTime() ?? 0;
                bv = tsToDate(b[sortCol])?.getTime() ?? 0;
            } else {
                av = (a[sortCol] ?? "").toString().toLowerCase();
                bv = (b[sortCol] ?? "").toString().toLowerCase();
            }
            if (av < bv) return sortDir === "asc" ? -1 : 1;
            if (av > bv) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
    }, [filtered, sortCol, sortDir]);

    // ── Summary stats ──
    const stats = useMemo(() => {
        const total = filtered.length;
        const open = filtered.filter(t => t.status === "Open").length;
        const inProg = filtered.filter(t => t.status === "In Progress").length;
        const resolved = filtered.filter(t => t.status === "Resolved" || t.status === "Closed").length;
        const high = filtered.filter(t => t.urgency === "High").length;
        const resRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

        const byOffice = Object.entries(
            filtered.reduce((acc, t) => { acc[t.office || "Other"] = (acc[t.office || "Other"] || 0) + 1; return acc; }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const byCategory = Object.entries(
            filtered.reduce((acc, t) => { acc[t.issueCategory || "Other"] = (acc[t.issueCategory || "Other"] || 0) + 1; return acc; }, {})
        ).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const byStatus = STATUS_OPTIONS.map(s => ({ label: s, value: filtered.filter(t => t.status === s).length }));
        const byUrgency = URGENCY_OPTIONS.map(u => ({ label: u, value: filtered.filter(t => t.urgency === u).length }));

        return { total, open, inProg, resolved, high, resRate, byOffice, byCategory, byStatus, byUrgency };
    }, [filtered]);

    // ── Sort handler ──
    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortCol(col); setSortDir("asc"); }
    };

    // ── Toggle multi-select filter ──
    const toggleMulti = (setter, val) =>
        setter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

    // ── Active filter count ──
    const activeFilterCount = [
        dateFrom, dateTo,
        ...selStatus, ...selUrgency,
        selOffice !== "All" ? selOffice : null,
        selCategory !== "All" ? selCategory : null,
        selTech !== "All" ? selTech : null,
    ].filter(Boolean).length;

    const clearAll = () => {
        setDateFrom(""); setDateTo("");
        setSelStatus([]); setSelUrgency([]);
        setSelOffice("All"); setSelCategory("All"); setSelTech("All");
    };

    // ── Export helpers ──
    const buildExportRows = () =>
        sorted.map((t) => ({
            "Ticket ID": t.ticketId || "",
            "First Name": t.firstName || "",
            "Last Name": t.lastName || "",
            "Office": t.office || "",
            "Department": t.department || "",
            "Location": t.location || "",
            "Issue Category": t.issueCategory || "",
            "Description": t.description || "",
            "Urgency": t.urgency || "",
            "Status": t.status || "",
            "Device": t.deviceName || "",
            "Assigned Technician": t.assignedTechnician || "",
            "Resolved By": t.resolvedBy || "",
            "Resolution Summary": t.resolutionSummary || "",
            "Action Taken": t.actionTaken || "",
            "Contact": t.contactNumber || "",
            "Email": t.email || "",
            "Date Submitted": formatDate(t.createdAt),
            "Date Resolved": formatDate(t.resolvedDate),
        }));

    const handleExportAnalytics = () => {
        if (sorted.length === 0) return;
        exportAnalyticsPDF(sorted, HEADER_IMAGE_B64);
    };

    const exportExcel = () => {
        const rows = buildExportRows();
        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = Object.keys(rows[0] || {}).map((k) => ({
            wch: Math.max(k.length, ...rows.map(r => String(r[k] || "").length), 10),
        }));
        ws["!cols"] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tickets");
        XLSX.writeFile(wb, `DA-MIMAROPA-IT-Tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const exportCSV = () => {
        const rows = buildExportRows();
        const ws = XLSX.utils.json_to_sheet(rows);
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `DA-MIMAROPA-IT-Tickets-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const handleExportPDF = async () => {
        if (sorted.length === 0) return;
        setPdfLoading(true);
        // Defer to next tick so UI updates before heavy PDF work
        setTimeout(() => {
            try {
                exportPDF(sorted);
            } finally {
                setPdfLoading(false);
            }
        }, 50);
    };

    // ─── Table columns ──────────────────────────────────────────────────────────
    const COLS = [
        { key: "ticketId", label: "Ticket ID" },
        { key: "firstName", label: "Name" },
        { key: "office", label: "Office" },
        { key: "issueCategory", label: "Category" },
        { key: "urgency", label: "Urgency" },
        { key: "status", label: "Status" },
        { key: "assignedTechnician", label: "Technician" },
        { key: "resolvedBy", label: "Resolved By" },
        { key: "createdAt", label: "Submitted" },
        { key: "resolvedDate", label: "Resolved" },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
                Loading data…
            </div>
        );
    }

    const officeMax = stats.byOffice[0]?.[1] || 1;
    const catMax = stats.byCategory[0]?.[1] || 1;
    const statusMax = Math.max(...stats.byStatus.map(s => s.value), 1);
    const urgencyMax = Math.max(...stats.byUrgency.map(u => u.value), 1);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">

            {/* ── Page header ── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
                    <p className="text-sm text-gray-400 mt-0.5">
                        Filter, analyse, and export IT ticket data
                    </p>
                </div>

                {/* Export buttons */}
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={exportCSV}
                        disabled={sorted.length === 0}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        Export CSV
                    </button>
                    <button
                        onClick={exportExcel}
                        disabled={sorted.length === 0}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                        <FileDown className="w-3.5 h-3.5" />
                        Export Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={sorted.length === 0 || pdfLoading}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                        <FilePlus className="w-3.5 h-3.5" />
                        {pdfLoading ? "Generating…" : "Export PDF Forms"}
                    </button>
                    <button
                        onClick={handleExportAnalytics}
                        disabled={sorted.length === 0}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                        <BarChart2 className="w-3.5 h-3.5" />
                        Export Analytics PDF
                    </button>
                </div>
            </div>

            {/* ── Filter panel ── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <button
                    onClick={() => setShowFilters(v => !v)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition"
                >
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {activeFilterCount}
                            </span>
                        )}
                    </div>
                    {showFilters
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {showFilters && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date from</label>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Date to</label>
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Office</label>
                                <select value={selOffice} onChange={e => setSelOffice(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white">
                                    {officeOptions.map(o => <option key={o} value={o}>{o === "All" ? "All offices" : o}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Category</label>
                                <select value={selCategory} onChange={e => setSelCategory(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white">
                                    {categoryOptions.map(o => <option key={o} value={o}>{o === "All" ? "All categories" : o}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {STATUS_OPTIONS.map(s => (
                                        <button key={s} type="button" onClick={() => toggleMulti(setSelStatus, s)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selStatus.includes(s) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Urgency</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {URGENCY_OPTIONS.map(u => (
                                        <button key={u} type="button" onClick={() => toggleMulti(setSelUrgency, u)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selUrgency.includes(u) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                                            {u}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Technician / Resolved by</label>
                                <select value={selTech} onChange={e => setSelTech(e.target.value)}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white">
                                    {techOptions.map(o => <option key={o} value={o}>{o === "All" ? "All personnel" : o}</option>)}
                                </select>
                            </div>
                        </div>

                        {activeFilterCount > 0 && (
                            <div className="flex items-center gap-2 flex-wrap pt-1">
                                {dateFrom && <Pill label={`From: ${dateFrom}`} onRemove={() => setDateFrom("")} />}
                                {dateTo && <Pill label={`To: ${dateTo}`} onRemove={() => setDateTo("")} />}
                                {selStatus.map(s => <Pill key={s} label={s} onRemove={() => toggleMulti(setSelStatus, s)} />)}
                                {selUrgency.map(u => <Pill key={u} label={u} onRemove={() => toggleMulti(setSelUrgency, u)} />)}
                                {selOffice !== "All" && <Pill label={selOffice} onRemove={() => setSelOffice("All")} />}
                                {selCategory !== "All" && <Pill label={selCategory} onRemove={() => setSelCategory("All")} />}
                                {selTech !== "All" && <Pill label={selTech} onRemove={() => setSelTech("All")} />}
                                <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 font-medium transition ml-1">Clear all</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Summary stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard icon={Ticket} label="Total tickets" value={stats.total} iconBg="#f0fdf4" iconColor="#15803d" />
                <StatCard icon={Clock} label="Open" value={stats.open} iconBg="#eff6ff" iconColor="#1d4ed8" sub={`${stats.inProg} in progress`} />
                <StatCard icon={CheckCircle} label="Resolved / Closed" value={stats.resolved} iconBg="#f0fdf4" iconColor="#15803d" />
                <StatCard icon={AlertTriangle} label="High urgency" value={stats.high} iconBg="#fef2f2" iconColor="#dc2626" />
                <StatCard icon={TrendingUp} label="Resolution rate" value={`${stats.resRate}%`} iconBg="#faf5ff" iconColor="#7c3aed" />
            </div>

            {/* ── Charts row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-gray-400" /> By status
                    </p>
                    <div className="space-y-2.5">
                        {stats.byStatus.map(({ label, value }) => (
                            <MiniBar key={label} label={label} value={value} max={statusMax}
                                color={label === "Open" ? "#3b82f6" : label === "In Progress" ? "#f59e0b" : label === "Resolved" ? "#16a34a" : "#94a3b8"} />
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-gray-400" /> By urgency
                    </p>
                    <div className="space-y-2.5">
                        {stats.byUrgency.map(({ label, value }) => (
                            <MiniBar key={label} label={label} value={value} max={urgencyMax}
                                color={label === "High" ? "#dc2626" : label === "Medium" ? "#f59e0b" : "#16a34a"} />
                        ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-gray-400" /> Top offices
                    </p>
                    <div className="space-y-2.5">
                        {stats.byOffice.length === 0
                            ? <p className="text-xs text-gray-400">No data</p>
                            : stats.byOffice.map(([name, count]) => (
                                <MiniBar key={name} label={name} value={count} max={officeMax} color="#6366f1" />
                            ))}
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
                        <BarChart2 className="w-3.5 h-3.5 text-gray-400" /> Top categories
                    </p>
                    <div className="space-y-2.5">
                        {stats.byCategory.length === 0
                            ? <p className="text-xs text-gray-400">No data</p>
                            : stats.byCategory.map(([name, count]) => (
                                <MiniBar key={name} label={name} value={count} max={catMax} color="#0ea5e9" />
                            ))}
                    </div>
                </div>
            </div>
            {/* ── Device Trouble Analytics ── */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-gray-700">Device & Category Trouble Report</h2>
                    <span className="text-xs text-gray-400">— procurement intelligence</span>
                </div>
                <DeviceTroubleReport tickets={filtered} />
            </div>

            {/* ── Data table ── */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-700">
                        Ticket records
                        <span className="ml-2 text-xs font-normal text-gray-400">
                            {sorted.length} {sorted.length === 1 ? "result" : "results"}
                        </span>
                    </p>
                    <p className="text-xs text-gray-400">Click a column header to sort</p>
                </div>

                {sorted.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-sm text-gray-400 font-medium">No tickets match the selected filters</p>
                        <button onClick={clearAll} className="mt-2 text-xs text-emerald-700 hover:underline">Clear filters</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    {COLS.map(({ key, label }) => (
                                        <th key={key} onClick={() => handleSort(key)}
                                            className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-gray-600 select-none">
                                            <span className="flex items-center gap-1">
                                                {label}
                                                <SortIcon col={key} sortCol={sortCol} sortDir={sortDir} />
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sorted.map((t) => (
                                    <tr key={t._docId} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="px-4 py-3 text-[11px] font-mono text-gray-500 whitespace-nowrap">{t.ticketId || "—"}</td>
                                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{t.firstName} {t.lastName}</td>
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.office || "—"}</td>
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.issueCategory || "—"}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${URGENCY_BADGE[t.urgency] || "bg-gray-100 text-gray-500"}`}>{t.urgency}</span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_BADGE[t.status] || "bg-gray-100 text-gray-500"}`}>{t.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{t.assignedTechnician || "—"}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {t.resolvedBy
                                                ? <span className="flex items-center gap-1 text-emerald-700"><UserCheck className="w-3 h-3" />{t.resolvedBy}</span>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(t.createdAt)}</td>
                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(t.resolvedDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {sorted.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                        <p className="text-xs text-gray-400">
                            Showing all <span className="font-medium text-gray-600">{sorted.length}</span> filtered records
                        </p>
                        <div className="flex gap-2">
                            <button onClick={exportCSV}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                                <FileText className="w-3 h-3" /> CSV
                            </button>
                            <button onClick={exportExcel}
                                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                                <FileDown className="w-3 h-3" /> Excel
                            </button>
                            <button onClick={handleExportPDF} disabled={pdfLoading}
                                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                                <FilePlus className="w-3 h-3" /> {pdfLoading ? "Generating…" : "PDF Forms"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}