"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_FOCUS,
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
  return DEFAULT_MILESTONES.map((m) => ({
    ...m,
    photoFile: null,
    photoPreview: null,
    focus: DEFAULT_FOCUS,
  }));
}

/**
 * Drag-to-place the photo inside the frame it will actually appear in.
 *
 * The story crops a milestone photo to a wide card, so a portrait loses its
 * top and bottom and a group shot loses whoever is at the edge. Rather than
 * a crop box with handles — fiddly on a phone, and more control than anyone
 * needs — this shows the real frame and lets the sender push the picture
 * around inside it. What is shown here is exactly what the story renders,
 * because both use the same object-fit and object-position.
 */
function FocusPicker({
  src,
  focus,
  onChange,
}: {
  src: string;
  focus: string;
  onChange: (next: string) => void;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const parse = (v: string) => {
    const m = v.match(/^([\d.]+)% ([\d.]+)%$/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
  };

  // Dragging the picture down should reveal what is above it, so the focal
  // point moves the opposite way to the finger.
  const move = (dx: number, dy: number, from: { x: number; y: number }) => {
    const box = frame.current;
    if (!box) return;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    onChange(
      clamp(from.x - (dx / box.clientWidth) * 100).toFixed(1) + "% " +
      clamp(from.y - (dy / box.clientHeight) * 100).toFixed(1) + "%"
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = { px: e.clientX, py: e.clientY, from: parse(focus) };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setDragging(true);
    const onMove = (ev: PointerEvent) => move(ev.clientX - start.px, ev.clientY - start.py, start.from);
    const onUp = () => {
      setDragging(false);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  // The keyboard gets the same control, in steps.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 3;
    const at = parse(focus);
    const d: Record<string, [number, number]> = {
      ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0],
    };
    if (!d[e.key]) return;
    e.preventDefault();
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    onChange(clamp(at.x + d[e.key][0]).toFixed(1) + "% " + clamp(at.y + d[e.key][1]).toFixed(1) + "%");
  };

  return (
    <div className="mt-2">
      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label="Drag to choose which part of the photo is shown"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={`relative w-full overflow-hidden rounded-lg border border-ink/15 bg-ink/5 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose`}
        style={{ aspectRatio: "3 / 2", touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full select-none"
          style={{ objectFit: "cover", objectPosition: focus }}
        />
        <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-ink/50">
          This is the exact frame the story uses &mdash; drag the photo to place it.
        </p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FOCUS)}
          className="shrink-0 text-xs text-ink/50 underline hover:text-rose"
        >
          centre
        </button>
      </div>
    </div>
  );
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
      {
        id: milestoneId(value.length),
        icon: "✦",
        title: "",
        text: "",
        photoFile: null,
        photoPreview: null,
        focus: DEFAULT_FOCUS,
      },
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
      // A new photo starts centred rather than inheriting where the last one
      // happened to be placed.
      focus: DEFAULT_FOCUS,
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

            <div className="mt-2 pl-14">
              {m.photoPreview ? (
                <FocusPicker
                  src={m.photoPreview}
                  focus={m.focus || DEFAULT_FOCUS}
                  onChange={(focus) => update(i, { focus })}
                />
              ) : null}
            </div>

            <div className="mt-2 flex items-center gap-3 pl-14">
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
