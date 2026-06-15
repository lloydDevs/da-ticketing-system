import jsPDF from "jspdf";

// ─── Thresholds (must match DeviceTroubleReport.jsx) ─────────────────────────
const HIGH_THRESHOLD = 0.5;
const MEDIUM_THRESHOLD = 0.25;

function getRating(count, max) {
    const ratio = max > 0 ? count / max : 0;
    if (ratio >= HIGH_THRESHOLD) return { label: "Always in trouble", tier: "HIGH" };
    if (ratio >= MEDIUM_THRESHOLD) return { label: "Recurring issues", tier: "MEDIUM" };
    return { label: "Occasional", tier: "LOW" };
}

function ratingColor(tier) {
    if (tier === "HIGH") return [220, 38, 38]; // red-600
    if (tier === "MEDIUM") return [217, 119, 6]; // amber-600
    return [5, 150, 105]; // emerald-600
}

function getProcurementNote(count, total, highUrgency, tier) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    if (tier === "HIGH") {
        if (highUrgency > count * 0.5)
            return `${pct}% of all tickets. Majority are High urgency. Recommend immediate replacement in next procurement cycle.`;
        return `${pct}% of all tickets. Frequent breakdowns indicate aging hardware. Prioritise for replacement.`;
    }
    if (tier === "MEDIUM")
        return `${pct}% of all tickets. Monitor trend. Include in next procurement review if increasing.`;
    return `${pct}% of all tickets. Performing well — no procurement action needed at this time.`;
}

// ─── jsPDF helpers ────────────────────────────────────────────────────────────
function hline(doc, x1, x2, y, width = 0.3, color = [200, 200, 200]) {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
}

function drawBar(doc, x, y, filledW, totalW, barH, tier) {
    // Background track
    doc.setFillColor(235, 235, 235);
    doc.roundedRect(x, y, totalW, barH, 1, 1, "F");
    // Filled portion
    if (filledW > 0) {
        doc.setFillColor(...ratingColor(tier));
        doc.roundedRect(x, y, Math.max(filledW, 2), barH, 1, 1, "F");
    }
}

function drawUrgencyBar(doc, x, y, barW, barH, high, med, low, total) {
    const safe = total || 1;
    const hW = (high / safe) * barW;
    const mW = (med / safe) * barW;
    const lW = (low / safe) * barW;
    // background
    doc.setFillColor(235, 235, 235);
    doc.roundedRect(x, y, barW, barH, 1, 1, "F");
    let cx = x;
    if (hW > 0) { doc.setFillColor(220, 38, 38); doc.rect(cx, y, hW, barH, "F"); cx += hW; }
    if (mW > 0) { doc.setFillColor(217, 119, 6); doc.rect(cx, y, mW, barH, "F"); cx += mW; }
    if (lW > 0) { doc.setFillColor(5, 150, 105); doc.rect(cx, y, lW, barH, "F"); }
}

function sectionHeading(doc, text, y, mL, cW) {
    doc.setFillColor(245, 245, 244);
    doc.rect(mL, y, cW, 8, "F");
    doc.setFontSize(8).setFont("helvetica", "bold").setTextColor(50, 50, 50);
    doc.text(text.toUpperCase(), mL + 3, y + 5.5);
    return y + 8 + 4;
}

function pageFooter(doc, pageNum, totalPages, mL, cW, pageH) {
    const y = pageH - 10;
    hline(doc, mL, mL + cW, y - 3, 0.3, [180, 180, 180]);
    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(150, 150, 150);
    doc.text("DA-MIMAROPA IT Support — Device & Procurement Analytics Report", mL, y);
    doc.text(`Page ${pageNum} of ${totalPages}`, mL + cW, y, { align: "right" });
}

// ─── Main export function ────────────────────────────────────────────────────
export function exportAnalyticsPDF(tickets, HEADER_IMAGE_B64) {
    if (!tickets || tickets.length === 0) return;

    // ── Compute analytics ──────────────────────────────────────────────────────
    const total = tickets.length;
    const now = new Date();

    // By device
    const deviceMap = {};
    tickets.forEach((t) => {
        const device = (t.deviceName || "").trim() || "Unknown device";
        const category = (t.issueCategory || "").trim() || "Unknown category";
        if (!deviceMap[device]) deviceMap[device] = { device, category, count: 0, urgency: { High: 0, Medium: 0, Low: 0 }, statuses: {} };
        deviceMap[device].count++;
        if (t.urgency) deviceMap[device].urgency[t.urgency] = (deviceMap[device].urgency[t.urgency] || 0) + 1;
        if (t.status) deviceMap[device].statuses[t.status] = (deviceMap[device].statuses[t.status] || 0) + 1;
    });
    const byDevice = Object.values(deviceMap).sort((a, b) => b.count - a.count);
    const deviceMax = byDevice[0]?.count || 1;

    // By category
    const catMap = {};
    tickets.forEach((t) => {
        const cat = (t.issueCategory || "").trim() || "Unknown";
        if (!catMap[cat]) catMap[cat] = { category: cat, count: 0, urgency: { High: 0, Medium: 0, Low: 0 } };
        catMap[cat].count++;
        if (t.urgency) catMap[cat].urgency[t.urgency] = (catMap[cat].urgency[t.urgency] || 0) + 1;
    });
    const byCategory = Object.values(catMap).sort((a, b) => b.count - a.count);
    const catMax = byCategory[0]?.count || 1;

    // Summary counts
    const openCount = tickets.filter(t => t.status === "Open").length;
    const inProgCount = tickets.filter(t => t.status === "In Progress").length;
    const resolvedCount = tickets.filter(t => t.status === "Resolved" || t.status === "Closed").length;
    const highCount = tickets.filter(t => t.urgency === "High").length;
    const resRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;
    const criticalDevices = byDevice.filter(d => getRating(d.count, deviceMax).tier === "HIGH");

    // ── PDF setup ──────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const mL = 14;
    const mR = 14;
    const cW = pageW - mL - mR;

    const BLACK = [0, 0, 0];
    const DARK = [40, 40, 40];
    const MID = [100, 100, 100];
    const LIGHT = [180, 180, 180];

    // We'll track pages manually to add footer later via page count
    let pageNum = 1;

    // ── PAGE 1: Cover / Summary ────────────────────────────────────────────────
    let y = 8;

    // Header image
    try {
        doc.addImage(HEADER_IMAGE_B64, "PNG", mL, y, cW, 26);
    } catch (_) {
        doc.setFontSize(9).setFont("helvetica", "bold").setTextColor(...DARK);
        doc.text("DEPARTMENT OF AGRICULTURE — MIMAROPA REGION", pageW / 2, y + 13, { align: "center" });
    }
    y += 30;

    // Report title block
    doc.setFillColor(15, 118, 110); // emerald-700
    doc.rect(mL, y, cW, 14, "F");
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("DEVICE & PROCUREMENT ANALYTICS REPORT", pageW / 2, y + 9.5, { align: "center" });
    y += 14 + 2;

    doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...MID);
    doc.text(
        `Generated: ${now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}   |   Total tickets analysed: ${total}   |   DA-MIMAROPA MIS`,
        pageW / 2, y + 4, { align: "center" }
    );
    y += 12;

    // ── Summary stat boxes (4 across) ─────────────────────────────────────────
    const boxW = (cW - 9) / 4;
    const boxes = [
        { label: "Total Tickets", value: total, sub: "in dataset", bg: [240, 253, 250], border: [167, 243, 208] },
        { label: "Open / In Progress", value: openCount + inProgCount, sub: `${openCount} open, ${inProgCount} in progress`, bg: [239, 246, 255], border: [191, 219, 254] },
        { label: "Resolved / Closed", value: resolvedCount, sub: `${resRate}% resolution rate`, bg: [240, 253, 244], border: [167, 243, 208] },
        { label: "High Urgency", value: highCount, sub: `${total > 0 ? Math.round(highCount / total * 100) : 0}% of all tickets`, bg: [254, 242, 242], border: [254, 202, 202] },
    ];
    boxes.forEach((b, i) => {
        const bx = mL + i * (boxW + 3);
        doc.setFillColor(...b.bg);
        doc.setDrawColor(...b.border);
        doc.setLineWidth(0.4);
        doc.roundedRect(bx, y, boxW, 18, 2, 2, "FD");
        doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(...DARK);
        doc.text(String(b.value), bx + boxW / 2, y + 8, { align: "center" });
        doc.setFontSize(6.5).setFont("helvetica", "bold").setTextColor(...MID);
        doc.text(b.label, bx + boxW / 2, y + 13, { align: "center" });
        doc.setFontSize(6).setFont("helvetica", "normal").setTextColor(170, 170, 170);
        doc.text(b.sub, bx + boxW / 2, y + 16.5, { align: "center" });
    });
    y += 22;

    // ── Procurement alert block ────────────────────────────────────────────────
    if (criticalDevices.length > 0) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.setLineWidth(0.4);
        doc.roundedRect(mL, y, cW, 12, 2, 2, "FD");
        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(185, 28, 28);
        doc.text("! PROCUREMENT ATTENTION REQUIRED", mL + 4, y + 5);
        doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(220, 38, 38);
        const names = criticalDevices.map(d => d.device).join(", ");
        doc.text(
            `The following device(s) are flagged for replacement review: ${names}`,
            mL + 4, y + 9.5
        );
        y += 16;
    }

    y += 3;

    // ── SECTION 1: Device Analysis ────────────────────────────────────────────
    y = sectionHeading(doc, "Section 1 — Device Trouble Analysis", y, mL, cW);

    // Column headers
    const COL = {
        rank: mL,
        name: mL + 8,
        cat: mL + 52,
        bar: mL + 86,
        count: mL + 128,
        pct: mL + 140,
        high: mL + 152,
        med: mL + 160,
        low: mL + 168,
        rating: mL + 176,
    };
    const BAR_W = 40;
    const ROW_H = 9;

    const drawTableHeader = (yy) => {
        doc.setFillColor(250, 250, 249);
        doc.rect(mL, yy, cW, 6, "F");
        doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(...MID);
        doc.text("#", COL.rank + 1, yy + 4.2);
        doc.text("Device", COL.name, yy + 4.2);
        doc.text("Category", COL.cat, yy + 4.2);
        doc.text("Tickets", COL.bar, yy + 4.2);
        doc.text("Count", COL.count, yy + 4.2);
        doc.text("%", COL.pct, yy + 4.2);
        doc.text("H", COL.high, yy + 4.2);
        doc.text("M", COL.med, yy + 4.2);
        doc.text("L", COL.low, yy + 4.2);
        doc.text("Rating", COL.rating, yy + 4.2);
        return yy + 6;
    };

    y = drawTableHeader(y);

    byDevice.forEach((d, i) => {
        // Page break
        if (y + ROW_H > pageH - 18) {
            pageFooter(doc, pageNum, "?", mL, cW, pageH);
            doc.addPage(); pageNum++;
            y = 14;
            y = drawTableHeader(y);
        }

        const { tier, label } = getRating(d.count, deviceMax);
        const pct = Math.round((d.count / total) * 100);
        const filledW = (d.count / deviceMax) * BAR_W;
        const rowBg = i % 2 === 0 ? [255, 255, 255] : [249, 250, 251];

        doc.setFillColor(...rowBg);
        doc.rect(mL, y, cW, ROW_H, "F");
        hline(doc, mL, mL + cW, y + ROW_H, 0.2, [230, 230, 230]);

        // Rank
        doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(...MID);
        doc.text(String(i + 1), COL.rank + 1, y + 5.8);

        // Device name (truncate)
        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...DARK);
        const nameTxt = doc.splitTextToSize(d.device, 40)[0];
        doc.text(nameTxt, COL.name, y + 5.8);

        // Category
        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(...MID);
        const catTxt = doc.splitTextToSize(d.category, 30)[0];
        doc.text(catTxt, COL.cat, y + 5.8);

        // Bar
        drawBar(doc, COL.bar, y + 2.5, filledW, BAR_W, 4, tier);

        // Count
        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...DARK);
        doc.text(String(d.count), COL.count + 3, y + 5.8, { align: "center" });

        // %
        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(...MID);
        doc.text(`${pct}%`, COL.pct + 3, y + 5.8, { align: "center" });

        // Urgency counts
        doc.setFontSize(6.5).setFont("helvetica", "bold");
        doc.setTextColor(220, 38, 38); doc.text(String(d.urgency.High || 0), COL.high + 2, y + 5.8, { align: "center" });
        doc.setTextColor(217, 119, 6); doc.text(String(d.urgency.Medium || 0), COL.med + 2, y + 5.8, { align: "center" });
        doc.setTextColor(5, 150, 105); doc.text(String(d.urgency.Low || 0), COL.low + 2, y + 5.8, { align: "center" });

        // Rating pill
        doc.setFillColor(...ratingColor(tier));
        doc.roundedRect(COL.rating, y + 1.5, 30, 5.5, 1.5, 1.5, "F");
        doc.setFontSize(5.5).setFont("helvetica", "bold").setTextColor(255, 255, 255);
        doc.text(label, COL.rating + 15, y + 5.2, { align: "center" });

        y += ROW_H;
    });

    y += 8;

    // ── SECTION 2: Category Analysis ──────────────────────────────────────────
    if (y + 60 > pageH - 18) {
        pageFooter(doc, pageNum, "?", mL, cW, pageH);
        doc.addPage(); pageNum++;
        y = 14;
    }

    y = sectionHeading(doc, "Section 2 — Issue Category Analysis", y, mL, cW);

    const CAT_COL = {
        rank: mL,
        name: mL + 8,
        bar: mL + 72,
        count: mL + 115,
        pct: mL + 127,
        high: mL + 139,
        med: mL + 147,
        low: mL + 155,
        urgBar: mL + 163,
        rating: mL + 151,
    };
    const CAT_BAR_W = 40;

    const drawCatHeader = (yy) => {
        doc.setFillColor(250, 250, 249);
        doc.rect(mL, yy, cW, 6, "F");
        doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(...MID);
        doc.text("#", CAT_COL.rank + 1, yy + 4.2);
        doc.text("Category", CAT_COL.name, yy + 4.2);
        doc.text("Volume", CAT_COL.bar, yy + 4.2);
        doc.text("Count", CAT_COL.count, yy + 4.2);
        doc.text("%", CAT_COL.pct, yy + 4.2);
        doc.text("Urgency (H/M/L)", CAT_COL.high, yy + 4.2);
        doc.text("Rating", mL + cW - 32, yy + 4.2);
        return yy + 6;
    };

    y = drawCatHeader(y);

    byCategory.forEach((c, i) => {
        if (y + ROW_H > pageH - 18) {
            pageFooter(doc, pageNum, "?", mL, cW, pageH);
            doc.addPage(); pageNum++;
            y = 14;
            y = drawCatHeader(y);
        }

        const { tier, label } = getRating(c.count, catMax);
        const pct = Math.round((c.count / total) * 100);
        const filledW = (c.count / catMax) * CAT_BAR_W;
        const rowBg = i % 2 === 0 ? [255, 255, 255] : [249, 250, 251];

        doc.setFillColor(...rowBg);
        doc.rect(mL, y, cW, ROW_H, "F");
        hline(doc, mL, mL + cW, y + ROW_H, 0.2, [230, 230, 230]);

        doc.setFontSize(7).setFont("helvetica", "bold").setTextColor(...MID);
        doc.text(String(i + 1), CAT_COL.rank + 1, y + 5.8);

        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...DARK);
        const catNameTxt = doc.splitTextToSize(c.category, 58)[0];
        doc.text(catNameTxt, CAT_COL.name, y + 5.8);

        drawBar(doc, CAT_COL.bar, y + 2.5, filledW, CAT_BAR_W, 4, tier);

        doc.setFontSize(7.5).setFont("helvetica", "bold").setTextColor(...DARK);
        doc.text(String(c.count), CAT_COL.count + 3, y + 5.8, { align: "center" });

        doc.setFontSize(6.5).setFont("helvetica", "normal").setTextColor(...MID);
        doc.text(`${pct}%`, CAT_COL.pct + 3, y + 5.8, { align: "center" });

        // Stacked urgency bar
        drawUrgencyBar(doc, CAT_COL.high, y + 2.5, 38, 4,
            c.urgency.High || 0, c.urgency.Medium || 0, c.urgency.Low || 0, c.count);
        // H/M/L numbers below bar
        doc.setFontSize(5.5).setFont("helvetica", "normal");
        doc.setTextColor(220, 38, 38); doc.text(`H:${c.urgency.High || 0}`, CAT_COL.high, y + 8.2);
        doc.setTextColor(217, 119, 6); doc.text(`M:${c.urgency.Medium || 0}`, CAT_COL.high + 14, y + 8.2);
        doc.setTextColor(5, 150, 105); doc.text(`L:${c.urgency.Low || 0}`, CAT_COL.high + 27, y + 8.2);

        // Rating pill
        doc.setFillColor(...ratingColor(tier));
        doc.roundedRect(mL + cW - 32, y + 1.5, 30, 5.5, 1.5, 1.5, "F");
        doc.setFontSize(5.5).setFont("helvetica", "bold").setTextColor(255, 255, 255);
        doc.text(label, mL + cW - 17, y + 5.2, { align: "center" });

        y += ROW_H;
    });

    y += 8;

    // ── SECTION 3: Procurement Recommendations ────────────────────────────────
    if (y + 30 > pageH - 18) {
        pageFooter(doc, pageNum, "?", mL, cW, pageH);
        doc.addPage(); pageNum++;
        y = 14;
    }

    y = sectionHeading(doc, "Section 3 — Procurement Recommendations", y, mL, cW);

    // Intro paragraph
    doc.setFontSize(7.5).setFont("helvetica", "normal").setTextColor(...DARK);
    const intro = `Based on ticket data from ${total} support requests, the following devices and categories have been assessed for procurement priority. Ratings are determined by ticket volume relative to the highest-volume item: "Always in trouble" (>=50% of max), "Recurring issues" (25–49%), and "Occasional" (<25%).`;
    const introLines = doc.splitTextToSize(intro, cW);
    doc.text(introLines, mL, y);
    y += introLines.length * 4.2 + 5;

    // Device recommendations
    byDevice.forEach((d, i) => {
        if (y + 22 > pageH - 18) {
            pageFooter(doc, pageNum, "?", mL, cW, pageH);
            doc.addPage(); pageNum++;
            y = 14;
        }

        const { tier, label } = getRating(d.count, deviceMax);
        const note = getProcurementNote(d.count, total, d.urgency.High || 0, tier);
        const pct = Math.round((d.count / total) * 100);

        // Card background
        const cardBg = tier === "HIGH" ? [254, 242, 242] : tier === "MEDIUM" ? [255, 251, 235] : [240, 253, 244];
        const cardBorder = tier === "HIGH" ? [252, 165, 165] : tier === "MEDIUM" ? [253, 211, 77] : [167, 243, 208];
        doc.setFillColor(...cardBg);
        doc.setDrawColor(...cardBorder);
        doc.setLineWidth(0.4);
        doc.roundedRect(mL, y, cW, 20, 2, 2, "FD");

        // Left accent bar
        doc.setFillColor(...ratingColor(tier));
        doc.rect(mL, y, 3, 20, "F");

        // Device name + rating
        doc.setFontSize(8.5).setFont("helvetica", "bold").setTextColor(...DARK);
        doc.text(`${i + 1}. ${d.device}`, mL + 7, y + 6);

        doc.setFillColor(...ratingColor(tier));
        doc.roundedRect(mL + cW - 36, y + 2, 34, 6, 1.5, 1.5, "F");
        doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(255, 255, 255);
        doc.text(label, mL + cW - 19, y + 6.2, { align: "center" });

        // Category & stats row
        doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...MID);
        doc.text(
            `Category: ${d.category}   |   Total tickets: ${d.count} (${pct}% of all)   |   High: ${d.urgency.High || 0}  Med: ${d.urgency.Medium || 0}  Low: ${d.urgency.Low || 0}`,
            mL + 7, y + 11
        );

        // Recommendation text
        doc.setFontSize(7).setFont("helvetica", "italic").setTextColor(80, 80, 80);
        const noteLines = doc.splitTextToSize(note, cW - 12);
        doc.text(noteLines, mL + 7, y + 16);

        y += 23;
    });

    y += 5;

    // ── SECTION 4: Rating legend ──────────────────────────────────────────────
    if (y + 24 > pageH - 18) {
        pageFooter(doc, pageNum, "?", mL, cW, pageH);
        doc.addPage(); pageNum++;
        y = 14;
    }

    y = sectionHeading(doc, "Rating Scale & Methodology", y, mL, cW);

    const legend = [
        { tier: "HIGH", label: "Always in trouble", desc: "Device/category accounts for ≥50% of the highest-volume item. Immediate procurement review recommended." },
        { tier: "MEDIUM", label: "Recurring issues", desc: "Accounts for 25–49% of the highest-volume item. Include in upcoming procurement planning." },
        { tier: "LOW", label: "Occasional", desc: "Below 25% of the highest-volume item. No immediate procurement action required." },
    ];

    legend.forEach((l) => {
        if (y + 14 > pageH - 18) {
            pageFooter(doc, pageNum, "?", mL, cW, pageH);
            doc.addPage(); pageNum++;
            y = 14;
        }
        doc.setFillColor(...ratingColor(l.tier));
        doc.roundedRect(mL, y + 1, 28, 6, 1.5, 1.5, "F");
        doc.setFontSize(6).setFont("helvetica", "bold").setTextColor(255, 255, 255);
        doc.text(l.label, mL + 14, y + 5, { align: "center" });
        doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(...DARK);
        const descLines = doc.splitTextToSize(l.desc, cW - 36);
        doc.text(descLines, mL + 33, y + 5);
        y += 10;
    });

    // ── Retroactively write footers with correct total pages ─────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        pageFooter(doc, p, totalPages, mL, cW, pageH);
    }

    const datePart = now.toISOString().slice(0, 10);
    doc.save(`DA-MIMAROPA-Analytics-${datePart}.pdf`);
}