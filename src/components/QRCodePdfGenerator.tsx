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

// Load image + get original size (avoid stretch)
async function loadImageWithSize(
  path: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) return null;

    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });

    return { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function getPublicBaseUrl() {
  const env = (import.meta as any).env ?? {};
  const fromPublic = env.VITE_PUBLIC_BASE_URL as string | undefined;
  const fromAuth = env.VITE_AUTH_BASE_URL as string | undefined;
  const fromWindow =
    typeof window !== "undefined" ? window.location.origin : undefined;

  return fromPublic || fromAuth || fromWindow || "";
}

function buildMaintenanceUrl(acId: string) {
  const base = getPublicBaseUrl();

  if (!base) {
    // fallback: jangan bikin QR kosong
    console.warn(
      "Base URL is empty. Set VITE_PUBLIC_BASE_URL / VITE_AUTH_BASE_URL. Fallback to ID only."
    );
    return acId;
  }

  return `${normalizeBaseUrl(base)}/maintenance/${encodeURIComponent(acId)}`;
}

export async function generateQrPdf(siteName: string, units: ACRecord[]) {
  const doc = new jsPDF(); // A4 portrait, unit mm
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===== Layout global =====
  const margin = 6;
  const headerY = 10;
  const gridStartY = 16;
  const marginBottom = 6;

  const cols = 4;
  const cellWidth = (pageWidth - margin * 2) / cols;

  // Isi halaman dengan 4 baris (QR lebih besar & rapi)
  const rowsPerPage = 4;
  const availableHeight = pageHeight - gridStartY - marginBottom;
  const cellHeight = availableHeight / rowsPerPage;

  // ===== Element sizes =====
  const topPadding = 2;

  // Logo: gunakan ukuran asli, hanya scale down by height
  const logoMaxHeight = 6; // mm
  const gapAfterLogo = 2;

  const qrSize = 42; // mm
  const gapAfterQr = 4;

  const nameFontSize = 9;
  const locationFontSize = 8;
  const lineHeight = 4;
  const maxLocationLines = 2;

  // Load logo sekali
  const logo = await loadImageWithSize("/logo.png");

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

    // pagination (cek Y)
    const predictedY = gridStartY + row * cellHeight;
    if (predictedY + cellHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawHeader();
      col = 0;
      row = 0;
    }

    const cx = margin + col * cellWidth;
    const cy = gridStartY + row * cellHeight;

    // Border (optional, untuk cutting)
    doc.setDrawColor(200);
    doc.rect(cx, cy, cellWidth, cellHeight);

    // =========================
    // Layout dalam cell: logo -> QR -> name -> location
    // =========================
    let currentY = cy + topPadding;

    // --- Logo (center, no stretch) ---
    if (logo) {
      const aspect = logo.width / logo.height;
      const logoHeight = logoMaxHeight;
      const logoWidth = logoHeight * aspect;

      const logoX = cx + (cellWidth - logoWidth) / 2; // center
      doc.addImage(logo.dataUrl, "PNG", logoX, currentY, logoWidth, logoHeight);

      currentY += logoHeight + gapAfterLogo;
    }

    // --- QR Code ---
    const qrX = cx + (cellWidth - qrSize) / 2;
    const qrY = currentY;

    try {
      const qrPayload = buildMaintenanceUrl(unit.id); // ✅ redirect URL
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 300,
        errorCorrectionLevel: "M",
      });

      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (err) {
      console.error("Failed to generate QR", err);
    }

    currentY += qrSize + gapAfterQr;

    // --- Nama unit ---
    doc.setFontSize(nameFontSize);
    doc.text(String(unit.assetCode ?? ""), cx + cellWidth / 2, currentY, {
      align: "center",
    });

    currentY += 6;

    // --- Lokasi (wrap) ---
    doc.setFontSize(locationFontSize);
    const wrapped = doc
      .splitTextToSize(unit.location ?? "", cellWidth - 6)
      .slice(0, maxLocationLines);

    for (let li = 0; li < wrapped.length; li++) {
      doc.text(String(wrapped[li]), cx + cellWidth / 2, currentY + li * lineHeight, {
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

