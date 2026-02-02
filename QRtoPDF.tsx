import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { ACRecord } from "../types";

export async function generateQrPdf(siteName: string, units: ACRecord[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 10;
  const qrSize = 40;
  const cols = 4;
  const cellWidth = (pageWidth - margin * 2) / cols;
  const cellHeight = 60;

  const headerY = 15;
  const gridStartY = 25;
  const marginBottom = 10;

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

    // posisi cell saat ini (prediksi)
    const x = margin + col * cellWidth;
    const y = gridStartY + row * cellHeight;

    // pagination aman
    if (y + cellHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      col = 0;
      row = 0;
    }

    // recalculation setelah reset page/row/col
    const cx = margin + col * cellWidth;
    const cy = gridStartY + row * cellHeight;

    // Generate QR
    try {
      const qrDataUrl = await QRCode.toDataURL(unit.id, { margin: 1, width: 200 });
      doc.addImage(qrDataUrl, "PNG", cx + (cellWidth - qrSize) / 2, cy, qrSize, qrSize);
    } catch (err) {
      console.error("Failed to generate QR", err);
    }

    // Border
    doc.setDrawColor(200);
    doc.rect(cx, cy, cellWidth, cellHeight);

    // Label
    doc.setFontSize(8);

    const name = unit.assetCode;
    doc.text(name, cx + cellWidth / 2, cy + qrSize + 5, { align: "center" });

    // === WORD WRAP LOCATION (gantikan logic substring + "...") ===
    const locationText = unit.location ?? "";
    const maxTextWidth = cellWidth - 6; // padding kiri+kanan dalam cell
    const wrapped = doc.splitTextToSize(locationText, maxTextWidth);

    const maxLines = 3; // ubah ke 3 kalau mau lebih banyak
    const lines = wrapped.slice(0, maxLines);

    const lineHeight = 4; // jarak antar baris untuk font size 8 (mm)
    const startTextY = cy + qrSize + 9;

    // render setiap baris tetap rata tengah
    for (let li = 0; li < lines.length; li++) {
      doc.text(String(lines[li]), cx + cellWidth / 2, startTextY + li * lineHeight, {
        align: "center",
      });
    }
    // ===========================================================

    // advance grid
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  doc.save(`${siteName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_qrcodes.pdf`);
}
