import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET } from "@/lib/catalog";

export interface DraftImage {
  id?: string;
  previewUrl: string;
  storagePath?: string | null;
  assetKey?: string | null;
  url?: string | null;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Downscale + re-encode to WebP so uploads stay small. */
const compress = (file: File, maxSize: number, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
          "image/webp",
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

interface Props {
  productSlug: string;
  images: DraftImage[];
  onChange: (images: DraftImage[]) => void;
}

const ProductImageUploader = ({ productSlug, images, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setBusy(true);
      const added: DraftImage[] = [];
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name}: only JPG, PNG or WebP are allowed`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: must be under 8MB`);
          continue;
        }
        try {
          const full = await compress(file, 1600, 0.82);
          const thumb = await compress(file, 400, 0.75);
          const base = `${productSlug || "product"}/${crypto.randomUUID()}`;
          const fullPath = `${base}.webp`;
          const thumbPath = `${base}-thumb.webp`;
          const [fullUpload] = await Promise.all([
            supabase.storage.from(PRODUCT_BUCKET).upload(fullPath, full, {
              contentType: "image/webp",
              upsert: false,
            }),
            supabase.storage.from(PRODUCT_BUCKET).upload(thumbPath, thumb, {
              contentType: "image/webp",
              upsert: false,
            }),
          ]);
          if (fullUpload.error) throw fullUpload.error;
          added.push({ previewUrl: URL.createObjectURL(full), storagePath: fullPath });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Upload failed");
        }
      }
      if (added.length > 0) onChange([...images, ...added]);
      setBusy(false);
    },
    [images, onChange, productSlug],
  );

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`border border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragging ? "border-foreground bg-muted/40" : "border-border"
        }`}
      >
        <p className="text-sm text-foreground">
          {busy ? "Uploading…" : "Drop images here or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG or WebP · up to 8MB · compressed with a thumbnail on upload
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div
              key={`${image.previewUrl}-${index}`}
              className={`relative group cursor-grab ${dragIndex === index ? "opacity-50" : ""}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragIndex === null || dragIndex === index) return;
                const next = images.slice();
                const [moved] = next.splice(dragIndex, 1);
                next.splice(index, 0, moved);
                setDragIndex(null);
                onChange(next);
              }}
            >
              <img
                src={image.previewUrl}
                alt={`Product image ${index + 1}`}
                className="w-full aspect-square object-cover pointer-events-none"
              />
              <span className="absolute bottom-1 left-1 text-[0.6rem] bg-background/80 px-1">
                {index === 0 ? "Primary" : index === 1 ? "Hover" : index + 1}
              </span>
              <button
                type="button"
                aria-label="Remove image"
                className="absolute top-1 right-1 bg-background/90 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onChange(images.filter((_, i) => i !== index))}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {images.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Drag the tiles to reorder. First image is the card thumbnail, second is the hover image.
        </p>
      )}
    </div>
  );
};

export default ProductImageUploader;
