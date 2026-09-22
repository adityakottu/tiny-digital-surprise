"use client";

import { useEffect, useState } from "react";

export default function PhotoUploader({
  onChange,
  max = 20,
}: {
  onChange: (files: File[]) => void;
  max?: number;
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
            ? "Tap to add photos (up to 20)"
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
        <div className="mt-4 grid grid-cols-4 gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative aspect-square rounded-lg overflow-hidden group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
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
      )}
    </div>
  );
}
