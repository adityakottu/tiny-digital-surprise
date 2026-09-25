"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PhotoUploader from "@/components/PhotoUploader";

const OCCASION_PRESETS: Record<string, { label: string; openingLine: string; message: string; oneMoreThing: string }> = {
  "just-because": {
    label: "Just Because",
    openingLine: "No occasion, just you on my mind…",
    message: "Some days don't need a reason. Today I just wanted you to know how much you mean to me.",
    oneMoreThing: "P.S. — I'd choose you in every single lifetime. 💛",
  },
  anniversary: {
    label: "Anniversary",
    openingLine: "Happy anniversary — I made something special for you…",
    message: "Thank you for every ordinary day you made extraordinary. Here's to all the ones still coming.",
    oneMoreThing: "P.S. — I'd marry you again, every year, in every lifetime. 💛",
  },
  birthday: {
    label: "Birthday",
    openingLine: "It's your day — I made something special for you…",
    message: "Happy birthday to the best part of my everyday. Here's to another year of us.",
    oneMoreThing: "P.S. — You get better with every year, and so does my luck for having you. 💛",
  },
  valentine: {
    label: "Valentine's Day",
    openingLine: "Happy Valentine's Day, my love…",
    message: "You are still, and always, my favourite person to love.",
    oneMoreThing: "P.S. — Be mine. Always have been, always will be. 💛",
  },
  proposal: {
    label: "Proposal / Big Question",
    openingLine: "I have something to ask you…",
    message: "Every road led me here, to you. Will you marry me?",
    oneMoreThing: "P.S. — Whatever your answer, I already know you're the best part of my story. 💛",
  },
  apology: {
    label: "Apology",
    openingLine: "I made something to say what I couldn't find the words for…",
    message: "I'm sorry. You deserve better, and I'm going to keep showing up and proving it.",
    oneMoreThing: "P.S. — Thank you for loving me even when I make it hard. 💛",
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
  const [photos, setPhotos] = useState<File[]>([]);
  const [cartoonize, setCartoonize] = useState(false);
  const [song, setSong] = useState<File | null>(null);
  // Passport-style portraits, projected onto the hologram couple's faces.
  const [senderPhoto, setSenderPhoto] = useState<File | null>(null);
  const [recipientPhoto, setRecipientPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  if (!orderId) {
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
      const form = new FormData();
      form.append("orderId", orderId as string);
      form.append("recipientName", recipientName);
      form.append("senderName", senderName);
      form.append("occasion", occasion);
      form.append("openingLine", openingLine);
      form.append("message", message);
      form.append("oneMoreThing", oneMoreThing);
      form.append("cartoonize", String(cartoonize));
      if (song) form.append("song", song);
      if (senderPhoto) form.append("senderPhoto", senderPhoto);
      if (recipientPhoto) form.append("recipientPhoto", recipientPhoto);
      photos.forEach((p) => form.append("photos", p));

      const res = await fetch("/api/gifts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      router.push(`/g/${data.slug}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-content mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Build their surprise</h1>
      <p className="mt-2 text-ink/60">
        Payment confirmed — now add the things that make it theirs. You&apos;ll get a
        link that stays live for 2 years.
      </p>

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
        </div>

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

        {error && <p className="text-sm text-rose">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-rose text-white font-semibold py-3 hover:bg-rose-dark transition-colors disabled:opacity-60"
        >
          {submitting ? "Creating their surprise…" : "Create gift & get my link"}
        </button>
      </form>
    </main>
  );
}
