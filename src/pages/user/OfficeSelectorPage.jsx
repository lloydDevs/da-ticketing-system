import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { OFFICES } from "../../data/offices";
import { Monitor, Search, ChevronDown } from "lucide-react";

export default function OfficeSelectorPage() {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const filtered = OFFICES.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOffice = OFFICES.find((o) => o.value === selected);

  const handleProceed = () => {
    if (!selected) return;
    if (selected === "MIS") {
      navigate("/admin/login");
    } else {
      navigate("/submit", { state: { office: selectedOffice } });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 flex flex-col items-center justify-center px-4 py-12">

      {/* Header */}
      <div className="text-center mb-8 w-full max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gold-500 rounded-2xl mb-4 sm:mb-5 shadow-2xl shadow-gold-500/30">
          <Monitor className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-950" />
        </div>
        <div className="text-gold-400 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-2">
          Department of Agriculture · MIMAROPA
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white mb-2">
          IT Support Ticketing
        </h1>
        <p className="text-emerald-300 text-sm sm:text-base max-w-md mx-auto">
          Report technical issues to the Management Information Systems team. Select your office to get started.
        </p>
      </div>

      {/* Card — w-full with max-w prevents stretching */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-8">
        <h2 className="text-emerald-900 font-bold text-lg sm:text-xl mb-1">Which office are you from?</h2>
        <p className="text-gray-500 text-sm mb-6">Select your office or operating unit below.</p>

        {/* Dropdown wrapper — overflow-hidden prevents content from expanding card */}
        <div className="relative mb-6">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between border-2 border-emerald-200 rounded-xl px-4 py-3 text-left focus:outline-none focus:border-emerald-500 transition-colors bg-emerald-50 hover:bg-emerald-100 min-w-0"
          >
            {/* truncate keeps long office names from blowing out the button */}
            <span className={`truncate pr-2 text-sm ${selectedOffice ? "text-emerald-900 font-medium" : "text-gray-400"}`}>
              {selectedOffice ? selectedOffice.label : "— Select your office —"}
            </span>
            <ChevronDown className={`w-5 h-5 text-emerald-600 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            // w-full + left-0 anchors dropdown to button, not to content width
            <div className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-xl border border-emerald-100 shadow-2xl overflow-hidden">
              <div className="p-3 border-b border-emerald-100">
                <div className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-emerald-500 shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search office..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-transparent text-sm text-emerald-900 outline-none w-full placeholder-emerald-400 min-w-0"
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>
              <div className="max-h-56 sm:max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">No offices found</div>
                ) : (
                  filtered.map((office) => (
                    <button
                      key={office.value}
                      type="button"
                      onClick={() => {
                        setSelected(office.value);
                        setOpen(false);
                        setSearch("");
                      }}
                      // text-left + w-full, truncate prevents row from expanding
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-emerald-50 ${selected === office.value
                        ? "bg-emerald-100 text-emerald-900 font-semibold"
                        : "text-gray-700"
                        }`}
                    >
                      {/* Allow wrapping inside list so full name is readable */}
                      <span className="block leading-snug">{office.label}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* MIS notice */}
        {selected === "MIS" && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-gold-50 border border-gold-200 text-gold-800 text-sm">
            <span className="font-semibold">MIS selected:</span> You'll be redirected to the admin login.
          </div>
        )}

        <button
          onClick={handleProceed}
          disabled={!selected}
          className="w-full btn-primary text-base py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selected === "MIS" ? "Go to Admin Login →" : "Proceed to Submit Ticket →"}
        </button>

        <p className="text-center text-xs text-gray-400 mt-5">
          Doc. No.: DAMIMAROPA-F079-2023 · Rev. No.: 0 · Issued: 10/23/23
        </p>
      </div>
    </div>
  );
}