import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET } from "@/lib/catalog";
import { updateHeroBanner, type HeroBanner } from "@/lib/hero";
import { useHeroBanner } from "@/hooks/useHero";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

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

type Draft = Pick<
  HeroBanner,
  | "is_active"
  | "eyebrow"
  | "title"
  | "subtitle"
  | "cta_label"
  | "cta_href"
  | "image_alt"
  | "overlay_opacity"
  | "text_align"
  | "storage_path"
  | "image_url"
>;

const AdminHero = () => {
  const { data, isLoading } = useHeroBanner();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft({
      is_active: data.is_active,
      eyebrow: data.eyebrow,
      title: data.title,
      subtitle: data.subtitle,
      cta_label: data.cta_label,
      cta_href: data.cta_href,
      image_alt: data.image_alt,
      overlay_opacity: Number(data.overlay_opacity),
      text_align: data.text_align,
      storage_path: data.storage_path,
      image_url: data.image_url,
    });
    setPreview(data.resolvedImageUrl);
  }, [data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleFile = async (file: File | undefined) => {
    if (!file || !draft) return;
    if (!ACCEPTED.includes(file.type)) return toast.error("Only JPG, PNG or WebP are allowed");
    if (file.size > MAX_BYTES) return toast.error("Image must be under 8MB");
    setUploading(true);
    try {
      const blob = await compress(file, 2000, 0.85);
      const path = `hero/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (error) throw error;
      set("storage_path", path);
      set("image_url", null);
      setPreview(URL.createObjectURL(blob));
      toast.success("Banner image uploaded — remember to save");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!data || !draft) return;
    if (!draft.title.trim()) return toast.error("Title is required");
    if (draft.overlay_opacity < 0 || draft.overlay_opacity > 1)
      return toast.error("Overlay must be between 0 and 1");
    setSaving(true);
    try {
      await updateHeroBanner(data.id, draft);
      await logAudit("update", "hero_banner", data.id, { title: draft.title });
      await queryClient.invalidateQueries({ queryKey: ["hero-banner"] });
      toast.success("Hero banner saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save hero banner");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-light text-foreground">Hero banner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controls the large banner at the top of the landing page.
        </p>
      </div>

      <section className="space-y-4">
        <Label>Banner image</Label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          className="border border-dashed border-border p-8 text-center cursor-pointer"
        >
          <p className="text-sm text-foreground">
            {uploading ? "Uploading…" : "Drop an image here or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG or WebP · up to 8MB · wide landscape crops work best
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? undefined)}
          />
        </div>

        {preview && (
          <div className="relative aspect-[21/9] overflow-hidden border border-border">
            <img src={preview} alt="Hero banner preview" className="w-full h-full object-cover" />
            <div
              className="absolute inset-0 bg-foreground"
              style={{ opacity: draft.overlay_opacity }}
            />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="image_url">Or use an external image URL</Label>
            <Input
              id="image_url"
              value={draft.image_url ?? ""}
              placeholder="https://…"
              onChange={(e) => {
                const value = e.target.value;
                set("image_url", value);
                if (value.trim()) {
                  set("storage_path", null);
                  setPreview(value);
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image_alt">Image alt text</Label>
            <Input
              id="image_alt"
              value={draft.image_alt}
              onChange={(e) => set("image_alt", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="eyebrow">Eyebrow</Label>
            <Input
              id="eyebrow"
              value={draft.eyebrow}
              onChange={(e) => set("eyebrow", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subtitle">Subtitle</Label>
          <Textarea
            id="subtitle"
            rows={2}
            value={draft.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cta_label">Button label</Label>
            <Input
              id="cta_label"
              value={draft.cta_label}
              onChange={(e) => set("cta_label", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cta_href">Button link</Label>
            <Input
              id="cta_href"
              value={draft.cta_href}
              onChange={(e) => set("cta_href", e.target.value)}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="overlay">Overlay darkness (0–1)</Label>
            <Input
              id="overlay"
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={draft.overlay_opacity}
              onChange={(e) => set("overlay_opacity", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="align">Text alignment</Label>
            <select
              id="align"
              value={draft.text_align}
              onChange={(e) => set("text_align", e.target.value)}
              className="w-full h-10 border border-input bg-background px-3 text-sm"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="active"
            checked={draft.is_active}
            onCheckedChange={(checked) => set("is_active", checked)}
          />
          <Label htmlFor="active">Show hero banner on the landing page</Label>
        </div>
      </section>

      <Button onClick={() => void handleSave()} disabled={saving || uploading}>
        {saving ? "Saving…" : "Save hero banner"}
      </Button>
    </div>
  );
};

export default AdminHero;
