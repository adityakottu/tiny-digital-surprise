"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useState } from "react";
import CountdownTimer from "@/components/CountdownTimer";
import ThreadDivider from "@/components/ThreadDivider";
import PhoneMockup from "@/components/PhoneMockup";
import Testimonials from "@/components/Testimonials";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const features = [
  {
    title: "Their name, your words",
    body: "Write the message yourself — we just make it beautiful.",
  },
  {
    title: "Up to 4 photos",
    body: "The ones that actually mean something, woven right into the story.",
  },
  {
    title: "One song, on loop",
    body: "The track that's been yours since the beginning.",
  },
  {
    title: "A private link",
    body: "Nothing to install. They just open it, wherever they are.",
  },
  {
    title: "Stays live for 2 years",
    body: "They can come back and revisit it any time until then.",
  },
  {
    title: "Two minutes, start to finish",
    body: "Add your things, we handle the rest.",
  },
];

export default function PurchasePage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setError(null);
    if (!/^\d{10}$/.test(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");

      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "Tiny Digital Surprise",
        description: "One personalised digital gift",
        prefill: { contact: phone },
        theme: { color: "#A62B4E" },
        handler: async function (response: any) {
          const verifyRes = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok) {
            router.push(`/create?orderId=${verifyData.orderId}`);
          } else {
            setError("Payment succeeded but verification failed. Contact support.");
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });
      rzp.on("payment.failed", () => {
        setError("Payment failed. Please try again.");
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <header className="max-w-content mx-auto px-6 py-6 flex items-center justify-between">
        <span className="font-display text-xl text-rose">Tiny Digital Surprise</span>
        <a href="#how" className="text-sm text-ink/70 hover:text-ink">
          How it works
        </a>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-content mx-auto px-6 pt-8 pb-20 grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.1] text-ink">
              A gift made from the things only the two of you would understand.
            </h1>
            <p className="mt-5 text-lg text-ink/70 max-w-md">
              Add your photos, your song, and a message in your own words.
              We turn it into a private page made just for them.
            </p>

            <div className="mt-8 rounded-2xl bg-blush/50 p-6 max-w-md">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-3xl text-rose">₹199</span>
                <span className="text-ink/40 line-through">₹999</span>
                <span className="text-sm font-semibold text-gold">Today only</span>
              </div>
              <div className="mt-2">
                <CountdownTimer />
              </div>

              <label htmlFor="phone" className="mt-5 block text-sm text-ink/70">
                Mobile number
              </label>
              <div className="mt-1 flex rounded-xl border border-ink/15 bg-white overflow-hidden focus-within:border-rose">
                <span className="flex items-center px-3 text-ink/50 border-r border-ink/10">
                  +91
                </span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="98765 43210"
                  className="flex-1 px-3 py-2.5 outline-none"
                />
              </div>
              {error && <p className="mt-2 text-sm text-rose">{error}</p>}

              <button
                onClick={startCheckout}
                disabled={loading}
                className="mt-4 w-full rounded-xl bg-rose text-white font-semibold py-3 hover:bg-rose-dark transition-colors disabled:opacity-60"
              >
                {loading ? "Opening checkout…" : "Create their surprise"}
              </button>
              <p className="mt-3 text-xs text-ink/50">
                Secure payment via Razorpay. Your number is only used to save your gift.
              </p>
            </div>
          </div>

          <PhoneMockup />
        </section>

        <ThreadDivider />

        {/* How it works */}
        <section id="how" className="max-w-content mx-auto px-6 py-20">
          <h2 className="font-display text-3xl text-ink mb-10">
            Three steps, about two minutes
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { n: 1, t: "Pay for your gift", d: "₹199 today, secured through Razorpay." },
              { n: 2, t: "Add your memories", d: "Their name, your message, your photos, your song." },
              { n: 3, t: "Share the link", d: "Send it however you'd like — it's ready instantly." },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-display text-2xl text-rose">{s.n}</div>
                <h3 className="mt-2 font-semibold text-ink">{s.t}</h3>
                <p className="mt-1 text-ink/60 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <ThreadDivider flip />

        {/* Features */}
        <section className="max-w-content mx-auto px-6 py-20">
          <h2 className="font-display text-3xl text-ink mb-10">
            Everything that makes it feel like yours
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <h3 className="font-semibold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm text-ink/60">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-plum py-20">
          <div className="max-w-content mx-auto px-6">
            <h2 className="font-display text-3xl text-blush mb-10">
              People who've already sent one
            </h2>
            <Testimonials />
          </div>
        </section>
      </main>

      <footer className="max-w-content mx-auto px-6 py-10 text-sm text-ink/50 flex flex-wrap gap-4 justify-between">
        <span>© {new Date().getFullYear()} Tiny Digital Surprise</span>
        <div className="flex gap-4">
          <a href="/terms" className="hover:text-ink">Terms</a>
          <a href="/privacy" className="hover:text-ink">Privacy</a>
          <a href="/refund" className="hover:text-ink">Refunds</a>
        </div>
      </footer>
    </>
  );
}
