import { useCallback, useMemo, useState, type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import { DepthCard, DepthStatCard } from "../components/DepthUI";
import type { ACRecord } from "../types";
import { QRScannerModal, QRCodeModal } from "../components/QRComponents";

type DashboardStat = { label: string; value: number | string; detail: string };

type DashboardPageProps = {
  stats: DashboardStat[];
  latestRecord?: ACRecord;
  latestSiteName?: string;
  loading: boolean;
  error: string | null;
  variant?: "admin" | "technician";
  records?: ACRecord[];
  userSiteId?: string | null;
  userSiteName?: string | null;
};

export function DashboardPage({
  stats,
  latestRecord,
  latestSiteName,
  loading,
  error,
  variant = "admin",
  records,
  userSiteId,
  userSiteName,
}: DashboardPageProps) {
  const navigate = useNavigate();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleQuickSearch = useCallback(() => {
    navigate("/maintenance", { state: { focusSearchToken: Date.now() } });
  }, [navigate]);

  const handleScanClick = useCallback(() => {
    setIsScannerOpen(true);
  }, []);

  const handleShowQRClick = useCallback(() => {
    setShowQR(true);
  }, []);

  const handleScanResult = useCallback((result: string) => {
    setIsScannerOpen(false);
    try {
      new URL(result);
      window.location.href = result;
    } catch {
      if (result.startsWith("/")) {
        navigate(result);
      } else {
        // Fallback, assume ID and go to maintenance detail
        navigate(`/maintenance/${result}`);
      }
    }
  }, [navigate]);

  const qrData = latestRecord
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/maintenance/${latestRecord.id}`
    : "";

  if (loading) {
    return (
      <section className="rounded-3xl p-6">
        Memuat data AC…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-200/20 bg-rose-500/10 p-6 text-rose-100">
        {error}
      </section>
    );
  }

  const inferredSiteId = userSiteId ?? records?.[0]?.siteId ?? null;
  const inferredSiteName = userSiteName ?? (records?.[0]?.siteId ?? null);
  const baseProps = { stats, latestRecord, latestSiteName, records } as const;

  if (variant === "technician" && !inferredSiteId && !inferredSiteName) {
    return (
      <DepthCard className="mx-auto max-w-md rounded-4xl p-6 text-center text-[#1f1f1f]">
        <p className="text-lg font-semibold">Belum ada penugasan</p>
        <p className="text-sm text-(--depthui-muted)">
          Hubungi admin untuk dialokasikan ke site sebelum melihat laporan.
        </p>
      </DepthCard>
    );
  }

  return (
    <div className="space-y-6">
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanResult}
      />
      {latestRecord && (
        <QRCodeModal
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          data={qrData}
          title={latestRecord.assetCode}
        />
      )}
      <div className="hidden md:block">
        <DesktopDashboard
          {...baseProps}
          onQuickSearch={handleQuickSearch}
          onScanClick={handleScanClick}
          onShowQRClick={handleShowQRClick}
        />
      </div>
      <div className="md:hidden">
        <TechnicianMobileDashboard
          {...baseProps}
          onQuickSearch={handleQuickSearch}
          onScanClick={handleScanClick}
          onShowQRClick={handleShowQRClick}
        />
      </div>
    </div>
  );
}

type DesktopDashboardProps = {
  stats: DashboardStat[];
  latestRecord?: ACRecord;
  latestSiteName?: string;
  records?: ACRecord[];
  onQuickSearch: () => void;
  onScanClick: () => void;
  onShowQRClick: () => void;
};

function calculateBarSegments(records: ACRecord[] = []) {
  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  let redCount = 0;
  let yellowCount = 0;
  let greenCount = 0;

  for (const record of records) {
    const condition = record.lastCondition?.toLowerCase() ?? "";
    const isBaik = condition === "baik" || condition === "normal";

    if (!isBaik) {
      redCount++;
      continue;
    }

    // It is 'Baik', check if stale
    const lastServiceMs = record.lastServiceAt ? Date.parse(record.lastServiceAt) : 0;
    // If invalid date, treat as stale? Or if 0. Let's assume invalid/0 is stale.
    const isStale = Number.isNaN(lastServiceMs) || (now - lastServiceMs) >= ninetyDaysMs;

    if (isStale) {
      yellowCount++;
    } else {
      greenCount++;
    }
  }

  const rawSegments = [
    { label: "Bermasalah", value: redCount, className: "depthui-danger" },
    { label: "Overdue", value: yellowCount, className: "depthui-warning" },
    { label: "Sehat", value: greenCount, className: "depthui-success" },
  ];

  const totalSegmentValue =
    rawSegments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return rawSegments.map((segment) => ({
    ...segment,
    width: (segment.value / totalSegmentValue) * 100,
  }));
}

function DesktopDashboard({
  stats,
  latestRecord,
  latestSiteName,
  records,
  onQuickSearch,
  onScanClick,
  onShowQRClick,
}: DesktopDashboardProps) {
  const {
    totalUnits,
    overdueUnits,
    issueUnits,
    technicianCount,
    lastUpdateDetail,
    lastUpdateValue,
  } = deriveDashboardMetrics(stats, records);
  const { detailPairs, metricPairs, siteLabel } = buildRecordDetails(
    latestRecord,
    latestSiteName
  );
  const hasLastUpdate = Boolean(lastUpdateDetail) || lastUpdateValue !== "-";
  const formattedLastUpdate = hasLastUpdate
    ? `${lastUpdateDetail ? `${lastUpdateDetail}, ` : ""}${lastUpdateValue}`
    : "-";

  const progressSegments = useMemo(() => calculateBarSegments(records), [records]);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <DepthStatCard label="Total AC" value={totalUnits} />
        <DepthStatCard
          label="+3 Bulan"
          subtitle="Belum diservis"
          value={overdueUnits}
        />
        <DepthStatCard label="Bermasalah" value={issueUnits} />
      </div>

      <DepthCard className="space-y-2 rounded-[30px] px-6 py-4">
        <div className="depthui-track h-5 w-full overflow-hidden rounded-full">
          <div className="flex h-full w-full">
            {progressSegments.map((segment) => (
              <div
                key={segment.label}
                className={`${segment.className} h-full`}
                style={{ width: `${segment.width}%` }}
                title={`${segment.label}: ${segment.value}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-sm font-semibold text-[#4a4a4a] md:flex-row md:items-center md:justify-between">
          <span className="flex items-center gap-2">
            Jumlah Teknisi: {technicianCount}
            <IconUser className="h-4 w-4" />
          </span>
          <span>Pembaruan Terakhir: {formattedLastUpdate}</span>
        </div>
      </DepthCard>


      <DepthCard className="flex items-center gap-3 rounded-4xl px-5 py-3 text-base text-[#4a4a4a] mt-6">
        <IconSearch className="h-5 w-5 text-[#7a7a7a]" />
        <input
          type="search"
          placeholder="Search"
          readOnly
          onFocus={onQuickSearch}
          onClick={onQuickSearch}
          className="flex-1 cursor-pointer bg-transparent text-lg text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:outline-none"
        />
        <button
          type="button"
          onClick={onScanClick}
          className="depthui-chip rounded-[18px] px-3 py-1 text-sm font-semibold hover:bg-black/5"
        >
          <IconScan className="h-5 w-5" />
        </button>
      </DepthCard>


      <div className="flex flex-col gap-6 lg:flex-row mt-8">
        <DepthCard className="flex-1 space-y-5 rounded-4xl p-6">
          <div className="px-4 space-y-1 text-base text-[#3b3b3b]">
            <h3 className="mb-3 text-md font-semibold text-[#5a5a5a]">Pembaruan Terakhir</h3>
            {detailPairs.map((detail) => (
              <p key={detail.label}>
                <span className="font-semibold text-[#1f1f1f]">
                  {detail.label}:
                </span>{" "}
                {detail.value}
              </p>
            ))}
          </div>

          <div className="px-4 space-y-1 text-base text-[#3b3b3b]">
            {metricPairs.map((metric) => (
              <p key={metric.label}>
                <span className="font-semibold text-[#1f1f1f]">
                  {metric.label}:
                </span>{" "}
                {metric.value}
              </p>
            ))}
          </div>
        </DepthCard>

        <div className="flex w-full flex-col gap-4 lg:w-[280px]">
          <DepthCard className="flex flex-1 items-center justify-center rounded-4xl border border-dashed border-[#c8c8c8] p-4 text-[#8a8a8a]">
            {latestRecord?.photoUrl ? (
              <img
                src={latestRecord.photoUrl}
                alt={latestRecord.assetCode}
                className="h-full w-full rounded-[28px] object-cover"
              />
            ) : (
              <IconImage className="h-24 w-24" />
            )}
          </DepthCard>
          <div className="depthui-chip rounded-[20px] px-4 py-2 text-sm text-[#5a5a5a]">
            Site: {siteLabel}
          </div>
          <button
            type="button"
            onClick={onShowQRClick}
            className="depthui-chip depthui-shadow-card flex w-full items-center justify-center gap-3 rounded-4xl px-4 py-3 text-base font-semibold text-[#1f1f1f] disabled:opacity-60"
            disabled={!latestRecord}
          >
            Show QR
            <IconQRCode className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

type TechnicianMobileDashboardProps = {
  stats: DashboardStat[];
  latestRecord?: ACRecord;
  latestSiteName?: string;
  records?: ACRecord[];
  onQuickSearch: () => void;
  onScanClick: () => void;
  onShowQRClick: () => void;
};

const IconSearch = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="11" cy="11" r="6" />
    <line x1="20" y1="20" x2="16.65" y2="16.65" />
  </svg>
);

const IconScan = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10" />
  </svg>
);

const IconUser = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.2-3 4.2-5 8-5s6.8 2 8 5" />
  </svg>
);



const IconQRCode = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <path d="M3 14h1v7h6v-1" />
  </svg>
);

const IconImage = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <rect x="6" y="10" width="52" height="44" rx="8" ry="8" />
    <circle cx="23" cy="24" r="5" />
    <path d="M14 46 28 32l10 10 6-6 12 12" />
  </svg>
);

function TechnicianMobileDashboard({
  stats,
  latestRecord,
  latestSiteName,
  records,
  onQuickSearch,
  onScanClick,
  onShowQRClick,
}: TechnicianMobileDashboardProps) {
  const {
    totalUnits,
    overdueUnits,
    issueUnits,
    technicianCount,
    lastUpdateDetail,
    lastUpdateValue,
  } = deriveDashboardMetrics(stats, records);
  const { detailPairs, metricPairs, siteLabel } = buildRecordDetails(
    latestRecord,
    latestSiteName
  );
  const hasLastUpdate = Boolean(lastUpdateDetail) || lastUpdateValue !== "-";
  const formattedLastUpdate = hasLastUpdate
    ? `${lastUpdateDetail ? `${lastUpdateDetail}, ` : ""}${lastUpdateValue}`
    : "-";

  const progressSegments = useMemo(() => calculateBarSegments(records), [records]);

  return (
    <section className="depthui-shell depthui-shadow-page mx-auto w-full max-w-md space-y-5 rounded-[40px] p-4 text-[#1f1f1f] sm:p-6">
      <div className="grid grid-cols-3 gap-3">
        <DepthStatCard label="Total AC" value={totalUnits} />
        <DepthStatCard
          label="+3 Bulan"
          subtitle="Belum diservis"
          value={overdueUnits}
        />
        <DepthStatCard label="Bermasalah" value={issueUnits} />
      </div>

      <DepthCard className="space-y-2 rounded-[26px] p-4">
        <div className="depthui-track h-5 w-full overflow-hidden rounded-full">
          <div className="flex h-full w-full">
            {progressSegments.map((segment) => (
              <div
                key={segment.label}
                className={`${segment.className} h-full`}
                style={{ width: `${segment.width}%` }}
                title={`${segment.label}: ${segment.value}`}
              />
            ))}
          </div>
        </div>
        <p className="text-sm text-[#4c4c4c]">
          Jumlah Teknisi:{" "}
          <span className="font-semibold text-[#1f1f1f]">
            {technicianCount}
          </span>
        </p>
        <p className="text-sm text-[#4c4c4c]">
          Pembaruan Terakhir:{" "}
          <span className="font-semibold text-[#1f1f1f]">
            {formattedLastUpdate}
          </span>
        </p>
      </DepthCard>

      <div className="space-y-3">
        <DepthCard className="flex items-center gap-2 rounded-[28px] px-4 py-3">
          <IconSearch className="h-5 w-5 text-[#7a7a7a]" />
          <input
            type="search"
            placeholder="Search"
            readOnly
            onFocus={onQuickSearch}
            onClick={onQuickSearch}
            className="flex-1 cursor-pointer bg-transparent text-base text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:outline-none"
          />
          <button
            type="button"
            onClick={onScanClick}
            className="depthui-chip rounded-[18px] px-3 py-1 text-sm font-semibold hover:bg-black/5"
          >
            <IconScan className="h-5 w-5" />
          </button>
        </DepthCard>
      </div>

      <DepthCard className="space-y-4 rounded-xl p-5 mt-12">
        <div className="flex items-center justify-between">
          <div className="depthui-chip rounded-full px-4 py-1 text-sm font-semibold text-[#5a5a5a]">
            Most Recent
          </div>
        </div>
        <p className="text-2xl font-semibold text-[#1f1f1f]">
          {latestRecord?.assetCode ?? "-"}
        </p>
        <div className="space-y-1 text-sm text-[#4a4a4a]">
          {detailPairs.map((detail) => (
            <p key={detail.label}>
              <span className="font-semibold text-[#1f1f1f]">
                {detail.label}:
              </span>{" "}
              {detail.value}
            </p>
          ))}
        </div>
        <div className="space-y-1 text-sm text-[#4a4a4a]">
          {metricPairs.map((metric) => (
            <p key={metric.label}>
              <span className="font-semibold text-[#1f1f1f]">
                {metric.label}:
              </span>{" "}
              {metric.value}
            </p>
          ))}
        </div>
        <div className="depthui-chip rounded-[20px] px-4 py-2 text-sm text-[#5a5a5a]">
          Site: {siteLabel}
        </div>

        <DepthCard className="flex h-48 w-full items-center justify-center rounded-[28px] border border-dashed border-[#c8c8c8] text-[#8a8a8a] overflow-hidden">
          {latestRecord?.photoUrl ? (
            <img
              src={latestRecord.photoUrl}
              alt={latestRecord.assetCode}
              className="h-full w-full object-cover"
            />
          ) : (
            <IconImage className="h-16 w-16" />
          )}
        </DepthCard>
      </DepthCard>

      <button
        type="button"
        onClick={onShowQRClick}
        className="depthui-card depthui-shadow-card flex w-full items-center justify-center gap-3 rounded-4xl px-4 py-3 text-base font-semibold text-[#1f1f1f]"
        disabled={!latestRecord}
      >
        Show QR
        <IconQRCode className="h-5 w-5" />
      </button>
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function deriveDashboardMetrics(stats: DashboardStat[], records?: ACRecord[]) {
  const findStat = (query: string) =>
    stats.find((stat) => stat.label.toLowerCase().includes(query));
  const parseNumber = (value: number | string | undefined) => {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const totalUnitsFromStats = parseNumber(findStat("total")?.value);
  const totalUnits = totalUnitsFromStats || (records?.length ?? 0);
  const overdueUnits = parseNumber(findStat("servis")?.value);
  const issueUnits = parseNumber(findStat("bermasalah")?.value);
  const healthyUnits = Math.max(totalUnits - overdueUnits - issueUnits, 0);
  const technicianCount = parseNumber(findStat("teknisi")?.value);
  const lastUpdateStat = findStat("terakhir");
  const lastUpdateDetail = lastUpdateStat?.detail ?? "";
  const lastUpdateValue = lastUpdateStat?.value ?? "-";

  return {
    totalUnits,
    overdueUnits,
    issueUnits,
    healthyUnits,
    technicianCount,
    lastUpdateDetail,
    lastUpdateValue,
  };
}

function buildRecordDetails(latestRecord?: ACRecord, latestSiteName?: string) {
  const detailPairs = [
    { label: "AC", value: latestRecord?.assetCode ?? "-" },
    { label: "Lokasi", value: latestRecord?.location ?? "-" },
    { label: "Merek", value: latestRecord?.brand ?? "-" },
    { label: "Kondisi Terakhir", value: latestRecord?.lastCondition ?? "-" },
    {
      label: "Service Terakhir",
      value: formatDate(latestRecord?.lastServiceAt),
    },
    {
      label: "Jadwal Berikut",
      value: formatDate(latestRecord?.nextScheduleAt),
    },
    { label: "Teknisi", value: latestRecord?.technician ?? "-" },
  ];

  const metricPairs = [
    { label: "Tekanan Freon", value: latestRecord?.freonPressure ?? "-" },
    { label: "Suhu Keluar", value: latestRecord?.outletTemp ?? "-" },
    { label: "Ampere Kompresor", value: latestRecord?.compressorAmp ?? "-" },
    { label: "Kondisi Filter", value: latestRecord?.filterCondition ?? "-" },
  ];

  const siteLabel = latestSiteName ?? latestRecord?.siteId ?? "-";

  return { detailPairs, metricPairs, siteLabel };
}
