import {
  Image,
  ImageKitAbortError,
  ImageKitInvalidRequestError,
  ImageKitServerError,
  ImageKitUploadNetworkError,
  upload,
} from "@imagekit/react";
import { useRef, useState } from "react";
import { DepthCard } from "./DepthUI";

const IMAGEKIT_URL_ENDPOINT = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT as
  | string
  | undefined;
export const IMAGEKIT_FOLDER = import.meta.env.VITE_IMAGEKIT_FOLDER ?? "/rsud";

export async function fetchAuthParams() {
  const response = await fetch("/api/imagekit/auth", {
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`ImageKit auth failed (${response.status}): ${message}`);
  }

  return response.json() as Promise<{
    signature: string;
    expire: number;
    token: string;
    publicKey: string;
  }>;
}

type ImageKitUploadProps = {
  onUploadComplete?: (url: string) => void;
  variant?: "full" | "compact";
};

export function ImageKitUpload({
  onUploadComplete,
  variant = "full",
}: ImageKitUploadProps) {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortController = new AbortController();

  const handleUpload = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) {
      alert("Select a file first.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress(0);

    let authParams;
    try {
      authParams = await fetchAuthParams();
    } catch (authErr) {
      setError(
        authErr instanceof Error ? authErr.message : "Failed to authenticate"
      );
      setIsUploading(false);
      return;
    }

    try {
      const uploadResponse = await upload({
        file: fileInput.files[0],
        fileName: fileInput.files[0].name,
        expire: authParams.expire,
        token: authParams.token,
        signature: authParams.signature,
        publicKey: authParams.publicKey,
        folder: IMAGEKIT_FOLDER,
        onProgress: (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            setProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
        abortSignal: abortController.signal,
      });
      if (
        onUploadComplete &&
        uploadResponse &&
        typeof uploadResponse === "object" &&
        "url" in uploadResponse
      ) {
        const url = (uploadResponse as { url?: string }).url;
        if (url) {
          onUploadComplete(url);
        }
      }
    } catch (uploadErr) {
      if (uploadErr instanceof ImageKitAbortError) {
        setError("Upload aborted");
      } else if (
        uploadErr instanceof ImageKitInvalidRequestError ||
        uploadErr instanceof ImageKitServerError ||
        uploadErr instanceof ImageKitUploadNetworkError
      ) {
        setError(uploadErr.message);
      } else if (uploadErr instanceof Error) {
        setError(uploadErr.message);
      } else {
        setError("Unknown upload error");
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (variant === "compact") {
    return (
      <div className="space-y-3 text-sm text-[#3f3f3f]">
        <label className="flex flex-col gap-1 text-xs text-(--depthui-muted)">
          Pilih foto AC
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-[#1f1f1f]"
          />
        </label>
        {isUploading && (
          <p className="text-xs text-(--depthui-muted)">Mengunggah...</p>
        )}
        <div className="text-xs text-(--depthui-muted)">
          <div className="flex items-center justify-between">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-black/10">
            <div
              className="h-1.5 rounded-full bg-black transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-xl border border-rose-200/50 bg-rose-100 px-3 py-2 text-xs text-rose-900">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <DepthCard className="rounded-4xl p-6 text-[#1f1f1f]">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4">
        <p className="text-xs uppercase text-(--depthui-muted)">Assets</p>
        <h2 className="text-2xl font-semibold">Media Uploads</h2>
        <p className="text-sm text-(--depthui-muted)">
          Generate ImageKit signatures on the edge and upload files directly
          from the browser.
        </p>
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex flex-col gap-2 text-sm text-(--depthui-muted)">
          <span className="text-[#1f1f1f]">Pick a file</span>
          <input
            ref={fileInputRef}
            type="file"
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[#1f1f1f] placeholder:text-[#9b9b9b] focus:border-black focus:ring-0"
          />
        </label>
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full rounded-2xl bg-black px-4 py-3 text-base font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
        >
          {isUploading ? "Uploading…" : "Upload via ImageKit"}
        </button>
        <div className="text-sm text-(--depthui-muted)">
          <div className="mb-1 flex items-center justify-between">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-black/10">
            <div
              className="h-2 rounded-full bg-black transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {error && (
          <p className="rounded-2xl border border-rose-200/50 bg-rose-100 px-4 py-2 text-sm text-rose-900">
            {error}
          </p>
        )}
      </div>

      {IMAGEKIT_URL_ENDPOINT && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="mb-2 text-xs uppercase text-emerald-300">Preview</p>
          <p className="text-white/70">
            Rendering sample asset from your ImageKit account:
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
            <Image
              urlEndpoint={IMAGEKIT_URL_ENDPOINT}
              path="/default-image.jpg"
              alt="Sample"
              transformation={[{ height: 280, width: 560 }]}
              className="h-48 w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </DepthCard>
  );
}
