import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Ticket, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { seedFakeTickets } from "../../utils/seedFakeTickets";
const URGENCY_COLORS = { Low: "#16a34a", Medium: "#f59e0b", High: "#dc2626" };
const STATUS_COLORS = {
  Open: "#3b82f6",
  "In Progress": "#f59e0b",
  Resolved: "#16a34a",
  Closed: "#94a3b8",
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-4"
        style={{ background: iconBg }}
      >

        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="text-2xl font-semibold text-gray-900 leading-none mb-1">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-sm px-3 py-2 text-xs text-gray-700">
      <p className="font-medium mb-0.5">{label}</p>
      <p className="text-gray-500">{payload[0].value} tickets</p>
    </div>
  );
}

// ─── Horizontal bar (Power BI style) ─────────────────────────────────────────
function HBar({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-right text-xs text-gray-500 shrink-0 truncate">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-sm h-2 overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-6 text-xs text-gray-500 shrink-0">{value}</div>
    </div>
  );
}

// ─── Recent table urgency & status badges ────────────────────────────────────
const urgencyBadge = {
  High: "bg-red-50 text-red-700",
  Medium: "bg-amber-50 text-amber-700",
  Low: "bg-emerald-50 text-emerald-700",
};
const statusBadge = {
  Open: "bg-blue-50 text-blue-700",
  "In Progress": "bg-amber-50 text-amber-700",
  Resolved: "bg-emerald-50 text-emerald-700",
  Closed: "bg-gray-100 text-gray-500",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading dashboard…
      </div>
    );
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const total = tickets.length;
  const open = tickets.filter((t) => t.status === "Open").length;
  const inProgress = tickets.filter((t) => t.status === "In Progress").length;
  const resolved = tickets.filter(
    (t) => t.status === "Resolved" || t.status === "Closed"
  ).length;
  const highUrgency = tickets.filter((t) => t.urgency === "High").length;

  const urgencyData = ["Low", "Medium", "High"].map((u) => ({
    name: u,
    count: tickets.filter((t) => t.urgency === u).length,
  }));

  const statusData = Object.entries(
    tickets.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const officeData = Object.entries(
    tickets.reduce((acc, t) => {
      const key = t.office || "Other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const catData = Object.entries(
    tickets.reduce((acc, t) => {
      const key = t.issueCategory || "Other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentTickets = tickets.filter(
    (t) => t.createdAt?.seconds * 1000 > sevenDaysAgo
  );

  const officeMax = officeData[0]?.count || 1;
  const catMax = catData[0]?.count || 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Overview of all IT support tickets</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Last 7 days</div>
          <div className="text-sm font-semibold text-emerald-700 mt-0.5">
            {recentTickets.length} new
          </div>
          <button
            onClick={() => seedFakeTickets(100)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg"
          >
            Generate 100 Tickets
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Ticket}
          label="Total tickets"
          value={total}
          iconBg="#f0fdf4"
          iconColor="#15803d"
        />
        <StatCard
          icon={Clock}
          label="Open"
          value={open}
          sub={`${inProgress} in progress`}
          iconBg="#eff6ff"
          iconColor="#1d4ed8"
        />
        <StatCard
          icon={CheckCircle}
          label="Resolved / closed"
          value={resolved}
          iconBg="#f0fdf4"
          iconColor="#15803d"
        />
        <StatCard
          icon={AlertTriangle}
          label="High urgency"
          value={highUrgency}
          iconBg="#fef2f2"
          iconColor="#dc2626"
        />
      </div>

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Urgency bar chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Tickets by urgency</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={urgencyData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {urgencyData.map((entry) => (
                  <Cell key={entry.name} fill={URGENCY_COLORS[entry.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie chart */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Tickets by status</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
              >
                {statusData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name] || "#cbd5e1"}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: "#6b7280" }}
              />
              <Tooltip
                formatter={(val, name) => [val, name]}
                contentStyle={{
                  fontSize: 12,
                  border: "1px solid #f1f5f9",
                  borderRadius: 8,
                  boxShadow: "none",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts row 2 — horizontal bar charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* By office */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Top offices by ticket volume
          </h2>
          <div className="space-y-3">
            {officeData.map((d) => (
              <HBar
                key={d.name}
                label={d.name}
                value={d.count}
                max={officeMax}
                color="#6366f1"
              />
            ))}
          </div>
        </div>

        {/* By category */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Issues by category
          </h2>
          <div className="space-y-3">
            {catData.map((d) => (
              <HBar
                key={d.name}
                label={d.name}
                value={d.count}
                max={catMax}
                color="#0ea5e9"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent tickets table ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Recent tickets
          <span className="ml-2 text-xs font-normal text-gray-400">last 7 days</span>
        </h2>

        {recentTickets.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No tickets in the last 7 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Name", "Office", "Category", "Urgency", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2.5 pr-4 last:pr-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTickets.slice(0, 8).map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      {t.firstName} {t.lastName}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{t.officeCode}</td>
                    <td className="py-3 pr-4 text-gray-500">{t.issueCategory}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${urgencyBadge[t.urgency] || "bg-gray-100 text-gray-500"
                          }`}
                      >
                        {t.urgency}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge[t.status] || "bg-gray-100 text-gray-500"
                          }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}