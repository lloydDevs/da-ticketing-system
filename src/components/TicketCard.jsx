import { useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  MapPin, Calendar, Building2, Tag, Save, X,
  Monitor, UserCheck, Phone, Mail, Clock, ExternalLink,
} from "lucide-react";

// ─── Style maps ───────────────────────────────────────────────────────────────
const URGENCY_ACCENT = {
  High: "bg-red-500",
  Medium: "bg-amber-400",
  Low: "bg-emerald-500",
};
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
  Pending: "bg-violet-50 text-violet-700 border border-violet-100",
};
const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return "—";
  if (ts?.seconds)
    return new Date(ts.seconds * 1000).toLocaleDateString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
    });
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function Badge({ text, className }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}

function DetailField({ label, value, icon: Icon, truncate }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-gray-800 flex items-center gap-1.5 ${truncate ? "truncate" : ""}`}>
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
        {value}
      </p>
    </div>
  );
}

// ─── Ticket Detail Modal ───────────────────────────────────────────────────────
function TicketModal({ ticket, onClose }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const [resolutionSummary, setResolutionSummary] = useState(ticket.resolutionSummary || "");
  const [resolvedBy, setResolvedBy] = useState(ticket.resolvedBy || "");
  const [saving, setSaving] = useState(false);

  const docId = ticket._docId;
  const isResolved = status === "Resolved" || status === "Closed";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "tickets", docId), {
        status,
        resolutionSummary,
        resolvedBy,
        updatedAt: serverTimestamp(),
        ...(isResolved
          ? { resolvedDate: serverTimestamp() }
          : { resolvedDate: null }),
      });
      setEditing(false);
    } catch (err) {
      console.error("Update failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setStatus(ticket.status);
    setResolutionSummary(ticket.resolutionSummary || "");
    setResolvedBy(ticket.resolvedBy || "");
  };

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
      onClick={handleBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Modal header ── */}
        <div className={`h-1.5 w-full shrink-0 ${URGENCY_ACCENT[ticket.urgency] || "bg-gray-300"}`} />
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {ticket.ticketId || "—"}
              </span>
              <Badge
                text={ticket.urgency}
                className={URGENCY_BADGE[ticket.urgency] || "bg-gray-100 text-gray-500"}
              />
              <Badge
                text={status}
                className={STATUS_BADGE[status] || "bg-gray-100 text-gray-500"}
              />
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-tight">
              {ticket.firstName} {ticket.lastName}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* ── Info grid ── */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <DetailField label="Office" value={ticket.office} icon={Building2} />
            <DetailField label="Department" value={ticket.department} />
            <DetailField label="Category" value={ticket.issueCategory} icon={Tag} />
            <DetailField label="Location" value={ticket.location} icon={MapPin} />
            <DetailField label="Device" value={ticket.deviceName} icon={Monitor} />
            <DetailField label="Assigned technician" value={ticket.assignedTechnician} />
            <DetailField label="Contact" value={ticket.contactNumber} icon={Phone} />
            <DetailField label="Email" value={ticket.email} icon={Mail} truncate />
            <DetailField label="Date submitted" value={formatDate(ticket.createdAt)} icon={Calendar} />
            {ticket.resolvedDate && (
              <DetailField label="Date resolved" value={formatDate(ticket.resolvedDate)} icon={Clock} />
            )}
          </div>

          {/* ── Resolved by chip ── */}
          {ticket.resolvedBy && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Resolved by</p>
                <p className="text-sm font-medium text-emerald-800">{ticket.resolvedBy}</p>
              </div>
            </div>
          )}

          {/* ── Problem description ── */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Problem description
            </p>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              {ticket.description}
            </p>
          </div>

          {/* ── Resolution summary (read-only) ── */}
          {ticket.resolutionSummary && !editing && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1.5">
                Resolution summary
              </p>
              <p className="text-sm text-emerald-800 leading-relaxed">{ticket.resolutionSummary}</p>
            </div>
          )}

          {/* ── Action taken (read-only) ── */}
          {ticket.actionTaken && !editing && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">
                Action taken
              </p>
              <p className="text-sm text-blue-800 leading-relaxed">{ticket.actionTaken}</p>
            </div>
          )}

          {/* ── Edit / update form ── */}
          {editing ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Update ticket</p>

              {/* Status picker */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                  Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${status === s
                          ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolved by — only when Resolved or Closed */}
              {isResolved && (
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                    Resolved by <span className="text-emerald-500 normal-case font-normal">(required)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white"
                    placeholder="Name of personnel who resolved the ticket"
                    value={resolvedBy}
                    onChange={(e) => setResolvedBy(e.target.value)}
                  />
                </div>
              )}

              {/* Resolution summary */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                  Resolution summary
                </label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 resize-none bg-white"
                  rows={4}
                  placeholder="Describe what was done to resolve this ticket…"
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                />
              </div>

              {/* Form actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 text-gray-600 hover:text-gray-800 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Modal footer ── */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/60">
          <p className="text-[11px] text-gray-400">
            {ticket.createdAt ? `Submitted ${formatDate(ticket.createdAt)}` : ""}
          </p>
          <div className="flex gap-2">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-lg transition"
              >
                Update ticket
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:border-gray-300 px-4 py-2 rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TicketCard (compact — no inline expand) ──────────────────────────────────
export default function TicketCard({ ticket }) {
  const [showModal, setShowModal] = useState(false);

  const isResolved = ticket.status === "Resolved" || ticket.status === "Closed";

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all flex flex-col cursor-default">

        {/* Urgency accent bar */}
        <div className={`h-1 w-full shrink-0 ${URGENCY_ACCENT[ticket.urgency] || "bg-gray-300"}`} />

        {/* Card body */}
        <div className="flex flex-col flex-1 p-4 gap-3">

          {/* Top row: ticket ID + badges */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              {ticket.ticketId || "—"}
            </span>
            <div className="flex gap-1.5 flex-wrap justify-end">
              <Badge
                text={ticket.urgency}
                className={URGENCY_BADGE[ticket.urgency] || "bg-gray-100 text-gray-500"}
              />
              <Badge
                text={ticket.status}
                className={STATUS_BADGE[ticket.status] || "bg-gray-100 text-gray-500"}
              />
            </div>
          </div>

          {/* Name */}
          <p className="text-sm font-semibold text-gray-900 leading-tight">
            {ticket.firstName} {ticket.lastName}
          </p>

          {/* Description */}
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 flex-1">
            {ticket.description}
          </p>

          {/* Resolved by chip — visible on card when set */}
          {isResolved && ticket.resolvedBy && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
              <UserCheck className="w-3 h-3 shrink-0" />
              <span className="font-medium truncate">{ticket.resolvedBy}</span>
            </div>
          )}

          {/* Meta footer */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-3 border-t border-gray-100">
            {ticket.office && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Building2 className="w-3 h-3" />
                {ticket.office}
              </span>
            )}
            {ticket.issueCategory && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Tag className="w-3 h-3" />
                {ticket.issueCategory}
              </span>
            )}
            {ticket.createdAt && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Calendar className="w-3 h-3" />
                {formatDate(ticket.createdAt)}
              </span>
            )}
            {ticket.location && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <MapPin className="w-3 h-3" />
                {ticket.location}
              </span>
            )}
          </div>

          {/* View details button */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg py-1.5 transition mt-1"
          >
            <ExternalLink className="w-3 h-3" />
            View details
          </button>
        </div>
      </div>

      {/* Detail modal — rendered outside the card via portal-like pattern */}
      {showModal && (
        <TicketModal ticket={ticket} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}