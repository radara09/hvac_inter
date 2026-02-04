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
  const loginHref = useMemo(() => {
    if (!id) return "/?redirect=/maintenance";
    return `/?redirect=/maintenance/${encodeURIComponent(id)}`;
  }, [id]);

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
              className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80"
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
              <p>Tekanan Freon: {record.freonPressure ?? "-"}</p>
              <p>Suhu Keluar: {record.outletTemp ?? "-"}</p>
              <p>Ampere Kompresor: {record.compressorAmp ?? "-"}</p>
              <p>Kondisi Filter: {record.filterCondition ?? "-"}</p>
              <p>
                Terakhir Diperbarui:{" "}
                {record.updatedAt ? new Date(record.updatedAt).toLocaleString("id-ID") : "-"}
              </p>
              {record.photoUrl && (
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase text-(--depthui-muted)">Foto Unit</p>
                  <img
                    src={record.photoUrl}
                    alt={record.assetCode}
                    className="w-full rounded-2xl border border-black/10 object-cover"
                  />
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
