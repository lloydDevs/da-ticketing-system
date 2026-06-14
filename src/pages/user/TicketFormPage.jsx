import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ISSUE_CATEGORIES } from "../../data/offices";
import { Monitor, ArrowLeft, AlertCircle } from "lucide-react";

const URGENCY_OPTIONS = [
  { value: "Low", desc: "Non-urgent, can wait", color: "emerald" },
  { value: "Medium", desc: "Affecting productivity", color: "yellow" },
  { value: "High", desc: "Critical, work stopped", color: "red" },
];

export default function TicketFormPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const office = state?.office;

  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    location: "",
    department: office?.label || "",
    issueCategory: "",
    description: "",
    urgency: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!office) {
    navigate("/");
    return null;
  }

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const required = ["lastName", "firstName", "location", "issueCategory", "description", "urgency"];
    for (const field of required) {
      if (!form[field].trim()) {
        setError("Please fill in all required fields.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, "tickets"), {
        ...form,
        officeCode: office.value,
        status: "Open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        resolvedNote: "",
        resolvedAt: null,
      });
      navigate("/success", { state: { ticketId: docRef.id, office } });
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
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-emerald-300 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 text-gold-400">
          <Monitor className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-widest uppercase">DA-MIMAROPA IT Support</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Office badge */}
        <div className="mb-5 inline-flex items-center gap-2 bg-emerald-800/60 border border-emerald-700 rounded-full px-4 py-1.5">
          <div className="w-2 h-2 rounded-full bg-gold-400" />
          <span className="text-emerald-200 text-sm font-medium">{office.label}</span>
        </div>

        <h1 className="text-3xl font-extrabold text-white mb-1">Submit a Support Ticket</h1>
        <p className="text-emerald-300 mb-8 text-sm">Fill in the details below and MIS will attend to your concern.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Last Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Dela Cruz"
                value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">First Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Juan"
                value={form.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="form-label">Location / Room / Building <span className="text-red-500">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 2nd Floor, Main Building"
              value={form.location}
              onChange={(e) => handleChange("location", e.target.value)}
            />
          </div>

          {/* Department (auto-filled) */}
          <div>
            <label className="form-label">Office / Department</label>
            <input
              type="text"
              className="form-input bg-emerald-50 text-emerald-800 font-medium"
              value={office.label}
              readOnly
            />
          </div>

          {/* Issue Category */}
          <div>
            <label className="form-label">Issue Category / Subject <span className="text-red-500">*</span></label>
            <div className="relative">
              <select
                className="form-select pr-10"
                value={form.issueCategory}
                onChange={(e) => handleChange("issueCategory", e.target.value)}
              >
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

          {/* Description */}
          <div>
            <label className="form-label">Description / Problem Details <span className="text-red-500">*</span></label>
            <textarea
              className="form-input resize-none"
              rows={4}
              placeholder="Describe the issue in detail — what happened, when it started, what you were doing..."
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="form-label">Urgency Level <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-3">
              {URGENCY_OPTIONS.map((opt) => {
                const isSelected = form.urgency === opt.value;
                const colorMap = {
                  emerald: {
                    selected: "border-emerald-500 bg-emerald-50",
                    dot: "bg-emerald-500",
                    text: "text-emerald-800",
                  },
                  yellow: {
                    selected: "border-yellow-500 bg-yellow-50",
                    dot: "bg-yellow-500",
                    text: "text-yellow-800",
                  },
                  red: {
                    selected: "border-red-500 bg-red-50",
                    dot: "bg-red-500",
                    text: "text-red-800",
                  },
                };
                const c = colorMap[opt.color];
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChange("urgency", opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 transition-all cursor-pointer ${
                      isSelected ? c.selected + " shadow-sm" : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${c.dot}`} />
                    <span className={`font-bold text-sm ${isSelected ? c.text : "text-gray-700"}`}>{opt.value}</span>
                    <span className="text-xs text-gray-400 text-center leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-3.5 text-base rounded-xl"
          >
            {submitting ? "Submitting…" : "Submit Ticket"}
          </button>
        </form>

        <p className="text-center text-xs text-emerald-600 mt-6">
          Doc. No.: DAMIMAROPA-F079-2023 · Rev. No.: 0 · Issued: 10/23/23
        </p>
      </div>
    </div>
  );
}
