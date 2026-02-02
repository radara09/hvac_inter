import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { ACRecord } from "../types";

// load logo dari /public/logo.png -> url "/logo.png"
async function loadPublicImageAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) return null;

    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateQrPdf(siteName: string, units: ACRecord[]) {
  const doc = new jsPDF(); // A4 portrait, unit mm
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // === Margin & header ===
  const margin = 8;
  const headerY = 12;
  const gridStartY = 18;
  const marginBottom = 8;

  const cols = 4;
  const cellWidth = (pageWidth - margin * 2) / cols;

  // === Grid height: isi halaman dengan 4 baris ===
  const rowsPerPage = 4;
  const availableHeight = pageHeight - gridStartY - marginBottom;
  const cellHeight = availableHeight / rowsPerPage;

  // === Element sizes inside a cell ===
  const topPadding = 3;

  const logoBoxH = 10;      // tinggi area logo
  const logoMaxW = 16;      // max lebar logo (akan diskalakan)
  const logoMaxH = 8;       // max tinggi logo (akan diskalakan)

  const gapAfterLogo = 2;

  const qrSize = 44;        // QR cukup besar, tapi tidak nabrak label

  const gapAfterQr = 4;

  const nameFontSize = 9;
  const locationFontSize = 8;
  const lineHeight = 4;
  const maxLocationLines = 2; // biar tidak kebawah (bisa 3 kalau kamu mau)

  // Load logo sekali
  const logoDataUrl = await loadPublicImageAsDataUrl("/logo.png");

  const drawHeader = () => {
    doc.setFontSize(16);
    doc.text(`QR Codes - ${siteName}`, margin, headerY);
    doc.setFontSize(10);
  };

  drawHeader();

  let col = 0;
  let row = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];

    const predictedY = gridStartY + row * cellHeight;
    if (predictedY + cellHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      col = 0;
      row = 0;
    }

    const cx = margin + col * cellWidth;
    const cy = gridStartY + row * cellHeight;

    // Border untuk cutting (opsional)
    doc.setDrawColor(200);
    doc.rect(cx, cy, cellWidth, cellHeight);

    // =========================
    // 1) LOGO (di atas, center)
    // =========================
    const logoY = cy + topPadding;

    if (logoDataUrl) {
      // logo di-center, diskalakan ke logoMaxW x logoMaxH
      // (Kita tidak punya dimensi asli tanpa parser image,
      // jadi kita gunakan fixed box. Ini aman dan rapi.)
      const lw = logoMaxW;
      const lh = logoMaxH;
      const lx = cx + (cellWidth - lw) / 2;

      doc.addImage(logoDataUrl, "PNG", lx, logoY, lw, lh);
    }

    // =========================
    // 2) QR (di bawah logo)
    // =========================
    const qrY = logoY + logoBoxH + gapAfterLogo;
    const qrX = cx + (cellWidth - qrSize) / 2;

    try {
      const qrPayload = unit.id; // nanti bisa diganti URL detail AC
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: "M", // tidak perlu H karena tidak ada overlay logo
      });

      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (err) {
      console.error("Failed to generate QR", err);
    }

    // =========================
    // 3) NAMA UNIT (center)
    // =========================
    doc.setFontSize(nameFontSize);
    const name = unit.assetCode ?? "";
    const nameY = qrY + qrSize + gapAfterQr;
    doc.text(String(name), cx + cellWidth / 2, nameY, { align: "center" });

    // =========================
    // 4) LOKASI (word wrap)
    // =========================
    doc.setFontSize(locationFontSize);
    const locationText = unit.location ?? "";
    const maxTextWidth = cellWidth - 6;

    const wrapped = doc.splitTextToSize(locationText, maxTextWidth);
    const lines = wrapped.slice(0, maxLocationLines);

    const startTextY = nameY + 6;
    for (let li = 0; li < lines.length; li++) {
      doc.text(String(lines[li]), cx + cellWidth / 2, startTextY + li * lineHeight, {
        align: "center",
      });
    }

    // advance grid
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  doc.save(`${siteName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_qrcodes.pdf`);
}
