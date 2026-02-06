import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { TextField } from "../components/TextField";
import { DateField } from "../components/DateField";
import { ImageKitUpload, fetchAuthParams, IMAGEKIT_FOLDER } from "../components/ImageKitUpload";
import { upload } from "@imagekit/react";
import { DepthCard } from "../components/DepthUI";
import { QRCodeModal } from "../components/QRComponents";
import { Stage, Layer, Line } from "react-konva";
import type {
  ACRecord,
  AcHistoryEntry,
  SiteRecord,
  UpdateAcPayload,
  AcType,
} from "../types";
import type { KonvaEventObject } from "konva/lib/Node";

type MaintenancePageProps = {
  loading: boolean;
  detailLoading: boolean;
  updateLoading: boolean;
  error: string | null;
  selectedRecord: ACRecord | null;
  history: AcHistoryEntry[];
  onSelect: (id: string | null) => Promise<void> | void;
  onUpdate: (id: string, data: UpdateAcPayload) => Promise<void>;
  sites: SiteRecord[];
  siteError: string | null;
  loadingSites: boolean;
  acTypes: AcType[];
  userRole?: string | null;
  currentUserName?: string | null;
};

const INITIAL_UPDATE: UpdateAcPayload = {
  freonPressure: "",
  outletTemp: "",
  compressorAmp: "",
  filterCondition: "",
  lastCondition: "",
  photoUrl: "",
  signatureUrl: "",
  note: "",
  lastServiceAt: "",
  nextScheduleAt: "",
};

type DrawingTool = "pen" | "eraser";

type DrawingLine = {
  tool: DrawingTool;
  points: number[];
};

const ID_ALIASES = ["id", "id_ac", "asset_code", "kode", "no", "no_asset", "unit_id", "nomor", "nomor_aset", "kode_aset", "kode_barang", "no_inventaris"];

import { forwardRef, useImperativeHandle } from "react";
import Konva from "konva";

const DrawingPad = forwardRef<{ getStage: () => Konva.Stage | null; hasDrawing: () => boolean; clear: () => void }, {}>((_, ref) => {
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [lines, setLines] = useState<DrawingLine[]>([]);
  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    hasDrawing: () => lines.length > 0,
    clear: () => setLines([]),
  }));

  useEffect(() => {
    const updateWidth = () => {
      if (!containerRef.current) return;
      setContainerWidth(containerRef.current.clientWidth);
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const handlePointerDown = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    // Prevent scrolling on touch
    event.evt.preventDefault();
    isDrawing.current = true;
    const stage = event.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;
    setLines((prev) => [...prev, { tool, points: [point.x, point.y] }]);
  };

  const handlePointerMove = (
    event: KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    // Prevent scrolling on touch
    event.evt.preventDefault();
    if (!isDrawing.current) return;
    const stage = event.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;
    setLines((prevLines) => {
      if (!prevLines.length) return prevLines;
      const nextLines = prevLines.slice();
      const lastLine = nextLines[nextLines.length - 1];
      const updatedLine: DrawingLine = {
        ...lastLine,
        points: lastLine.points.concat([point.x, point.y]),
      };
      nextLines[nextLines.length - 1] = updatedLine;
      return nextLines;
    });
  };

  const handlePointerUp = () => {
    isDrawing.current = false;
  };

  const drawingWidth = Math.max(containerWidth - 32, 220);

  return (
    <div
      ref={containerRef}
      className="space-y-3 rounded-2xl border border-black/10 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-(--depthui-muted)">
            Tanda Tangan
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setLines([])} className="text-xs text-rose-500 hover:underline">Clear</button>
          <select
            className="rounded-xl border border-black/10 px-3 py-2 text-sm"
            value={tool}
            onChange={(event) => setTool(event.target.value as DrawingTool)}
          >
            <option value="pen">Pen</option>
            <option value="eraser">Eraser</option>
          </select>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-dashed border-black/10 bg-[#fafafa]">
        <Stage
          ref={stageRef}
          width={drawingWidth}
          height={260}
          onMouseDown={handlePointerDown}
          onMousemove={handlePointerMove}
          onMouseup={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        >
          <Layer>
            {lines.map((line, index) => (
              <Line
                key={`line-${index}`}
                points={line.points}
                stroke="#df4b26"
                strokeWidth={4}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === "eraser" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

export function MaintenancePage({
  loading,
  detailLoading,
  updateLoading,
  error,
  selectedRecord,
  history,
  onSelect,
  onUpdate,
  sites,
  siteError,
  loadingSites,
  acTypes,
  userRole,
  currentUserName,
}: MaintenancePageProps) {
  const params = useParams<{ id: string }>();
  const [form, setForm] = useState<UpdateAcPayload>(INITIAL_UPDATE);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acType, setAcType] = useState<AcType | null>(null);
  const selectedRecordId = selectedRecord?.id ?? null;
  const drawingPadRef = useRef<{ getStage: () => Konva.Stage | null; hasDrawing: () => boolean; clear: () => void }>(null);
  const [showQR, setShowQR] = useState(false);

  // Multi-Photo State
  const [uploadedPhotos, setUploadedPhotos] = useState<{ url: string; label: string }[]>([]);
  const [photoLabel, setPhotoLabel] = useState("Kondisi");

  const normalizeCellToken = (token: string) => token.replace(/\$/g, "").toUpperCase();

  const formatComputedValue = (
    format: string,
    params: Record<string, string>,
    fields: AcType["fields"]
  ) => {
    const cellMap = new Map<string, string>();
    fields.forEach(f => {
      if (f.cell) {
        cellMap.set(normalizeCellToken(f.cell), f.key);
      }
    });
    return format.replace(/\{([^}]+)\}/g, (_, rawToken) => {
      const token = String(rawToken || "").trim();
      if (!token) return "";
      if (params[token]) return params[token];
      const mappedKey = cellMap.get(normalizeCellToken(token));
      return mappedKey ? params[mappedKey] || "" : "";
    });
  };

  const addPhoto = (url: string) => {
    setUploadedPhotos(prev => {
        const newState = [...prev, { url, label: photoLabel }];
        // Auto-set main photo if empty
        if (!form.photoUrl) {
            setForm(f => ({ ...f, photoUrl: url }));
        }
        return newState;
    });
  };

  const serializePhotos = (photos: { url: string; label: string }[]) => {
    return photos
      .map(photo => `${photo.label}: ${photo.url}`)
      .join("\n");
  };

  const removePhoto = (index: number) => {
    setUploadedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (selectedRecord) {
      setForm({
        freonPressure: selectedRecord.freonPressure ?? "",
        outletTemp: selectedRecord.outletTemp ?? "",
        compressorAmp: selectedRecord.compressorAmp ?? "",
        filterCondition: selectedRecord.filterCondition ?? "",
        lastCondition: selectedRecord.lastCondition ?? "",
        lastServiceAt: selectedRecord.lastServiceAt?.slice(0, 10) ?? "",
        nextScheduleAt: selectedRecord.nextScheduleAt?.slice(0, 10) ?? "",
        photoUrl: selectedRecord.photoUrl ?? "",
        signatureUrl: selectedRecord.signatureUrl ?? "",
        note: "",
        parameters: selectedRecord.parameters ? (typeof selectedRecord.parameters === 'string' ? JSON.parse(selectedRecord.parameters) : selectedRecord.parameters) : {},
      });
      setUploadedPhotos([]); // Reset photos for new session

      // Determine AC Type
      const site = sites.find(s => s.id === selectedRecord.siteId);
      const sheet = site?.sheetsList?.find(sl => sl.sheetName === selectedRecord.sheetName);
      if (sheet?.acTypeId) {
        const type = acTypes.find(t => t.id === sheet.acTypeId);
        setAcType(type || null);

        // Handle Autofill Fields (Set to current time)
        if (type) {
          setForm(prev => {
            const nextParams = { ...(prev.parameters as Record<string, string> ?? {}) };
            let changed = false;
            type.fields.forEach(f => {
              if (f.autofill) {
                if (f.autofillType === "user") {
                  if (currentUserName && !nextParams[f.key]) {
                    nextParams[f.key] = currentUserName;
                    changed = true;
                  }
                } else {
                  if (!nextParams[f.key]) {
                    nextParams[f.key] = new Date().toISOString().slice(0, 10);
                    changed = true;
                  }
                }
              } else if (f.inputType === "date" && f.readonly && !nextParams[f.key]) {
                nextParams[f.key] = new Date().toISOString().slice(0, 10);
                changed = true;
              }
            });
            return changed ? { ...prev, parameters: nextParams } : prev;
          });
        }
      } else {
        setAcType(null);
      }
    } else {
      setForm(INITIAL_UPDATE);
      setUploadedPhotos([]);
      setAcType(null);
    }
  }, [selectedRecord, sites, acTypes]);

  useEffect(() => {
    if (!params.id) {
      void onSelect(null);
      return;
    }
    if (selectedRecordId === params.id) {
      return;
    }
    void onSelect(params.id);
  }, [params.id, onSelect, selectedRecordId]);
  const siteMap = useMemo(() => {
    return new Map(sites.map((site) => [site.id, site.name ?? site.id]));
  }, [sites]);

  const handleParamChange = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      parameters: {
        ...(prev.parameters as Record<string, string> ?? {}),
        [key]: value,
      }
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRecord) return;
    setSubmitError(null);

    let finalSignatureUrl = form.signatureUrl;

    if (drawingPadRef.current?.hasDrawing()) {
      const stage = drawingPadRef.current.getStage();
      if (stage) {
        try {
          const dataUrl = stage.toDataURL({ pixelRatio: 2 });
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `signature-${Date.now()}.png`, { type: "image/png" });

          const authParams = await fetchAuthParams();
          const uploadResponse = await upload({
            file,
            fileName: file.name,
            expire: authParams.expire,
            token: authParams.token,
            signature: authParams.signature,
            publicKey: authParams.publicKey,
            folder: IMAGEKIT_FOLDER,
          });

          if (uploadResponse && typeof uploadResponse === "object" && "url" in uploadResponse) {
            finalSignatureUrl = (uploadResponse as { url?: string }).url;
          }
        } catch (err) {
          console.error("Failed to upload signature", err);
          setSubmitError("Gagal mengunggah tanda tangan");
          return;
        }
      }
    }

    // Auto-tag hidden fields (e.g. map signature to 'ttd' column if defined)
    const nextParams = { ...(form.parameters || {}) };
    if (acType) {
        acType.fields.forEach(f => {
            if (f.hidden) {
                if (f.inputType === "signature" && finalSignatureUrl) {
                    nextParams[f.key] = finalSignatureUrl;
                } else if (f.inputType === "image") {
                    const keyLower = f.key.toLowerCase();
                    const isPhotoField = ["foto_url", "photo_url", "foto", "photo"].includes(keyLower);
                    if (isPhotoField) {
                        if (uploadedPhotos.length > 0) {
                            nextParams[f.key] = serializePhotos(uploadedPhotos);
                        } else if (form.photoUrl) {
                            nextParams[f.key] = form.photoUrl;
                        }
                    }
                }
            }
        });
    }

    try {
      await onUpdate(selectedRecord.id, {
        ...form,
        signatureUrl: finalSignatureUrl,
        lastServiceAt: form.lastServiceAt
          ? new Date(form.lastServiceAt).toISOString()
          : new Date().toISOString(),
        nextScheduleAt: form.nextScheduleAt
          ? new Date(form.nextScheduleAt).toISOString()
          : undefined,
        photos: uploadedPhotos,
        parameters: nextParams,
      });
      setForm((prev) => ({ ...prev, note: "" }));
      drawingPadRef.current?.clear();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Gagal memperbarui data"
      );
    }
  };

  return (
    <section className="space-y-6 text-[#1f1f1f]">
      <DepthCard className="rounded-4xl p-6">
        <div className="flex items-center gap-3">
          <Link
            to="/maintenance"
            aria-label="Kembali ke pencarian"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#1f1f1f] transition hover:border-black/40"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div>
            <p className="text-xs uppercase text-(--depthui-muted)">AC Maintenance</p>
            <h2 className="text-2xl font-semibold">Detail &amp; Pembaruan</h2>
          </div>
        </div>
        {loading && <p className="mt-4 text-sm text-(--depthui-muted)">Memuat data AC…</p>}
        {error && <p className="mt-4 text-sm text-rose-500">{error}</p>}
        {siteError && <p className="mt-2 text-sm text-amber-600">{siteError}</p>}
        {loadingSites && <p className="mt-2 text-xs text-(--depthui-muted)">Memuat data site…</p>}
      </DepthCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DepthCard className="space-y-4 rounded-4xl p-6">
          <p className="text-xs uppercase text-(--depthui-muted)">
            Detail Unit
          </p>
          {detailLoading && (
            <p className="text-sm text-(--depthui-muted)">Memuat detail…</p>
          )}
          {!selectedRecord && !detailLoading && (
            <p className="text-sm text-(--depthui-muted)">
              Pilih unit untuk melihat detail.
            </p>
          )}
          {selectedRecord && (
            <div className="space-y-3 text-sm text-[#3f3f3f]">
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-xs uppercase text-(--depthui-muted)">
                  Identitas
                </p>
                <p className="text-lg font-semibold text-[#1f1f1f]">
                  {selectedRecord.assetCode}
                </p>
                <p>{selectedRecord.location}</p>
                <p>
                  Site:{" "}
                  {siteMap.get(selectedRecord.siteId) ?? selectedRecord.siteId}
                </p>
                <p>Merek: {selectedRecord.brand}</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-xs uppercase text-(--depthui-muted)">
                  Status
                </p>
                <p>Kondisi: {selectedRecord.lastCondition}</p>
                <p>Teknisi terakhir: {selectedRecord.technician}</p>
                <p>
                  Servis terakhir:{" "}
                  {new Date(selectedRecord.lastServiceAt).toLocaleDateString()}
                </p>
                <p>
                  Jadwal berikut:{" "}
                  {new Date(selectedRecord.nextScheduleAt).toLocaleDateString()}
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase text-(--depthui-muted)">Foto Unit</p>
                  <button
                    type="button"
                    onClick={() => setShowQR(true)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[#5a5a5a] hover:bg-gray-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <path d="M3 14h1v7h6v-1" />
                    </svg>
                    Show QR
                  </button>
                </div>
              </div>
              <QRCodeModal
                isOpen={showQR}
                onClose={() => setShowQR(false)}
                // data={`${typeof window !== 'undefined' ? window.location.origin : ''}/maintenance/${selectedRecord.id}`}
                data={`${typeof window !== 'undefined' ? window.location.origin : ''}/guest/maintenance/${selectedRecord.id}`}
                title={selectedRecord.assetCode}
              />
              {selectedRecord.photoUrl && (
                <img
                  src={selectedRecord.photoUrl}
                  alt={selectedRecord.assetCode}
                  className="w-full rounded-2xl border border-black/10 object-cover"
                />
              )}
              {selectedRecord.signatureUrl && (
                <div className="rounded-2xl border border-black/10 bg-white p-4">
                  <p className="mb-2 text-xs uppercase text-(--depthui-muted)">Tanda Tangan Terakhir</p>
                  <img
                    src={selectedRecord.signatureUrl}
                    alt="Signature"
                    className="h-32 object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </DepthCard>

        <DepthCard className="rounded-4xl p-6">
          <p className="text-xs uppercase text-(--depthui-muted)">
            Perbarui Kondisi
          </p>
          {!selectedRecord ? (
            <p className="mt-4 text-sm text-(--depthui-muted)">
              Pilih unit untuk memperbarui data.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                Kondisi Terakhir
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500"
                    value={form.lastCondition ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        lastCondition: event.target.value,
                      }))
                    }
                    disabled={userRole === "viewer"}
                  >
                    <option value="" disabled>
                      Pilih Kondisi
                    </option>
                    <option value="Baik">Baik</option>
                    <option value="Bermasalah">Bermasalah</option>
                    {form.lastCondition &&
                      !["Baik", "Bermasalah"].includes(form.lastCondition) && (
                        <option value={form.lastCondition}>
                          {form.lastCondition}
                        </option>
                      )}
                  </select>
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9b9b9b]">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </label>
              {acType ? (
                acType.fields.map(field => {
                    const key = field.key.toLowerCase();
                    if (field.isId || ID_ALIASES.includes(key)) return null;
                    if (field.hidden) return null; // Hidden fields are handled automatically

                    const isNextSchedule = ["service_berikutnya", "next_service", "jadwal_berikutnya", "next_schedule_at"].some(k => key.includes(k));
                    const isLastService = ["service_terakhir", "last_service", "tanggal_service", "last_service_at"].some(k => key.includes(k));

                    let val = (form.parameters as Record<string, string>)?.[field.key] ?? "";
                    if (isNextSchedule) val = form.nextScheduleAt ?? "";
                    else if (isLastService) val = form.lastServiceAt ?? "";

                    const handleChange = (newValue: string) => {
                        if (isNextSchedule) {
                            setForm(prev => ({ ...prev, nextScheduleAt: newValue }));
                        } else if (isLastService) {
                            setForm(prev => ({ ...prev, lastServiceAt: newValue }));
                        } else {
                            handleParamChange(field.key, newValue);
                        }
                    };

                    if (field.inputType === "select") {
                        return (
                            <label key={field.key} className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
                                {field.label}
                                <div className="relative">
                                    <select
                                        className="w-full appearance-none rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0 disabled:bg-gray-50 disabled:text-gray-500"
                                        value={val}
                                        onChange={(e) => handleChange(e.target.value)}
                                        disabled={userRole === "viewer" || field.readonly}
                                    >
                                        <option value="">Pilih {field.label}</option>
                                        {(field.options || []).map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9b9b9b]">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polyline points="6 9 12 15 18 9" /></svg>
                                    </div>
                                </div>
                            </label>
                        );
                    }

                    if (field.inputType === "date" || field.inputType === "datetime") {
                        return (
                            <DateField
                                key={field.key}
                                label={field.label}
                                value={val}
                                onChange={handleChange}
                                required={false}
                                disabled={userRole === "viewer" || field.readonly}
                                type={field.inputType === "datetime" ? "datetime-local" : "date"}
                            />
                        );
                    }

                    if (field.inputType === "computed") {
                        const computedVal = formatComputedValue(
                          field.format || "",
                          (form.parameters as Record<string, string>) || {},
                          acType.fields
                        );
                        return (
                            <TextField
                                key={field.key}
                                label={field.label}
                                value={computedVal}
                                onChange={() => {}}
                                disabled
                            />
                        );
                    }

                    // Fallback to text (or image if explicitly set visible)
                    if (field.inputType === "image" || field.isImage) {
                        return (
                            <div key={field.key}>
                                <p className="text-xs font-semibold text-(--depthui-muted) mb-1.5">{field.label}</p>
                                {val ? (
                                    <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-black/10 group">
                                        <img src={val} alt={field.label} className="w-full h-full object-cover" />
                                        {userRole !== "viewer" && (
                                            <button
                                                type="button"
                                                onClick={() => handleChange("")}
                                                className="absolute top-1 right-1 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <ImageKitUpload
                                        variant="compact"
                                        onUploadComplete={(url) => handleChange(url)}
                                    />
                                )}
                            </div>
                        );
                    }

                    return (
                        <TextField
                            key={field.key}
                            label={field.label}
                            value={val}
                            onChange={(value) => handleChange(value)}
                            disabled={userRole === "viewer" || field.readonly}
                        />
                    );
                })
              ) : (
                <>
                  <TextField
                    label="Tekanan Freon"
                    value={form.freonPressure ?? ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, freonPressure: value }))
                    }
                    disabled={userRole === "viewer"}
                  />
                  <TextField
                    label="Suhu Keluar"
                    value={form.outletTemp ?? ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, outletTemp: value }))
                    }
                    disabled={userRole === "viewer"}
                  />
                  <TextField
                    label="Ampere Kompresor"
                    value={form.compressorAmp ?? ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, compressorAmp: value }))
                    }
                    disabled={userRole === "viewer"}
                  />
                  <TextField
                    label="Kondisi Filter"
                    value={form.filterCondition ?? ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, filterCondition: value }))
                    }
                    disabled={userRole === "viewer"}
                  />
                </>
              )}
              <DateField
                label="Service Terakhir"
                value={form.lastServiceAt ?? ""}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, lastServiceAt: value }))
                }
                required
                disabled={userRole === "viewer"}
              />
              <TextField
                label="Catatan"
                value={form.note ?? ""}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, note: value }))
                }
                placeholder="Catatan teknisi"
                disabled={userRole === "viewer"}
              />

              {/* Foto Utama removed as requested */}
              {/* Removed redundant block */}

              {userRole !== "viewer" && (
                <div className="space-y-4 rounded-2xl border border-black/10 bg-white p-3">
                  {/* Multi Photos */}
                  <div className="pt-1">
                    <p className="text-xs font-semibold text-(--depthui-muted) mb-2">Dokumentasi Pengerjaan</p>
                    <div className="flex gap-2 mb-2">
                      <select
                        className="text-xs rounded-lg border border-black/10 px-2 py-1 bg-white"
                        value={photoLabel}
                        onChange={(e) => setPhotoLabel(e.target.value)}
                      >
                        <option value="Kondisi">Kondisi</option>
                        <option value="Before">Before</option>
                        <option value="Progress">Progress</option>
                        <option value="After">After</option>
                      </select>
                      <div className="flex-1">
                        <ImageKitUpload
                          variant="compact"
                          onUploadComplete={(url) => addPhoto(url)}
                        />
                      </div>
                    </div>

                    {/* Preview List */}
                    {uploadedPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {uploadedPhotos.map((p, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-black/10 aspect-square">
                            <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate text-center">
                              {p.label}
                            </div>
                            <button
                              type="button"
                              onClick={() => removePhoto(idx)}
                              className="absolute top-1 right-1 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-sm text-rose-500">{submitError}</p>
              )}

              {userRole !== "viewer" && (
                <DrawingPad ref={drawingPadRef} />
              )}

              {userRole !== "viewer" && (
                <button
                  type="submit"
                  disabled={updateLoading}
                  className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80 disabled:opacity-60"
                >
                  {updateLoading ? "Menyimpan…" : "Simpan Pembaruan"}
                </button>
              )}
            </form>
          )}
        </DepthCard>
      </div >

      <DepthCard className="rounded-4xl p-6">
        <p className="text-xs uppercase text-(--depthui-muted)">
          Riwayat Perubahan
        </p>
        {detailLoading && (
          <p className="mt-4 text-sm text-(--depthui-muted)">Memuat riwayat…</p>
        )}
        {!history.length && !detailLoading && (
          <p className="mt-4 text-sm text-(--depthui-muted)">
            Belum ada riwayat untuk unit ini.
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-[#3f3f3f]"
            >
              <div className="flex flex-col gap-1 text-[#1f1f1f]">
                <span className="text-xs text-(--depthui-muted)">
                  {new Date(entry.createdAt).toLocaleString("id-ID")}
                </span>
                <span className="text-sm font-semibold">
                  {entry.userName ?? "Teknisi"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {entry.changes.map((change) => {
                  if (change.field === "parameters") {
                    let prev: any = change.previous;
                    let curr: any = change.current;

                    try {
                      if (typeof prev === "string") prev = JSON.parse(prev);
                    } catch {}
                    try {
                      if (typeof curr === "string") curr = JSON.parse(curr);
                    } catch {}

                    const prevObj = typeof prev === "object" && prev ? prev : {};
                    const currObj = typeof curr === "object" && curr ? curr : {};

                    const allKeys = Array.from(
                      new Set([
                        ...Object.keys(prevObj),
                        ...Object.keys(currObj),
                      ])
                    );
                    
                    const normalize = (v: any) => {
                        if (v === null || v === undefined || v === "" || v === "-") return null;
                        return String(v).trim();
                    };

                    const diffKeys = allKeys.filter(
                      (k) => {
                          const p = normalize(prevObj[k]);
                          const c = normalize(currObj[k]);
                          return p !== c && (p !== null || c !== null);
                      }
                    );

                    if (diffKeys.length === 0) return null;

                    return (
                      <li key={`${entry.id}-${change.field}`}>
                        <div className="font-semibold text-[#1f1f1f]">
                          Perubahan Parameter:
                        </div>
                        <ul className="list-disc pl-4 text-[#3f3f3f]">
                          {diffKeys.map((k) => (
                            <li key={k}>
                              <span className="font-medium">{k}:</span>{" "}
                              {String(prevObj[k] ?? "-")} →{" "}
                              {String(currObj[k] ?? "-")}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  }

                  let prevVal = change.previous;
                  let currVal = change.current;

                  if (typeof prevVal === "object" && prevVal !== null) {
                    prevVal = JSON.stringify(prevVal);
                  }
                  if (typeof currVal === "object" && currVal !== null) {
                    currVal = JSON.stringify(currVal);
                  }
                  
                  const normalize = (v: any) => {
                      if (v === null || v === undefined || v === "" || v === "-") return null;
                      return String(v).trim();
                  };
                  
                  if (normalize(prevVal) === null && normalize(currVal) === null) {
                      return null;
                  }

                  return (
                    <li key={`${entry.id}-${change.field}`}>
                      <span className="font-semibold text-[#1f1f1f]">
                        {change.field}
                      </span>
                      : {String(prevVal ?? "-")} → {String(currVal ?? "-")}
                    </li>
                  );
                })}
              </ul>
              {entry.photos && entry.photos.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-(--depthui-muted)">Dokumentasi</p>
                  <div className="flex flex-wrap gap-2">
                    {entry.photos.map((p, idx) => (
                      <a key={idx} href={p.url} target="_blank" rel="noreferrer" className="block w-16 h-16 rounded overflow-hidden border border-black/10 relative group">
                        <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                        <div className="absolute inset-x-0 bottom-0 bg-black/50 text-white text-[8px] px-1 truncate text-center">
                          {p.label}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {entry.note && (
                <p className="mt-2 text-xs italic text-[#1f1f1f]">
                  {entry.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      </DepthCard>
    </section >
  );
}
