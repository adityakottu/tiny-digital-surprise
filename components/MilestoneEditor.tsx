"use client";

import { useRef } from "react";
import {
  DEFAULT_MILESTONES,
  MAX_MILESTONES,
  MAX_TEXT,
  MAX_TITLE,
  milestoneId,
  type Milestone,
} from "@/lib/milestones";

/** A milestone as the form holds it: the photo is a File until it is sent. */
export interface DraftMilestone extends Omit<Milestone, "photo"> {
  photoFile?: File | null;
  /** An object URL for the preview; revoked when the row's photo changes. */
  photoPreview?: string | null;
}

export function defaultDrafts(): DraftMilestone[] {
  return DEFAULT_MILESTONES.map((m) => ({ ...m, photoFile: null, photoPreview: null }));
}

interface Props {
  value: DraftMilestone[];
  onChange: (next: DraftMilestone[]) => void;
}

/**
 * The timeline editor.
 *
 * The chapter ships with six milestones and most senders will want roughly
 * those with their own wording, so the editor opens on them already filled
 * in rather than on an empty list — an empty list makes people write nothing.
 * From there they can retype any of it, delete rows, add up to ten, and put
 * it all back with one button.
 *
 * Photos are optional per row. One photo anywhere turns the whole chapter
 * into its photo-led layout in the story, which is why the hint says so:
 * otherwise attaching one picture to one milestone has a surprising effect
 * on the other nine.
 */
export default function MilestoneEditor({ value, onChange }: Props) {
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (i: number, patch: Partial<DraftMilestone>) => {
    const next = value.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const remove = (i: number) => {
    const row = value[i];
    if (row.photoPreview) URL.revokeObjectURL(row.photoPreview);
    onChange(value.filter((_, j) => j !== i));
  };

  const add = () => {
    if (value.length >= MAX_MILESTONES) return;
    onChange([
      ...value,
      { id: milestoneId(value.length), icon: "✦", title: "", text: "", photoFile: null, photoPreview: null },
    ]);
  };

  const restore = () => {
    value.forEach((m) => m.photoPreview && URL.revokeObjectURL(m.photoPreview));
    onChange(defaultDrafts());
  };

  const pickPhoto = (i: number, file: File | null) => {
    const row = value[i];
    if (row.photoPreview) URL.revokeObjectURL(row.photoPreview);
    update(i, {
      photoFile: file,
      photoPreview: file ? URL.createObjectURL(file) : null,
    });
  };

  const photoCount = value.filter((m) => m.photoFile).length;

  return (
    <fieldset className="rounded-2xl border border-ink/10 p-4">
      <legend className="px-2 text-sm font-semibold text-ink">Your timeline</legend>
      <p className="text-sm text-ink/60">
        Chapter six walks through your story, one milestone at a time. These are
        our six to start you off &mdash; rewrite any of them, delete the ones
        that don&rsquo;t fit, and add your own. Up to {MAX_MILESTONES}.
      </p>
      <p className="mt-2 text-xs text-ink/50">
        Add a photo to any milestone and the whole chapter becomes a
        photo-led one, shown one milestone per screen.{" "}
        {photoCount > 0
          ? `${photoCount} of ${value.length} have photos.`
          : "With no photos it keeps the classic timeline look."}
      </p>

      <ol className="mt-4 space-y-3">
        {value.map((m, i) => (
          <li key={i} className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
            <div className="flex items-start gap-2">
              <label className="sr-only" htmlFor={`ms-icon-${i}`}>
                Symbol for milestone {i + 1}
              </label>
              <input
                id={`ms-icon-${i}`}
                value={m.icon}
                onChange={(e) => update(i, { icon: e.target.value.slice(0, 4) })}
                aria-label={`Symbol for milestone ${i + 1}`}
                className="w-12 shrink-0 rounded-lg border border-ink/15 px-2 py-2 text-center text-lg"
              />
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`ms-title-${i}`}>
                  Title for milestone {i + 1}
                </label>
                <input
                  id={`ms-title-${i}`}
                  value={m.title}
                  maxLength={MAX_TITLE}
                  placeholder="First Meeting"
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm font-semibold"
                />
                <label className="sr-only" htmlFor={`ms-text-${i}`}>
                  Note for milestone {i + 1}
                </label>
                <textarea
                  id={`ms-text-${i}`}
                  value={m.text}
                  rows={2}
                  maxLength={MAX_TEXT}
                  placeholder="What happened, in your words."
                  onChange={(e) => update(i, { text: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove milestone ${i + 1}`}
                className="shrink-0 rounded-lg px-2 py-2 text-ink/40 hover:bg-rose/10 hover:text-rose"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 flex items-center gap-3 pl-14">
              {m.photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.photoPreview}
                  alt=""
                  className="h-12 w-16 rounded-md object-cover"
                />
              ) : null}
              <input
                ref={(el) => {
                  fileInputs.current[i] = el;
                }}
                id={`ms-photo-${i}`}
                type="file"
                accept="image/*"
                onChange={(e) => pickPhoto(i, e.target.files?.[0] || null)}
                className="hidden"
              />
              <label
                htmlFor={`ms-photo-${i}`}
                className="cursor-pointer rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-rose hover:text-rose"
              >
                {m.photoFile ? "Change photo" : "Add a photo"}
              </label>
              {m.photoFile ? (
                <button
                  type="button"
                  onClick={() => {
                    pickPhoto(i, null);
                    const input = fileInputs.current[i];
                    if (input) input.value = "";
                  }}
                  className="text-xs text-ink/50 underline hover:text-rose"
                >
                  remove photo
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={value.length >= MAX_MILESTONES}
          className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:border-rose hover:text-rose disabled:opacity-40 disabled:hover:border-ink/15 disabled:hover:text-ink"
        >
          + Add a milestone
        </button>
        <button
          type="button"
          onClick={restore}
          className="rounded-xl px-3 py-2 text-sm text-ink/60 underline hover:text-rose"
        >
          Restore the built-in six
        </button>
        <span className="ml-auto text-xs text-ink/45">
          {value.length} of {MAX_MILESTONES}
        </span>
      </div>
    </fieldset>
  );
}
