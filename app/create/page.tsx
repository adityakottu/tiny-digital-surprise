"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PhotoUploader from "@/components/PhotoUploader";
import { TEST_MODE } from "@/lib/testMode";
import { UPLOAD_BUDGET, ceilingFor, readableSize, shrinkImage } from "@/lib/clientImage";
import MilestoneEditor, { defaultDrafts, type DraftMilestone } from "@/components/MilestoneEditor";
import { isDefaultList } from "@/lib/milestones";

const OCCASION_PRESETS: Record<
  string,
  { label: string; openingLine: string; message: string; oneMoreThing: string; letterBody: string }
> = {
  "just-because": {
    label: "Just Because",
    openingLine: "No occasion, just you on my mind…",
    message: "Some days don't need a reason. Today I just wanted you to know how much you mean to me.",
    oneMoreThing: "P.S. — I'd choose you in every single lifetime. 💛",
    letterBody: "Some days I just want to put it in writing: you are the best part of my ordinary. Nothing happened today \u2014 you happened, ages ago, and it never stopped mattering.",
  },
  anniversary: {
    label: "Anniversary",
    openingLine: "Happy anniversary — I made something special for you…",
    message: "Thank you for every ordinary day you made extraordinary. Here's to all the ones still coming.",
    oneMoreThing: "P.S. — I'd marry you again, every year, in every lifetime. 💛",
    letterBody: "I have read this year back to myself and it is all you. The good bits, the dull bits, the ones I would not tell anyone else. Thank you for another one.",
  },
  birthday: {
    label: "Birthday",
    openingLine: "It's your day — I made something special for you…",
    message: "Happy birthday to the best part of my everyday. Here's to another year of us.",
    oneMoreThing: "P.S. — You get better with every year, and so does my luck for having you. 💛",
    letterBody: "I wanted one page that was only about you. You make rooms better, and you make me better. Whatever you want this year, I am in.",
  },
  valentine: {
    label: "Valentine's Day",
    openingLine: "Happy Valentine's Day, my love…",
    message: "You are still, and always, my favourite person to love.",
    oneMoreThing: "P.S. — Be mine. Always have been, always will be. 💛",
    letterBody: "If I had to choose you again today, knowing everything I know now, it would not take me a second. It never has.",
  },
  proposal: {
    label: "Proposal / Big Question",
    openingLine: "I have something to ask you…",
    message: "Every road led me here, to you. Will you marry me?",
    oneMoreThing: "P.S. — Whatever your answer, I already know you're the best part of my story. 💛",
    letterBody: "I have rewritten this more times than I will admit, and it comes out the same every time: I would like the rest of it to be with you.",
  },
  apology: {
    label: "Apology",
    openingLine: "I made something to say what I couldn't find the words for…",
    message: "I'm sorry. You deserve better, and I'm going to keep showing up and proving it.",
    oneMoreThing: "P.S. — Thank you for loving me even when I make it hard. 💛",
    letterBody: "I have been sitting with this one. You were right, and I am sorry \u2014 not the quick kind, the kind that changes what I do next.",
  },
};

export default function CreateGiftPage() {
  return (
    <Suspense fallback={null}>
      <CreateGiftForm />
    </Suspense>
  );
}

function CreateGiftForm() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get("orderId");

  const [recipientName, setRecipientName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [openingLine, setOpeningLine] = useState("");
  const [message, setMessage] = useState("");
  const [oneMoreThing, setOneMoreThing] = useState("");
  const [letterBody, setLetterBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [cartoonize, setCartoonize] = useState(false);
  const [song, setSong] = useState<File | null>(null);
  // Passport-style portraits, projected onto the hologram couple's faces.
  const [senderPhoto, setSenderPhoto] = useState<File | null>(null);
  const [recipientPhoto, setRecipientPhoto] = useState<File | null>(null);
  // Optional PIN lock on the finished gift link.
  const [milestones, setMilestones] = useState<DraftMilestone[]>(defaultDrafts);
  const [pin, setPin] = useState("");
  const [pinType, setPinType] = useState("birthday");
  const [pinHint, setPinHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // In test mode there is no order to point at — the home page sends people
  // straight here — so the missing-order guard is skipped.
  if (!orderId && !TEST_MODE) {
    return (
      <div className="max-w-content mx-auto px-6 py-20 text-center">
        <p className="text-ink/70">
          We couldn&apos;t find your order. Please start from the{" "}
          <a href="/" className="text-rose underline">
            purchase page
          </a>
          .
        </p>
      </div>
    );
  }

  function applyOccasion(value: string) {
    setOccasion(value);
    const preset = OCCASION_PRESETS[value];
    if (!preset) return;
    if (!touched.openingLine) setOpeningLine(preset.openingLine);
    if (!touched.message) setMessage(preset.message);
    if (!touched.oneMoreThing) setOneMoreThing(preset.oneMoreThing);
    if (!touched.letterBody) setLetterBody(preset.letterBody);
  }

  /**
   * The form body, built once and used for both the preview and the real
   * submission. Two code paths assembling the same fields is how a preview
   * ends up showing something the gift will not.
   */
  function buildForm(
    smallPhotos: File[],
    smallSender: File | null,
    smallRecipient: File | null,
    smallMilestones: (File | null)[]
  ) {
    const form = new FormData();
    form.append("recipientName", recipientName);
    form.append("senderName", senderName);
    form.append("occasion", occasion);
    form.append("openingLine", openingLine);
    form.append("message", message);
    form.append("oneMoreThing", oneMoreThing);
    form.append("letterBody", letterBody);
    form.append("cartoonize", String(cartoonize));
    if (song) form.append("song", song);
    if (smallSender) form.append("senderPhoto", smallSender);
    if (smallRecipient) form.append("recipientPhoto", smallRecipient);
    if (pin.trim()) {
      form.append("pin", pin.trim());
      form.append("pinType", pinType);
      form.append("pinHint", pinHint.trim());
    }
    smallPhotos.forEach((p) => form.append("photos", p));

    // Blank rows are dropped, and each kept row's photo is keyed by its
    // position in the list that is actually sent. Keying by the position in
    // the editor instead would hand the server photo 3 for milestone 2 the
    // moment someone leaves a row empty in the middle.
    const trimmed: { id: string; icon: string; title: string; text: string }[] = [];
    const keptPhotos: (File | null)[] = [];
    milestones.forEach((m, i) => {
      const title = m.title.trim();
      const text = m.text.trim();
      if (!title && !text) return;
      trimmed.push({ id: m.id || `m${trimmed.length + 1}`, icon: m.icon, title, text });
      keptPhotos.push(smallMilestones[i]);
    });

    const anyPhotos = keptPhotos.some(Boolean);
    if (trimmed.length && (anyPhotos || !isDefaultList(trimmed))) {
      form.append("milestones", JSON.stringify(trimmed));
      keptPhotos.forEach((file, i) => {
        if (file) form.append(`milestonePhoto-${i}`, file);
      });
    }
    return form;
  }

  /** Shrinks whatever has been attached, at a ceiling set by how many there are. */
  async function prepareImages() {
    const imageCount = photos.length + milestones.filter((m) => m.photoFile).length;
    const edge = ceilingFor(imageCount, "memory", TEST_MODE);
    const smallPhotos = await Promise.all(photos.map((p) => shrinkImage(p, "memory", TEST_MODE, edge)));
    const smallSender = senderPhoto ? await shrinkImage(senderPhoto, "portrait", TEST_MODE) : null;
    const smallRecipient = recipientPhoto ? await shrinkImage(recipientPhoto, "portrait", TEST_MODE) : null;
    const smallMilestones = await Promise.all(
      milestones.map((m) => (m.photoFile ? shrinkImage(m.photoFile, "memory", TEST_MODE, edge) : null))
    );
    return { smallPhotos, smallSender, smallRecipient, smallMilestones };
  }

  /**
   * Shows the story as it stands, without saving anything.
   *
   * Rendered by the server from the same fields the gift would carry, so it
   * is the real page rather than a mock-up of it — the chapters, the
   * hologram, the timeline, all of it with the sender's own words and photos.
   */
  async function handlePreview() {
    setError(null);
    if (!message.trim() && !recipientName.trim()) {
      setError("Add their name or a message first, then preview it.");
      return;
    }
    setPreviewing(true);
    try {
      const { smallPhotos, smallSender, smallRecipient, smallMilestones } = await prepareImages();
      const form = buildForm(smallPhotos, smallSender, smallRecipient, smallMilestones);
      const res = await fetch("/api/gifts/preview", { method: "POST", body: form });
      const html = await res.text();
      if (!res.ok) throw new Error("The preview could not be built. Try again.");
      setPreviewHtml(html);
    } catch (err: any) {
      setError(err?.message || "The preview could not be built.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError("Add a personal message — it's the one thing every gift needs.");
      return;
    }

    setSubmitting(true);
    try {
      // Shrink the photos here, in the browser. A serverless request body is
      // capped at 4.5MB and the platform rejects anything bigger before the
      // route runs, so two untouched phone photos would fail the whole
      // submission. See lib/clientImage.ts.
      setProgress("Preparing your photos…");
      const { smallPhotos, smallSender, smallRecipient, smallMilestones } = await prepareImages();

      const total =
        smallPhotos.reduce((n, p) => n + p.size, 0) +
        smallMilestones.reduce((n, p) => n + (p ? p.size : 0), 0) +
        (smallSender?.size || 0) +
        (smallRecipient?.size || 0) +
        (song?.size || 0);

      if (total > UPLOAD_BUDGET) {
        const songPart = song ? ` The song alone is ${readableSize(song.size)}.` : "";
        throw new Error(
          `These files come to ${readableSize(total)}, and the server will only accept about ` +
            `${readableSize(UPLOAD_BUDGET)} in one go.${songPart} Remove one and try again.`
        );
      }

      setProgress("Creating their surprise…");
      const form = buildForm(smallPhotos, smallSender, smallRecipient, smallMilestones);
      form.append("orderId", orderId || "");
      const res = await fetch("/api/gifts", { method: "POST", body: form });

      // A failure from the platform rather than the route (too large, timed
      // out, cold-start crash) does not come back as JSON. Reading it blind
      // throws a parser error that says nothing useful, so read the text and
      // translate the status into something actionable.
      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* not JSON — handled below */
      }

      if (!data) {
        if (res.status === 413) {
          throw new Error(
            "The server rejected the upload as too large. Try fewer photos, or a smaller song."
          );
        }
        if (res.status === 504 || res.status === 502) {
          throw new Error(
            "The server took too long putting the gift together. Try again with fewer or smaller photos."
          );
        }
        throw new Error(`The server replied with ${res.status} and no explanation. Please try again.`);
      }
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      // Test mode keeps gifts on the instance that made them, and a
      // serverless instance can be recycled between creating the link and
      // opening it. Keep a copy here so the link still works afterwards —
      // /g/<slug> offers it back to the server when the store has lost it.
      if (data.testGift?.slug) {
        try {
          window.localStorage.setItem(
            `tds_test_gift_${data.testGift.slug}`,
            JSON.stringify(data.testGift)
          );
        } catch {
          /* private mode or a full quota — the server copy still works now */
        }
      }

      if (Array.isArray(data.notes) && data.notes.length) {
        // Something was dropped on the way in (an unreadable photo, an
        // oversized song). Say so before leaving the form rather than letting
        // the story quietly come up missing a piece.
        window.alert(data.notes.join("\n\n"));
      }

      router.push(`/g/${data.slug}`);
    } catch (err: any) {
      const message = err?.message || "Something went wrong.";
      // A network-level failure (the request never reached the route) reads as
      // a bare "Failed to fetch", which tells the sender nothing.
      setError(
        message === "Failed to fetch"
          ? "Couldn't reach the server. Check your connection and try again."
          : message
      );
      // The button sits below a long form, so an error next to it can be off
      // screen entirely — which looks exactly like nothing happening.
      requestAnimationFrame(() => {
        document.getElementById("create-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } finally {
      setProgress(null);
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-content mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Build their surprise</h1>
      <p className="mt-2 text-ink/60">
        {TEST_MODE
          ? "Test mode — nothing was charged. Fill this in and the surprise opens straight away."
          : "Payment confirmed — now add the things that make it theirs. You'll get a link that stays live for 2 years."}
      </p>
      {TEST_MODE && (
        <p className="mt-3 rounded-xl bg-blush/50 px-4 py-3 text-sm text-ink/70">
          Photos, the two portrait faces and the song are carried inside the gift
          itself instead of being uploaded, so keep the song under 3MB. The link
          is temporary — it opens reliably in this browser, and a fresh one is a
          minute&rsquo;s work.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-8 max-w-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="recipientName" className="block text-sm font-semibold text-ink mb-1">
              Their name
            </label>
            <input
              id="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Ananya"
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
            />
          </div>
          <div>
            <label htmlFor="senderName" className="block text-sm font-semibold text-ink mb-1">
              Your name
            </label>
            <input
              id="senderName"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Aditya"
              className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
            />
          </div>
        </div>

        <div>
          <label htmlFor="occasion" className="block text-sm font-semibold text-ink mb-1">
            Occasion
          </label>
          <p className="text-xs text-ink/50 mb-2">Prefills the fields below — you can still edit anything after picking one.</p>
          <select
            id="occasion"
            value={occasion}
            onChange={(e) => applyOccasion(e.target.value)}
            className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose bg-white"
          >
            <option value="">Choose an occasion…</option>
            {Object.entries(OCCASION_PRESETS).map(([value, preset]) => (
              <option key={value} value={value}>{preset.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="openingLine" className="block text-sm font-semibold text-ink mb-1">
            Opening line
          </label>
          <input
            id="openingLine"
            value={openingLine}
            onChange={(e) => { setOpeningLine(e.target.value); setTouched((t) => ({ ...t, openingLine: true })); }}
            placeholder="I made something special for you…"
            className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-semibold text-ink mb-1">
            Personal message (shown in the final scene)
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => { setMessage(e.target.value); setTouched((t) => ({ ...t, message: true })); }}
            rows={4}
            placeholder="Write it the way you'd actually say it to them."
            className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
          />
        </div>

        <div>
          <label htmlFor="oneMoreThing" className="block text-sm font-semibold text-ink mb-1">
            &ldquo;One More Thing…&rdquo; bonus message
          </label>
          <textarea
            id="oneMoreThing"
            value={oneMoreThing}
            onChange={(e) => { setOneMoreThing(e.target.value); setTouched((t) => ({ ...t, oneMoreThing: true })); }}
            rows={3}
            placeholder="P.S. — I'd choose you in every lifetime…"
            className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
          />
        </div>

        <div>
          <label htmlFor="letterBody" className="block text-sm font-semibold text-ink mb-1">
            The letter (chapter eight)
          </label>
          <p className="text-xs text-ink/50 mb-2">
            Halfway through, an envelope opens and they read this. Leave it
            empty and it uses your closing message above &mdash; but then
            they&rsquo;ll read the same words twice, so it&rsquo;s worth its own.
          </p>
          <textarea
            id="letterBody"
            value={letterBody}
            onChange={(e) => { setLetterBody(e.target.value); setTouched((t) => ({ ...t, letterBody: true })); }}
            rows={4}
            placeholder="The things you'd put in a letter and not say out loud."
            className="w-full rounded-xl border border-ink/15 px-4 py-2.5 outline-none focus:border-rose"
          />
        </div>

        <div>
          <span className="block text-sm font-semibold text-ink mb-1">Photos (up to 4)</span>
          <PhotoUploader
            onChange={setPhotos}
            max={4}
            cartoonize={cartoonize}
            onCartoonizeChange={setCartoonize}
          />
        </div>

        <div>
          <label htmlFor="song" className="block text-sm font-semibold text-ink mb-1">
            A song (optional)
          </label>
          <input
            id="song"
            type="file"
            accept="audio/*"
            onChange={(e) => setSong(e.target.files?.[0] || null)}
            className="block w-full text-sm text-ink/70"
          />
          {song && (
            // Audio cannot be shrunk in the browser the way a photo can, so a
            // large track has to be caught here rather than at submit time.
            <p className={`mt-1 text-xs ${song.size > 2.5 * 1024 * 1024 ? "text-rose" : "text-ink/50"}`}>
              {song.name} — {readableSize(song.size)}
              {song.size > 2.5 * 1024 * 1024
                ? ". That's too big to send with the photos; pick a shorter track (under about 2.5MB)."
                : ""}
            </p>
          )}
        </div>

        <MilestoneEditor value={milestones} onChange={setMilestones} />

        {/* Optional PIN lock. Checked on the server, so the story is not sent
            to the browser until the PIN is right. */}
        <fieldset className="rounded-2xl border border-ink/10 p-4">
          <legend className="px-2 text-sm font-semibold text-ink">
            Lock it with a PIN (optional)
          </legend>
          <p className="text-sm text-ink/60 mb-3">
            Leave this empty and anyone with the link can open the gift. Add a
            PIN and they&rsquo;ll need it first — handy if you want them to open
            it on the day rather than the moment it arrives.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pinType" className="block text-sm font-semibold text-ink mb-1">
                What is the PIN?
              </label>
              <select
                id="pinType"
                value={pinType}
                onChange={(e) => setPinType(e.target.value)}
                className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink"
              >
                <option value="birthday">Their birthday</option>
                <option value="anniversary">Your anniversary</option>
                <option value="custom">Something else</option>
              </select>
            </div>
            <div>
              <label htmlFor="pin" className="block text-sm font-semibold text-ink mb-1">
                The PIN itself
              </label>
              <input
                id="pin"
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={pinType === "custom" ? "e.g. ourplace" : "e.g. 2512 or 25122015"}
                autoComplete="off"
                className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-xs text-ink/50">
                Spaces and slashes are ignored, and capitals don&rsquo;t matter —
                &ldquo;25/12/2015&rdquo; and &ldquo;25122015&rdquo; both work.
                At least 4 characters.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="pinHint" className="block text-sm font-semibold text-ink mb-1">
              Hint to show them (optional)
            </label>
            <input
              id="pinHint"
              type="text"
              value={pinHint}
              onChange={(e) => setPinHint(e.target.value)}
              placeholder="e.g. The day we met — 8 digits"
              className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-xs text-ink/50">
              Shown on the lock screen. Leave it blank and we&rsquo;ll show a
              generic one based on your choice above.
            </p>
          </div>
        </fieldset>

        {/* Portraits for the holographic couple. Optional — without them the
            figures simply keep their plain hologram heads. */}
        <fieldset className="rounded-2xl border border-ink/10 p-4">
          <legend className="px-2 text-sm font-semibold text-ink">
            Your faces in the hologram (optional)
          </legend>
          <p className="text-sm text-ink/60 mb-3">
            Add a passport-style photo of each of you — face centred, looking at
            the camera, plain background. They&rsquo;re turned into light and
            projected onto the holographic couple, so the two figures who dance
            through the story are the two of you.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="senderPhoto" className="block text-sm font-semibold text-ink mb-1">
                You
              </label>
              <input
                id="senderPhoto"
                type="file"
                accept="image/*"
                onChange={(e) => setSenderPhoto(e.target.files?.[0] || null)}
                className="block w-full text-sm text-ink/70"
              />
            </div>
            <div>
              <label htmlFor="recipientPhoto" className="block text-sm font-semibold text-ink mb-1">
                Them
              </label>
              <input
                id="recipientPhoto"
                type="file"
                accept="image/*"
                onChange={(e) => setRecipientPhoto(e.target.files?.[0] || null)}
                className="block w-full text-sm text-ink/70"
              />
            </div>
          </div>
        </fieldset>

        {error && (
          <p id="create-error" role="alert" className="rounded-xl bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || submitting}
            className="flex-1 rounded-xl border border-ink/20 py-3 font-semibold text-ink hover:border-rose hover:text-rose transition-colors disabled:opacity-60"
          >
            {previewing ? "Building the preview…" : "Preview it"}
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-rose text-white font-semibold py-3 hover:bg-rose-dark transition-colors disabled:opacity-60"
        >
          {submitting ? progress || "Creating their surprise…" : "Create gift & get my link"}
        </button>
      </form>
      {previewHtml !== null && (
        <div
          className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Preview of the surprise"
        >
          <div className="absolute inset-0 flex flex-col p-3 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">
                Preview &mdash; nothing has been saved yet
              </p>
              <button
                type="button"
                onClick={() => setPreviewHtml(null)}
                className="rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-ink hover:bg-white"
              >
                Close
              </button>
            </div>
            {/* srcDoc rather than a URL: the preview is never stored, so there
                is nothing to point at. Sandboxed to scripts only — the story
                needs them to run, and nothing else. */}
            <iframe
              title="Preview of the surprise"
              srcDoc={previewHtml}
              sandbox="allow-scripts"
              className="min-h-0 flex-1 w-full rounded-2xl border border-white/15 bg-black"
            />
          </div>
        </div>
      )}
    </main>
  );
}
