import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ISSUE_CATEGORIES } from "../../data/offices";
import { Monitor, ArrowLeft, AlertCircle, Hash, Loader2 } from "lucide-react";

const URGENCY_OPTIONS = [
  { value: "Low", desc: "Non-urgent, can wait", color: "emerald" },
  { value: "Medium", desc: "Affecting productivity", color: "yellow" },
  { value: "High", desc: "Critical, work stopped", color: "red" },
];

const COLOR_MAP = {
  emerald: { selected: "border-emerald-500 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-800" },
  yellow: { selected: "border-yellow-500 bg-yellow-50", dot: "bg-yellow-500", text: "text-yellow-800" },
  red: { selected: "border-red-500 bg-red-50", dot: "bg-red-500", text: "text-red-800" },
};

async function generateTicketId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `RFTS-${year}-${month}-`;
  const q = query(
    collection(db, "tickets"),
    where("ticketId", ">=", prefix),
    where("ticketId", "<", prefix + "\uf8ff")
  );
  const snap = await getDocs(q);
  const next = String(snap.size + 1).padStart(3, "0");
  return `RFTS-${year}-${month}-${next}`;
}

function Label({ text, required }) {
  return (
    <label className="form-label">
      {text} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

function Input({ ...props }) {
  return <input className="form-input" {...props} />;
}

export default function TicketFormPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const office = state?.office;

  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    contactNumber: "",
    email: "",
    location: "",
    deviceName: "",
    issueCategory: "",
    description: "",
    urgency: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [loadingId, setLoadingId] = useState(true);

  useEffect(() => {
    generateTicketId()
      .then((id) => setPreviewId(id))
      .finally(() => setLoadingId(false));
  }, []);

  if (!office) {
    navigate("/");
    return null;
  }

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const required = ["lastName", "firstName", "location", "issueCategory", "description", "urgency"];
    for (const f of required) {
      if (!form[f].trim()) { setError("Please fill in all required fields."); return; }
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const ticketId = await generateTicketId();
      const docRef = await addDoc(collection(db, "tickets"), {
        ticketId,
        firstName: form.firstName,
        lastName: form.lastName,
        contactNumber: form.contactNumber,
        email: form.email,
        location: form.location,
        deviceName: form.deviceName,
        department: office.label,
        office: office.value,
        officeCode: office.value,
        issueCategory: form.issueCategory,
        description: form.description,
        urgency: form.urgency,
        status: "Open",
        resolvedBy: "",
        resolvedNote: "",
        resolutionSummary: "",
        resolvedAt: null,
        resolvedDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      navigate("/success", { state: { ticketId, docId: docRef.id, office } });
    } catch (err) {
      setError("Failed to submit ticket. Please try again.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 py-10 px-4">

      {/* Top bar */}
      <div className="max-w-2xl mx-auto mb-6 flex items-center gap-4">
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-emerald-300 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 text-yellow-400">
          <Monitor className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-widest uppercase">DA-MIMAROPA IT Support</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Office badge */}
        <div className="mb-5 inline-flex items-center gap-2 bg-emerald-800/60 border border-emerald-700 rounded-full px-4 py-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-emerald-200 text-sm font-medium">{office.label}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">Submit a Support Ticket</h1>
        <p className="text-emerald-300 mb-8 text-sm">Fill in the details below and MIS will attend to your concern.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-5 sm:p-8 space-y-6">

          {/* Ticket ID preview */}
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Hash className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest">Ticket Reference ID</p>
              {loadingId ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />
                  <span className="text-xs text-emerald-500">Generating…</span>
                </div>
              ) : (
                <p className="font-mono text-sm font-bold text-emerald-800 tracking-wider">{previewId}</p>
              )}
            </div>
            <p className="text-[10px] text-emerald-500 ml-auto text-right leading-tight hidden sm:block">
              Auto-generated<br />upon submit
            </p>
          </div>

          {/* ── Personal Info ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Personal Information</p>
            <div className="space-y-4">

              {/* Name row — stacks on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Last Name" required />
                  <Input placeholder="e.g. Dela Cruz" value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)} />
                </div>
                <div>
                  <Label text="First Name" required />
                  <Input placeholder="e.g. Juan" value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)} />
                </div>
              </div>

              {/* Contact + Email — stacks on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Contact Number" />
                  <Input type="tel" placeholder="e.g. 09XX-XXX-XXXX" value={form.contactNumber}
                    onChange={(e) => set("contactNumber", e.target.value)} />
                </div>
                <div>
                  <Label text="Email Address" />
                  <Input type="email" placeholder="e.g. juan@da.gov.ph" value={form.email}
                    onChange={(e) => set("email", e.target.value)} />
                </div>
              </div>

              {/* Location */}
              <div>
                <Label text="Location / Room / Building" required />
                <Input placeholder="e.g. 2nd Floor, Main Building" value={form.location}
                  onChange={(e) => set("location", e.target.value)} />
              </div>

              {/* Office (auto-filled) */}
              <div>
                <Label text="Office / Department" />
                <input className="form-input bg-emerald-50 text-emerald-800 font-medium cursor-not-allowed"
                  value={office.label} readOnly />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Issue Details ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Issue Details</p>
            <div className="space-y-4">

              {/* Device + Category — stacks on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Device Name / Asset Tag" />
                  <Input placeholder="e.g. DELL-PC-001" value={form.deviceName}
                    onChange={(e) => set("deviceName", e.target.value)} />
                </div>
                <div>
                  <Label text="Issue Category" required />
                  <div className="relative">
                    <select className="form-select pr-10" value={form.issueCategory}
                      onChange={(e) => set("issueCategory", e.target.value)}>
                      <option value="">— Select category —</option>
                      {ISSUE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <Label text="Description / Problem Details" required />
                <textarea className="form-input resize-none" rows={4}
                  placeholder="Describe the issue in detail — what happened, when it started, what you were doing..."
                  value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>

              {/* Urgency — always 3 cols but smaller on mobile */}
              <div>
                <Label text="Urgency Level" required />
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {URGENCY_OPTIONS.map((opt) => {
                    const isSelected = form.urgency === opt.value;
                    const c = COLOR_MAP[opt.color];
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => set("urgency", opt.value)}
                        className={`flex flex-col items-center gap-1 sm:gap-1.5 rounded-xl border-2 px-2 sm:px-3 py-2.5 sm:py-3 transition-all ${isSelected ? c.selected + " shadow-sm" : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                      >
                        <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${c.dot}`} />
                        <span className={`font-bold text-xs sm:text-sm ${isSelected ? c.text : "text-gray-700"}`}>
                          {opt.value}
                        </span>
                        <span className="text-[10px] sm:text-xs text-gray-400 text-center leading-tight hidden sm:block">
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <button type="submit" disabled={submitting || loadingId}
            className="w-full btn-primary py-3.5 text-base rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              : "Submit Ticket"
            }
          </button>
        </form>

        <p className="text-center text-xs text-emerald-600 mt-6">
          Doc. No.: DAMIMAROPA-F079-2023 · Rev. No.: 0 · Issued: 10/23/23
        </p>
      </div>
    </div>
  );
}