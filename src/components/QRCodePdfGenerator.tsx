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

// helper: load logo dari /public/logo.png menjadi dataURL (untuk jsPDF.addImage)
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
  const doc = new jsPDF(); // default A4 portrait, unit mm
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // === Layout tuning (lebih “ngisi” kertas) ===
  const margin = 8; // lebih kecil dari 10
  const headerY = 12; // header lebih naik
  const gridStartY = 18; // grid mulai lebih atas
  const marginBottom = 8; // margin bawah lebih kecil

  const cols = 4;
  const cellWidth = (pageWidth - margin * 2) / cols;

  // Pakai tinggi halaman semaksimal mungkin dengan 4 baris (lebih lega untuk QR besar + label)
  const rowsPerPage = 4;
  const availableHeight = pageHeight - gridStartY - marginBottom;
  const cellHeight = availableHeight / rowsPerPage;

  // QR & logo
  const qrSize = 46; // lebih besar (sebelumnya 40)
  const logoSize = 8; // logo kecil agar QR tetap terbaca
  const logoInset = 2; // jarak dari tepi QR saat overlay

  // Coba load logo sekali saja
  const logoDataUrl = await loadPublicImageAsDataUrl("/logo.png"); // public/logo.png -> /logo.png

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

    // prediksi Y untuk pagination
    const predictedY = gridStartY + row * cellHeight;

    if (predictedY + cellHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      col = 0;
      row = 0;
    }

    const cx = margin + col * cellWidth;
    const cy = gridStartY + row * cellHeight;

    // Border (opsional untuk cutting)
    doc.setDrawColor(200);
    doc.rect(cx, cy, cellWidth, cellHeight);

    // posisi QR (centered)
    const qrX = cx + (cellWidth - qrSize) / 2;
    const qrY = cy + 3; // sedikit turun biar lebih rapi

    // === Generate QR ===
    try {
      // IMPORTANT: errorCorrectionLevel 'H' agar QR tetap terbaca walau ada logo kecil overlay
      const qrPayload = unit.id; // nanti kalau mau redirect URL, ganti di sini
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: "H",
      });

      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      // === Logo di kiri-atas QR (overlay kecil) ===
      // Catatan: overlay kecil + ECL H biasanya aman untuk scan
      if (logoDataUrl) {
        doc.addImage(
          logoDataUrl,
          "PNG",
          qrX + logoInset,
          qrY + logoInset,
          logoSize,
          logoSize
        );
      }
    } catch (err) {
      console.error("Failed to generate QR", err);
    }

    // === Label ===
    doc.setFontSize(9); // sedikit dibesarkan biar kebaca (sebelumnya 8)

    // Nama
    const name = unit.assetCode ?? "";
    const nameY = qrY + qrSize + 6;
    doc.text(String(name), cx + cellWidth / 2, nameY, { align: "center" });

    // Lokasi (word wrap)
    doc.setFontSize(8);
    const locationText = unit.location ?? "";
    const maxTextWidth = cellWidth - 6; // padding kiri+kanan dalam cell
    const wrapped = doc.splitTextToSize(locationText, maxTextWidth);

    // karena cellHeight sekarang lebih besar (ngisi page), kita bisa kasih 3 baris aman
    const maxLines = 3;
    const lines = wrapped.slice(0, maxLines);

    const lineHeight = 4;
    const startTextY = nameY + 5;

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

