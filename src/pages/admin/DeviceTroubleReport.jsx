import { useMemo } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Package, Cpu } from "lucide-react";

// ─── Severity thresholds ──────────────────────────────────────────────────────
const HIGH_THRESHOLD = 0.5;  // top 50% of max = "Always in trouble"
const MEDIUM_THRESHOLD = 0.25; // 25–50%          = "Recurring issues"

function getRating(count, max) {
    const ratio = max > 0 ? count / max : 0;
    if (ratio >= HIGH_THRESHOLD) return { label: "Always in trouble", color: "red", icon: "🔴" };
    if (ratio >= MEDIUM_THRESHOLD) return { label: "Recurring issues", color: "amber", icon: "🟡" };
    return { label: "Occasional", color: "emerald", icon: "🟢" };
}

function ProcurementBadge({ rating }) {
    const styles = {
        red: "bg-red-50 text-red-700 border border-red-100",
        amber: "bg-amber-50 text-amber-700 border border-amber-100",
        emerald: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${styles[rating.color]}`}>
            {rating.icon} {rating.label}
        </span>
    );
}

function BarFill({ value, max, color }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    const colors = {
        red: "#ef4444",
        amber: "#f59e0b",
        emerald: "#10b981",
        indigo: "#6366f1",
    };
    return (
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: colors[color] || colors.indigo }}
            />
        </div>
    );
}

// ─── Single device/category row ───────────────────────────────────────────────
function TroubleRow({ rank, name, sub, count, max, urgencyBreakdown, recommendation }) {
    const rating = getRating(count, max);
    return (
        <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
            {/* Rank */}
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[11px] font-bold text-gray-400">{rank}</span>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
                    {sub && <span className="text-xs text-gray-400 truncate">{sub}</span>}
                    <ProcurementBadge rating={rating} />
                </div>

                {/* Bar */}
                <div className="flex items-center gap-3 mb-1.5">
                    <BarFill value={count} max={max} color={rating.color} />
                    <span className="text-xs font-semibold text-gray-700 shrink-0">{count} ticket{count !== 1 ? "s" : ""}</span>
                </div>

                {/* Urgency breakdown */}
                {urgencyBreakdown && (
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        <span className="text-red-500 font-medium">● High: {urgencyBreakdown.High || 0}</span>
                        <span className="text-amber-500 font-medium">● Med: {urgencyBreakdown.Medium || 0}</span>
                        <span className="text-emerald-500 font-medium">● Low: {urgencyBreakdown.Low || 0}</span>
                    </div>
                )}

                {/* Procurement insight */}
                {recommendation && (
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed italic">{recommendation}</p>
                )}
            </div>
        </div>
    );
}

// ─── Procurement insight generator ───────────────────────────────────────────
function getProcurementNote(name, count, total, highUrgency, rating) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    if (rating.color === "red") {
        if (highUrgency > count * 0.5)
            return `⚠️ ${pct}% of all tickets — majority are High urgency. Consider immediate replacement in next procurement cycle.`;
        return `⚠️ ${pct}% of all tickets. Frequent breakdowns suggest aging hardware. Prioritise for replacement.`;
    }
    if (rating.color === "amber") {
        return `📋 ${pct}% of all tickets. Monitor trend; if increasing, include in next procurement review.`;
    }
    return `✅ ${pct}% of all tickets. Performing well — no procurement action needed.`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeviceTroubleReport({ tickets }) {
    // ── Group by device name ──────────────────────────────────────────────────
    const byDevice = useMemo(() => {
        const map = {};
        tickets.forEach((t) => {
            const device = (t.deviceName || "").trim() || "Unknown device";
            const category = (t.issueCategory || "").trim() || "Unknown category";
            const key = device;
            if (!map[key]) map[key] = { device, category, count: 0, urgency: { High: 0, Medium: 0, Low: 0 } };
            map[key].count++;
            if (t.urgency) map[key].urgency[t.urgency] = (map[key].urgency[t.urgency] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => b.count - a.count);
    }, [tickets]);

    // ── Group by category ─────────────────────────────────────────────────────
    const byCategory = useMemo(() => {
        const map = {};
        tickets.forEach((t) => {
            const cat = (t.issueCategory || "").trim() || "Unknown";
            if (!map[cat]) map[cat] = { category: cat, count: 0, urgency: { High: 0, Medium: 0, Low: 0 } };
            map[cat].count++;
            if (t.urgency) map[cat].urgency[t.urgency] = (map[cat].urgency[t.urgency] || 0) + 1;
        });
        return Object.values(map).sort((a, b) => b.count - a.count);
    }, [tickets]);

    const deviceMax = byDevice[0]?.count || 1;
    const categoryMax = byCategory[0]?.count || 1;
    const total = tickets.length;

    // ── Top-level procurement summary ─────────────────────────────────────────
    const criticalDevices = byDevice.filter(d => getRating(d.count, deviceMax).color === "red");

    if (total === 0) {
        return (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <p className="text-sm text-gray-400">No ticket data to analyse.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">

            {/* ── Procurement alert banner ── */}
            {criticalDevices.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-800 mb-0.5">Procurement attention needed</p>
                        <p className="text-xs text-red-600 leading-relaxed">
                            {criticalDevices.map(d => `"${d.device}"`).join(", ")}
                            {criticalDevices.length === 1 ? " generates" : " generate"} the most tickets and
                            {criticalDevices.length === 1 ? " is" : " are"} flagged for replacement review.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* ── Device breakdown ── */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <Cpu className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">By device</span>
                        <span className="ml-auto text-xs text-gray-400">{byDevice.length} device{byDevice.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="px-5 py-2 divide-y divide-gray-50">
                        {byDevice.slice(0, 10).map((d, i) => {
                            const rating = getRating(d.count, deviceMax);
                            return (
                                <TroubleRow
                                    key={d.device}
                                    rank={i + 1}
                                    name={d.device}
                                    sub={d.category}
                                    count={d.count}
                                    max={deviceMax}
                                    urgencyBreakdown={d.urgency}
                                    recommendation={getProcurementNote(d.device, d.count, total, d.urgency.High, rating)}
                                />
                            );
                        })}
                        {byDevice.length === 0 && (
                            <p className="text-xs text-gray-400 py-6 text-center">
                                No device data — make sure tickets include a device name.
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Category breakdown ── */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                        <Package className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">By issue category</span>
                        <span className="ml-auto text-xs text-gray-400">{byCategory.length} categor{byCategory.length !== 1 ? "ies" : "y"}</span>
                    </div>
                    <div className="px-5 py-2 divide-y divide-gray-50">
                        {byCategory.slice(0, 10).map((c, i) => {
                            const rating = getRating(c.count, categoryMax);
                            return (
                                <TroubleRow
                                    key={c.category}
                                    rank={i + 1}
                                    name={c.category}
                                    count={c.count}
                                    max={categoryMax}
                                    urgencyBreakdown={c.urgency}
                                    recommendation={
                                        rating.color === "red"
                                            ? `⚠️ This category dominates ${Math.round((c.count / total) * 100)}% of tickets. Consider training, standardisation, or equipment replacement.`
                                            : rating.color === "amber"
                                                ? `📋 ${Math.round((c.count / total) * 100)}% of tickets. Monitor for growth.`
                                                : `✅ ${Math.round((c.count / total) * 100)}% of tickets — low concern.`
                                    }
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Summary legend ── */}
            <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">How ratings are determined</p>
                <div className="flex flex-wrap gap-6 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                        <strong className="text-red-700">Always in trouble</strong> — top 50% of ticket volume. Prioritise for procurement.
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                        <strong className="text-amber-700">Recurring issues</strong> — 25–50% of max volume. Watch and review.
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                        <strong className="text-emerald-700">Occasional</strong> — below 25% of max volume. No action needed.
                    </span>
                </div>
            </div>
        </div>
    );
}