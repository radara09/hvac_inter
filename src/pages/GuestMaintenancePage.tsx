import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DepthCard } from "../components/DepthUI";
import { authClient } from "../lib/auth-client";
import type { ACRecord } from "../types";

type PublicDetailResponse = {
  record?: ACRecord;
  siteName?: string | null;
  error?: string;
};

function formatParameterLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function shouldHideParameter(key: string) {
  const normalized = key.toLowerCase().trim();
  return (
    normalized === "tanda_tangan" ||
    normalized.includes("signature") ||
    normalized === "foto_url" ||
    normalized === "photo_url" ||
    normalized === "foto url" ||
    normalized === "photo url"
  );
}

export function GuestMaintenancePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const session = authClient.useSession();
  const user = session.data?.user;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<ACRecord | null>(null);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const loginHref = useMemo(() => {
    if (!id) return "/?redirect=/maintenance";
    return `/?redirect=/maintenance/${encodeURIComponent(id)}`;
  }, [id]);
  const photosToShow = useMemo(() => {
    if (!record) return null;
    const params = record.parameters as Record<string, unknown> | null;
    const rawValue = params
      ? (params.foto_url ?? params.photo_url ?? params.foto ?? params.photo)
      : null;
    if (typeof rawValue === "string") {
      const lines = rawValue.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const parsed = lines
        .map(line => {
          const [rawLabel, ...rest] = line.split(":");
          if (!rest.length) {
            return { label: "", url: rawLabel.trim() };
          }
          const url = rest.join(":").trim();
          return { label: rawLabel.trim(), url };
        })
        .filter(entry => entry.url);
      if (parsed.length > 0) {
        return parsed;
      }
    }
    if (record.photoUrl) {
      return [{ url: record.photoUrl, label: "" }];
    }
    return null;
  }, [record]);

  useEffect(() => {
    if (session.isPending) return;
    if (user && id) {
      navigate(`/maintenance/${encodeURIComponent(id)}`, { replace: true });
    }
  }, [id, navigate, session.isPending, user]);

  useEffect(() => {
    if (!id) {
      setError("ID AC tidak valid");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/public/ac/${id}`);
        const payload = (await response.json()) as PublicDetailResponse;
        if (!response.ok) {
          throw new Error(payload.error || `Gagal memuat detail (${response.status})`);
        }
        setRecord(payload.record ?? null);
        setSiteName(payload.siteName ?? null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat detail AC");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  return (
    <div className="depthui-shell min-h-screen px-4 py-6 text-(--depthui-text) sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <DepthCard className="rounded-4xl p-6">
          <div className="flex items-center gap-3">
            <img className="h-9" src="/logo.png" alt="App Logo" />
            <div>
              <p className="text-xs uppercase text-(--depthui-muted)">Guest View</p>
              <h1 className="text-xl font-semibold text-[#1f1f1f]">Detail Unit AC</h1>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={loginHref}
              className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 transition"
            >
              Login
            </a>
            <p className="text-xs text-(--depthui-muted)">
              Login untuk membuka versi lengkap dan bisa update.
            </p>
          </div>
          {loading && <p className="mt-4 text-sm text-(--depthui-muted)">Memuat detail AC...</p>}
          {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
        </DepthCard>

        {!loading && record && (
          <>
            <DepthCard className="space-y-3 rounded-4xl p-6 text-sm text-[#3f3f3f]">
              <p className="text-xs uppercase text-(--depthui-muted)">Identitas Unit</p>
              <p className="text-lg font-semibold text-[#1f1f1f]">{record.assetCode}</p>
              <p>Lokasi: {record.location}</p>
              <p>Site: {siteName ?? record.siteId}</p>
              <p>Merek: {record.brand}</p>
            </DepthCard>

            <DepthCard className="space-y-2 rounded-4xl p-6 text-sm text-[#3f3f3f]">
              <p className="text-xs uppercase text-(--depthui-muted)">Status & Service</p>
              <p>Kondisi Terakhir: {record.lastCondition}</p>
              <p>Teknisi: {record.technician}</p>
              <p>
                Service Terakhir:{" "}
                {record.lastServiceAt ? new Date(record.lastServiceAt).toLocaleString("id-ID") : "-"}
              </p>
              <p>
                Jadwal Berikut:{" "}
                {record.nextScheduleAt ? new Date(record.nextScheduleAt).toLocaleString("id-ID") : "-"}
              </p>
              {/* <p>Tekanan Freon: {record.freonPressure ?? "-"}</p>
              <p>Suhu Keluar: {record.outletTemp ?? "-"}</p>
              <p>Ampere Kompresor: {record.compressorAmp ?? "-"}</p>
              <p>Kondisi Filter: {record.filterCondition ?? "-"}</p> */}
              <p>
                Terakhir Diperbarui:{" "}
                {record.updatedAt ? new Date(record.updatedAt).toLocaleString("id-ID") : "-"}
              </p>
              {photosToShow && photosToShow.length > 0 && (
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase text-(--depthui-muted)">Foto Unit</p>
                  <div className="grid grid-cols-2 gap-2">
                    {photosToShow.map((photo, index) => (
                      <div key={`${photo.url}-${index}`} className="relative overflow-hidden rounded-2xl border border-black/10">
                        <img
                          src={photo.url}
                          alt={photo.label || record.assetCode}
                          className="h-40 w-full cursor-zoom-in object-cover"
                          loading="lazy"
                          onClick={() => setOpenPhotoIndex(index)}
                        />
                        {photo.label && (
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-white">
                            {photo.label}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {openPhotoIndex !== null && photosToShow && (
                <div
                  className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
                  onClick={() => setOpenPhotoIndex(null)}
                >
                  {(() => {
                    const safeIndex = Math.min(Math.max(openPhotoIndex, 0), Math.max(photosToShow.length - 1, 0));
                    const currentPhoto = photosToShow[safeIndex];
                    const hasPrev = safeIndex > 0;
                    const hasNext = safeIndex < photosToShow.length - 1;
                    if (!currentPhoto) return null;
                    return (
                      <div
                        className="w-full max-w-5xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <a
                            href={currentPhoto.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90"
                          >
                            Buka di tab baru
                          </a>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => hasPrev && setOpenPhotoIndex(safeIndex - 1)}
                              disabled={!hasPrev}
                              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Sebelumnya
                            </button>
                            <button
                              type="button"
                              onClick={() => hasNext && setOpenPhotoIndex(safeIndex + 1)}
                              disabled={!hasNext}
                              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Berikutnya
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenPhotoIndex(null)}
                              className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-white/90"
                            >
                              Tutup
                            </button>
                          </div>
                        </div>
                        <img
                          src={currentPhoto.url}
                          alt={currentPhoto.label || "Foto unit"}
                          className="max-h-[80vh] w-full rounded-2xl object-contain"
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
              {record.signatureUrl && (
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase text-(--depthui-muted)">Signature</p>
                  <img
                    src={record.signatureUrl}
                    alt="Signature"
                    className="h-32 rounded-2xl border border-black/10 object-contain"
                  />
                </div>
              )}
            </DepthCard>

            <DepthCard className="rounded-4xl p-6">
              <p className="text-xs uppercase text-(--depthui-muted)">Parameter Tambahan</p>
              {record.parameters && typeof record.parameters === "object" && Object.keys(record.parameters).length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-[#3f3f3f]">
                  {Object.entries(record.parameters as Record<string, unknown>)
                    .filter(([key]) => !shouldHideParameter(key))
                    .map(([key, value]) => (
                      <li key={key}>
                        <span className="font-semibold text-[#1f1f1f]">{formatParameterLabel(key)}</span>:{" "}
                        {String(value ?? "-")}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-(--depthui-muted)">Tidak ada parameter tambahan.</p>
              )}
            </DepthCard>
          </>
        )}
      </div>
    </div>
  );
}
