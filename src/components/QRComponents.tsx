import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DepthCard } from "./DepthUI";

type QRCodeModalProps = {
    isOpen: boolean;
    onClose: () => void;
    data: string;
    title?: string;
};

export function QRCodeModal({ isOpen, onClose, data, title = "QR Code" }: QRCodeModalProps) {
    const [qrUrl, setQrUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && data) {
            QRCode.toDataURL(data, { width: 400, margin: 2 })
                .then((url) => setQrUrl(url))
                .catch((err) => console.error(err));
        }
    }, [isOpen, data]);

    if (!isOpen) return null;

    const handleDownload = () => {
        if (!qrUrl) return;
        const link = document.createElement("a");
        // Simple PNG download for now. PDF would require jsPDF or printing.
        // Since user accepted "png or pdf", PNG is sufficient for the button.
        link.href = qrUrl;
        link.download = `qrcode-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 transition-opacity">
            <div
                className="fixed inset-0"
                onClick={onClose}
                aria-hidden="true"
            />
            <DepthCard className="relative z-10 w-full max-w-sm rounded-[32px] bg-white p-6 shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-full p-2 text-gray-500 hover:bg-gray-100"
                >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm text-gray-500">Scan untuk melihat detail</p>

                    <div className="mt-6 flex justify-center rounded-2xl bg-white p-4">
                        {qrUrl ? (
                            <img src={qrUrl} alt="QR Code" className="h-64 w-64 object-contain" />
                        ) : (
                            <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
                                Generating...
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={() => handleDownload()}
                            className="flex-1 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                            disabled={!qrUrl}
                        >
                            Download PNG
                        </button>
                    </div>
                </div>
            </DepthCard>
        </div>
    );
}

type QRScannerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onScan: (result: string) => void;
};

export function QRScannerModal({ isOpen, onClose, onScan }: QRScannerModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const codeReader = new BrowserMultiFormatReader();
        let controls: any;

        const startScanning = async () => {
            try {
                setScanError(null);
                controls = await codeReader.decodeFromVideoDevice(
                    undefined,
                    videoRef.current!,
                    (result) => {
                        if (result) {
                            onScan(result.getText());
                        }
                    }
                );
            } catch (err: any) {
                console.error(err);
                setScanError("Gagal mengakses kamera. Pastikan izin diberikan.");
            }
        };

        startScanning();

        return () => {
            if (controls) {
                controls.stop();
            }
        };
    }, [isOpen, onScan]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 transition-opacity">
            <div
                className="fixed inset-0"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] bg-black shadow-2xl ring-1 ring-white/10">
                <button
                    onClick={onClose}
                    type="button"
                    className="absolute right-4 top-4 z-20 rounded-full bg-black/50 p-2 text-white backdrop-blur-md hover:bg-white/20"
                >
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className="relative aspect-[3/4] w-full bg-black">
                    <video
                        ref={videoRef}
                        className="h-full w-full object-cover"
                    />
                    {/* Overlay Guide */}
                    <div className="absolute inset-0 border-[40px] border-black/50">
                        <div className="h-full w-full border-2 border-white/50 relative">
                            <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white"></div>
                            <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white"></div>
                            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white"></div>
                            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white"></div>
                        </div>
                    </div>
                    {scanError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">
                            <p>{scanError}</p>
                        </div>
                    )}
                </div>

                <div className="bg-black p-6 text-center">
                    <p className="text-sm font-medium text-white/70">Arahkan kamera ke QR Code</p>
                </div>
            </div>
        </div>
    );
}
