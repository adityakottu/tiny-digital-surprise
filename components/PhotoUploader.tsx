"use client";

import { useEffect, useState } from "react";

export default function PhotoUploader({
  onChange,
  max = 20,
  cartoonize = false,
  onCartoonizeChange,
}: {
  onChange: (files: File[]) => void;
  max?: number;
  /** Whether the "apply cartoon filter" toggle is on — drives the live preview. */
  cartoonize?: boolean;
  onCartoonizeChange?: (value: boolean) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    onChange(files);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function addFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const combined = [...files, ...Array.from(newFiles)].slice(0, max);
    setFiles(combined);
  }

  function removeAt(i: number) {
    setFiles(files.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="block rounded-xl border-2 border-dashed border-ink/20 p-6 text-center cursor-pointer hover:border-rose transition-colors">
        <span className="text-sm text-ink/60">
          {files.length === 0
            ? `Tap to add photos (up to ${max})`
            : `${files.length} photo${files.length > 1 ? "s" : ""} added — tap to add more`}
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>

      {previews.length > 0 && (
        <>
          {onCartoonizeChange && (
            <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-ink/[0.03] border border-ink/10 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cartoonize}
                onChange={(e) => onCartoonizeChange(e.target.checked)}
                className="mt-0.5 accent-rose"
              />
              <span className="text-sm text-ink/70">
                <span className="font-semibold text-ink">✨ Apply cartoon filter</span> — restyles
                these into flat-color, ink-outlined cartoon portraits before
                they go into the surprise. Free, no signup, done on our
                server — this preview shows a lighter approximation; the
                real effect (below) is stronger.
              </span>
            </label>
          )}

          <div className="mt-4 grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative aspect-square rounded-lg overflow-hidden group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className={`h-full w-full object-cover ${cartoonize ? "cartoon-sample-preview" : ""}`}
                />
                {cartoonize && (
                  <span className="absolute bottom-1 left-1 right-1 text-center text-[9px] leading-tight rounded bg-ink/70 text-white px-1 py-0.5">
                    rough preview
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {cartoonize && (
            <p className="mt-2 text-xs text-ink/50">
              This is a quick CSS approximation. The actual cartoon filter
              (flat colors + drawn outlines) is applied after you submit.
            </p>
          )}
        </>
      )}

      <style jsx>{`
        .cartoon-sample-preview {
          filter: saturate(1.55) contrast(1.08) brightness(1.05) sepia(0.08) hue-rotate(-6deg);
        }
      `}</style>
    </div>
  );
}
