"use client";

import { useEffect, useState } from "react";

function getMidnightRemaining() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function CountdownTimer() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    setRemaining(getMidnightRemaining());
    const id = setInterval(() => setRemaining(getMidnightRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  if (remaining === null) return null;

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="flex items-center gap-2 font-body text-sm text-ink/70">
      <span>Today&apos;s price ends in</span>
      <div className="flex items-center gap-1 font-semibold text-rose">
        <span>{pad(hours)}h</span>
        <span>{pad(minutes)}m</span>
        <span>{pad(seconds)}s</span>
      </div>
    </div>
  );
}
