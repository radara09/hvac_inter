// import jsPDF from "jspdf";
// import QRCode from "qrcode";
// import type { ACRecord } from "../types";

// export async function generateQrPdf(siteName: string, units: ACRecord[]) {
//     const doc = new jsPDF();
//     const pageWidth = doc.internal.pageSize.getWidth();
//     const margin = 10;
//     const qrSize = 40;
//     const cols = 4;
//     const rows = 5;
//     const cellWidth = (pageWidth - margin * 2) / cols;
//     const cellHeight = 60;

//     doc.setFontSize(16);
//     doc.text(`QR Codes - ${siteName}`, margin, 15);
//     doc.setFontSize(10);

//     let currentUnitIndex = 0;

//     while (currentUnitIndex < units.length) {
//         if (currentUnitIndex > 0) {
//             doc.addPage();
//         }

//         let startY = 25;

//         for (let r = 0; r < rows; r++) {
//             for (let c = 0; c < cols; c++) {
//                 if (currentUnitIndex >= units.length) break;

//                 const unit = units[currentUnitIndex];
//                 const x = margin + c * cellWidth;
//                 const y = startY + r * cellHeight;

//                 // Generate QR
//                 try {
//                     const qrDataUrl = await QRCode.toDataURL(unit.id, { margin: 1, width: 200 });
//                     doc.addImage(qrDataUrl, "PNG", x + (cellWidth - qrSize) / 2, y, qrSize, qrSize);
//                 } catch (err) {
//                     console.error("Failed to generate QR", err);
//                 }

//                 // Label
//                 doc.setFontSize(8);
//                 const name = unit.assetCode;
//                 const location = unit.location.length > 20 ? unit.location.substring(0, 20) + "..." : unit.location;

//                 doc.text(name, x + cellWidth / 2, y + qrSize + 5, { align: "center" });
//                 doc.text(location, x + cellWidth / 2, y + qrSize + 9, { align: "center" });

//                 // Border for cutting (optional)
//                 doc.setDrawColor(200);
//                 doc.rect(x, y, cellWidth, cellHeight);

//                 currentUnitIndex++;
//             }
//         }
//     }

//     doc.save(`${siteName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_qrcodes.pdf`);
// }




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

    // prediksi Y untuk cek pagination (x tidak dibutuhkan)
    const predictedY = gridStartY + row * cellHeight;

    // pagination aman: kalau cell keluar area halaman → page baru
    if (predictedY + cellHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      col = 0;
      row = 0;
    }

    // posisi cell aktual setelah kemungkinan reset page/row/col
    const cx = margin + col * cellWidth;
    const cy = gridStartY + row * cellHeight;

    // Generate QR
    try {
      const qrDataUrl = await QRCode.toDataURL(unit.id, { margin: 1, width: 200 });
      doc.addImage(
        qrDataUrl,
        "PNG",
        cx + (cellWidth - qrSize) / 2,
        cy,
        qrSize,
        qrSize
      );
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

    // === WORD WRAP LOCATION ===
    const locationText = unit.location ?? "";
    const maxTextWidth = cellWidth - 6; // padding kiri+kanan dalam cell
    const wrapped = doc.splitTextToSize(locationText, maxTextWidth);

    const maxLines = 3; // maksimal baris lokasi
    const lines = wrapped.slice(0, maxLines);

    const lineHeight = 4; // cocok untuk font size 8
    const startTextY = cy + qrSize + 9;

    for (let li = 0; li < lines.length; li++) {
      doc.text(String(lines[li]), cx + cellWidth / 2, startTextY + li * lineHeight, {
        align: "center",
      });
    }
    // =========================

    // advance grid
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  doc.save(`${siteName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_qrcodes.pdf`);
}
