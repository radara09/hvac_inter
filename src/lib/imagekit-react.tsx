/* eslint-disable react-refresh/only-export-components */

export class ImageKitAbortError extends Error {
  public reason?: string;
  constructor(message: string, reason?: string) {
    super(message);
    this.name = "ImageKitAbortError";
    this.reason = reason;
  }
}

export class ImageKitInvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageKitInvalidRequestError";
  }
}

export class ImageKitServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageKitServerError";
  }
}

export class ImageKitUploadNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageKitUploadNetworkError";
  }
}

export type UploadOptions = {
  file: File | Blob | string;
  fileName: string;
  token: string;
  signature: string;
  expire: number;
  publicKey: string;
  folder?: string;
  tags?: string[];
  onProgress?: (event: ProgressEvent<EventTarget>) => void;
  abortSignal?: AbortSignal;
};

const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export function upload(options: UploadOptions) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_URL, true);
    xhr.responseType = "json";

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else if (xhr.status >= 400 && xhr.status < 500) {
        reject(
          new ImageKitInvalidRequestError(
            xhr.response?.message ?? "Invalid request"
          )
        );
      } else if (xhr.status >= 500) {
        reject(
          new ImageKitServerError(xhr.response?.message ?? "Server error")
        );
      } else {
        reject(new ImageKitUploadNetworkError("Network error"));
      }
    };

    xhr.onerror = () => reject(new ImageKitUploadNetworkError("Network error"));
    xhr.onabort = () =>
      reject(
        new ImageKitAbortError(
          "Upload aborted",
          options.abortSignal?.reason?.toString()
        )
      );

    if (options.onProgress) {
      xhr.upload.onprogress = options.onProgress;
    }

    if (options.abortSignal) {
      options.abortSignal.addEventListener(
        "abort",
        () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) {
            xhr.abort();
          }
        },
        { once: true }
      );
    }

    const formData = new FormData();
    formData.append("file", options.file);
    formData.append("fileName", options.fileName);
    formData.append("token", options.token);
    formData.append("signature", options.signature);
    formData.append("expire", options.expire.toString());
    formData.append("publicKey", options.publicKey);

    if (options.folder) {
      formData.append("folder", options.folder);
    }
    if (options.tags?.length) {
      formData.append("tags", options.tags.join(","));
    }

    xhr.send(formData);
  });
}

type Transformation = {
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
};

type ImageProps = {
  urlEndpoint: string;
  path?: string;
  src?: string;
  alt?: string;
  transformation?: Transformation[];
  className?: string;
  loading?: "lazy" | "eager";
};

const buildTransformation = (transformation?: Transformation[]) => {
  if (!transformation?.length) {
    return "";
  }
  const parts = transformation.map((trans) =>
    Object.entries(trans)
      .map(([key, value]) => `${key}-${value}`)
      .join(",")
  );
  return `?tr=${parts.join(":")}`;
};

export function Image({
  urlEndpoint,
  path,
  src,
  alt = "",
  transformation,
  className,
  loading,
}: ImageProps) {
  const resolvedSrc = src ?? `${urlEndpoint}${path ?? ""}`;
  const query = buildTransformation(transformation);
  return (
    <img
      src={`${resolvedSrc}${query}`}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
}
