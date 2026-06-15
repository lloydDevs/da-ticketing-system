import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, query, orderBy, writeBatch, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import TicketCard, { TicketRow } from "../../components/TicketCard";
import {
  Search, SlidersHorizontal, ChevronLeft, ChevronRight,
  Upload, X, AlertCircle, CheckCircle2, Loader2,
  LayoutGrid, List,
} from "lucide-react";
import { OFFICES, ISSUE_CATEGORIES } from "../../data/offices";
import * as XLSX from "xlsx";

// ─── Constants ────────────────────────────────────────────────────────────────
const URGENCY_TABS = ["All", "High", "Medium", "Low"];
const PAGE_SIZE_OPTIONS = [8, 12, 20, 32];

const urgencyCountStyle = {
  High: "bg-red-50 text-red-600",
  Medium: "bg-amber-50 text-amber-600",
  Low: "bg-emerald-50 text-emerald-600",
};

// ─── Excel column → Firestore field mapping ───────────────────────────────────
const COLUMN_MAP = {
  "ticket id": "ticketId",
  "ticketid": "ticketId",
  "ticket_id": "ticketId",
  "first name": "firstName",
  "firstname": "firstName",
  "last name": "lastName",
  "lastname": "lastName",
  "name": "_fullName",
  "full name": "_fullName",
  "email": "email",
  "contact": "contactNumber",
  "contact number": "contactNumber",
  "phone": "contactNumber",
  "office": "office",
  "department": "department",
  "location": "location",
  "category": "issueCategory",
  "issue category": "issueCategory",
  "issuecategory": "issueCategory",
  "description": "description",
  "problem": "description",
  "problem description": "description",
  "urgency": "urgency",
  "priority": "urgency",
  "status": "status",
  "technician": "assignedTechnician",
  "assigned technician": "assignedTechnician",
  "assignedtechnician": "assignedTechnician",
  "device": "deviceName",
  "device name": "deviceName",
  "devicename": "deviceName",
  "resolved by": "resolvedBy",
  "resolvedby": "resolvedBy",
  "resolution summary": "resolutionSummary",
  "resolution": "resolutionSummary",
  "action taken": "actionTaken",
  "date": "createdAt",
  "created at": "createdAt",
  "createdat": "createdAt",
  "date created": "createdAt",
  "resolved date": "resolvedDate",
  "resolveddate": "resolvedDate",
  "date resolved": "resolvedDate",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normaliseUrgency(raw) {
  if (!raw) return "Low";
  const v = String(raw).trim().toLowerCase();
  if (v === "high" || v === "h" || v === "3") return "High";
  if (v === "medium" || v === "med" || v === "m" || v === "2") return "Medium";
  return "Low";
}

function normaliseStatus(raw) {
  if (!raw) return "Open";
  const v = String(raw).trim().toLowerCase();
  if (v.includes("progress")) return "In Progress";
  if (v.includes("resolv")) return "Resolved";
  if (v.includes("clos")) return "Closed";
  return "Open";
}

function parseExcelDate(raw) {
  if (!raw) return null;
  if (typeof raw === "number") {
    return XLSX.SSF.parse_date_code(raw)
      ? new Date(Date.UTC(1899, 11, 30) + raw * 86400000)
      : null;
  }
  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function rowToTicket(mapped) {
  const ticket = { ...mapped };

  if (ticket._fullName) {
    const parts = String(ticket._fullName).trim().split(/\s+/);
    ticket.firstName = parts[0] || "";
    ticket.lastName = parts.slice(1).join(" ") || "";
    delete ticket._fullName;
  }

  if (ticket.urgency) ticket.urgency = normaliseUrgency(ticket.urgency);
  if (ticket.status) ticket.status = normaliseStatus(ticket.status);

  const createdDate = parseExcelDate(ticket.createdAt);
  ticket.createdAt = createdDate || new Date();

  if (ticket.resolvedDate) {
    const rd = parseExcelDate(ticket.resolvedDate);
    ticket.resolvedDate = rd || null;
  }

  if (!ticket.status) ticket.status = "Open";
  if (!ticket.urgency) ticket.urgency = "Low";

  ticket.importedAt = new Date();
  return ticket;
}

// ─── ImportModal ──────────────────────────────────────────────────────────────
function ImportModal({ onClose }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("idle");
  const [importCount, setImportCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (raw.length < 2) {
          setErrorMsg("The spreadsheet appears to be empty.");
          setStep("error");
          return;
        }

        const excelHeaders = raw[0].map((h) => String(h).trim());
        setHeaders(excelHeaders);

        const mapped = raw.slice(1).filter((r) => r.some(Boolean)).map((r) => {
          const obj = {};
          excelHeaders.forEach((h, i) => {
            const key = COLUMN_MAP[h.toLowerCase()];
            if (key) obj[key] = r[i] !== undefined ? r[i] : "";
          });
          return obj;
        });

        setRows(mapped.slice(0, 5));
        setStep("preview");
      } catch (err) {
        setErrorMsg("Could not parse the file. Make sure it is a valid .xlsx or .xls file.");
        setStep("error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    setStep("importing");
    try {
      const input = fileRef.current?.files[0];
      if (!input) throw new Error("No file selected");

      const buffer = await input.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const excelHeaders = raw[0].map((h) => String(h).trim());

      const allMapped = raw.slice(1).filter((r) => r.some(Boolean)).map((r) => {
        const obj = {};
        excelHeaders.forEach((h, i) => {
          const key = COLUMN_MAP[h.toLowerCase()];
          if (key) obj[key] = r[i] !== undefined ? r[i] : "";
        });
        return rowToTicket(obj);
      });

      const BATCH_SIZE = 400;
      for (let i = 0; i < allMapped.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        allMapped.slice(i, i + BATCH_SIZE).forEach((ticket) => {
          batch.set(doc(collection(db, "tickets")), ticket);
        });
        await batch.commit();
      }

      setImportCount(allMapped.length);
      setStep("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Import failed. Please try again.");
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Import tickets from Excel</h2>
            <p className="text-xs text-gray-400 mt-0.5">Supports .xlsx and .xls files</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Drop zone */}
          {(step === "idle" || step === "preview") && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
            >
              <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              {fileName ? (
                <p className="text-xs font-medium text-emerald-700">{fileName}</p>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-600">Drop your Excel file here</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">or click to browse</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Column hint */}
          {step === "idle" && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <p className="text-[11px] font-medium text-gray-500 mb-1.5">Expected column headers</p>
              <div className="flex flex-wrap gap-1">
                {["Ticket ID", "First Name", "Last Name", "Office", "Department", "Category",
                  "Description", "Urgency", "Status", "Technician", "Resolved By",
                  "Resolution Summary", "Device Name", "Date Created", "Date Resolved"].map((h) => (
                    <span key={h} className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500">
                      {h}
                    </span>
                  ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Column names are case-insensitive. Unrecognised columns are ignored.
              </p>
            </div>
          )}

          {/* Preview table */}
          {step === "preview" && rows.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-2">
                Preview — first {rows.length} rows
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Name", "Office", "Category", "Urgency", "Status", "Resolved By"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const name = r._fullName
                        ? r._fullName
                        : `${r.firstName || ""} ${r.lastName || ""}`.trim();
                      return (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{name || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.office || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.issueCategory || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.urgency || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.status || "—"}</td>
                          <td className="px-3 py-2 text-gray-500">{r.resolvedBy || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
              <p className="text-sm text-gray-600">Importing tickets…</p>
              <p className="text-xs text-gray-400">Please don't close this window</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-semibold text-gray-800">Import complete</p>
              <p className="text-xs text-gray-500">
                {importCount} ticket{importCount !== 1 ? "s" : ""} successfully imported.
              </p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          {step === "done" || step === "error" ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={step !== "preview" || rows.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Upload className="w-3.5 h-3.5" />
                Import all records
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (
      (i === currentPage - 2 && currentPage - 2 > 1) ||
      (i === currentPage + 2 && currentPage + 2 < totalPages)
    ) {
      pages.push("…");
    }
  }
  const deduped = pages.filter((p, i) => !(p === "…" && pages[i - 1] === "…"));

  return (
    <div className="flex items-center justify-center gap-1 pt-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {deduped.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-medium border transition-all ${p === currentPage
                ? "bg-emerald-700 text-white border-emerald-700"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
              }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        aria-label="Next page"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── AdminTickets ─────────────────────────────────────────────────────────────
export default function AdminTickets() {
  // ── State — ALL hooks must be at the top of the component ──
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterOffice, setFilterOffice] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewMode] = useState(
    localStorage.getItem("ticketsViewMode") || "grid"
  );

  const handleViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("ticketsViewMode", mode);
  };

  // ── Effects ──
  useEffect(() => {
    const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ _docId: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search, filterStatus, filterCategory, filterOffice, pageSize]);

  // ── Derived data ──
  const filtered = tickets.filter((t) => {
    const matchTab = activeTab === "All" || t.urgency === activeTab;
    const matchStatus = filterStatus === "All" || t.status === filterStatus;
    const matchCategory = filterCategory === "All" || t.issueCategory === filterCategory;
    const matchOffice = filterOffice === "All" || t.office === filterOffice;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      `${t.firstName ?? ""} ${t.lastName ?? ""}`.toLowerCase().includes(q) ||
      (t.ticketId ?? "").toLowerCase().includes(q) ||
      (t.office ?? "").toLowerCase().includes(q) ||
      (t.officeLabel ?? "").toLowerCase().includes(q) ||
      (t.issueCategory ?? "").toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q) ||
      (t.department ?? "").toLowerCase().includes(q) ||
      (t.location ?? "").toLowerCase().includes(q) ||
      (t.assignedTechnician ?? "").toLowerCase().includes(q) ||
      (t.resolvedBy ?? "").toLowerCase().includes(q) ||
      (t.deviceName ?? "").toLowerCase().includes(q) ||
      (t.email ?? "").toLowerCase().includes(q);

    return matchTab && matchStatus && matchCategory && matchOffice && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const countByUrgency = (u) =>
    tickets.filter((t) => u === "All" || t.urgency === u).length;

  const officeOptions = ["All", ...Array.from(new Set(tickets.map((t) => t.office).filter(Boolean))).sort()];
  const categoryOptions = ["All", ...(ISSUE_CATEGORIES?.length
    ? ISSUE_CATEGORIES
    : Array.from(new Set(tickets.map((t) => t.issueCategory).filter(Boolean))).sort())];

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded-lg" />
          <div className="h-10 w-32 bg-gray-200 rounded-lg" />
        </div>
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 w-24 bg-gray-200 rounded-full" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between mb-4">
                <div className="h-5 w-32 bg-gray-200 rounded" />
                <div className="h-6 w-20 bg-gray-200 rounded-full" />
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-4 w-1/2 bg-gray-200 rounded" />
              </div>
              <div className="flex justify-between mt-6">
                <div className="h-8 w-20 bg-gray-200 rounded-lg" />
                <div className="h-8 w-20 bg-gray-200 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">All tickets</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tickets.length} total tickets in the system
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => handleViewMode("grid")}
              title="Grid view"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition ${viewMode === "grid"
                  ? "bg-emerald-700 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="text-xs font-medium hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => handleViewMode("list")}
              title="List view"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-l border-gray-200 transition ${viewMode === "list"
                  ? "bg-emerald-700 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="text-xs font-medium hidden sm:inline">List</span>
            </button>
          </div>

          {/* Import button */}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-800 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Excel
          </button>
        </div>
      </div>

      {/* ── Search + filter toggle ── */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, ticket ID, office, resolved by…"
            className="bg-transparent text-sm text-gray-800 outline-none w-full placeholder-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-gray-300 hover:text-gray-500 shrink-0 transition-colors"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all shrink-0 ${showFilters
              ? "bg-emerald-700 text-white border-emerald-700"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {(filterStatus !== "All" || filterCategory !== "All" || filterOffice !== "All") && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 ml-0.5" />
          )}
        </button>
      </div>

      {/* ── Filter dropdowns ── */}
      {showFilters && (
        <div className="bg-white border border-gray-100 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              {["All", "Open", "In Progress", "Resolved", "Closed"].map((o) => (
                <option key={o} value={o}>{o === "All" ? "All statuses" : o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Category</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              {categoryOptions.map((o) => (
                <option key={o} value={o}>{o === "All" ? "All categories" : o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Office</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white"
              value={filterOffice}
              onChange={(e) => setFilterOffice(e.target.value)}
            >
              {officeOptions.map((o) => (
                <option key={o} value={o}>{o === "All" ? "All offices" : o}</option>
              ))}
            </select>
          </div>
          {(filterStatus !== "All" || filterCategory !== "All" || filterOffice !== "All") && (
            <div className="sm:col-span-3 flex justify-end">
              <button
                onClick={() => {
                  setFilterStatus("All");
                  setFilterCategory("All");
                  setFilterOffice("All");
                }}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Urgency tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {URGENCY_TABS.map((tab) => {
          const isActive = activeTab === tab;
          const count = countByUrgency(tab);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all ${isActive
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
            >
              {tab}
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${isActive
                    ? "bg-white/20 text-white"
                    : urgencyCountStyle[tab] || "bg-gray-100 text-gray-500"
                  }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Ticket grid / list ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <p className="text-gray-400 font-medium text-sm">No tickets found</p>
          <p className="text-gray-300 text-xs mt-1">Try adjusting your filters or search query.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.map((ticket) => (
            <TicketCard key={ticket._docId} ticket={ticket} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Ticket ID", "Name", "Office", "Category", "Urgency", "Status", "Resolved by", "Date", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((ticket) => (
                <TicketRow key={ticket._docId} ticket={ticket} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400">
              Showing{" "}
              <span className="font-medium text-gray-600">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)}
              </span>{" "}
              of{" "}
              <span className="font-medium text-gray-600">{filtered.length}</span> tickets
            </p>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} per page</option>
              ))}
            </select>
          </div>
          <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      )}

      {/* ── Import modal ── */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}