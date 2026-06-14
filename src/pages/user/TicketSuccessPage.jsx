import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, ArrowLeft, Copy } from "lucide-react";
import { useState } from "react";

export default function TicketSuccessPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const ticketId = state?.ticketId || "N/A";

  const handleCopy = () => {
    navigator.clipboard.writeText(ticketId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-emerald-900 mb-2">Ticket Submitted!</h1>
        <p className="text-gray-500 text-sm mb-8">
          Your IT support request has been received. MIS will attend to your concern shortly.
        </p>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-8">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-1">Ticket Reference ID</p>
          <div className="flex items-center justify-center gap-3">
            <code className="text-emerald-900 font-mono text-sm font-bold break-all">{ticketId}</code>
            <button
              onClick={handleCopy}
              className="text-emerald-500 hover:text-emerald-700 transition-colors"
              title="Copy ID"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          {copied && <p className="text-xs text-emerald-500 mt-1">Copied!</p>}
        </div>

        <div className="bg-gold-50 border border-gold-200 rounded-xl px-5 py-4 mb-8 text-left">
          <p className="text-gold-800 text-sm font-semibold mb-1">What happens next?</p>
          <ul className="text-gold-700 text-sm space-y-1 list-disc list-inside">
            <li>MIS team reviews your ticket</li>
            <li>A technician will be assigned to your concern</li>
            <li>You will be contacted for resolution</li>
          </ul>
        </div>

        <button
          onClick={() => navigate("/")}
          className="w-full btn-primary py-3 rounded-xl text-base"
        >
          <span className="flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Submit Another Ticket
          </span>
        </button>
      </div>
    </div>
  );
}
