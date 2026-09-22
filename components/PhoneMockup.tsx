"use client";

import { useEffect, useState } from "react";

const sampleLines = [
  "For Ananya,",
  "every playlist skips to us.",
  "Happy anniversary, jaan.",
];

export default function PhoneMockup() {
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setLineIndex((i) => (i + 1) % sampleLines.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto w-[260px] sm:w-[280px]">
      <div className="rounded-[2.2rem] border-[6px] border-ink bg-plum shadow-xl overflow-hidden aspect-[9/18.5] flex flex-col items-center justify-center px-6 text-center">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-16 rounded-full bg-ink/60" />
        <span className="text-2xl mb-4" aria-hidden="true">
          ❤
        </span>
        <p
          key={lineIndex}
          className="font-display italic text-blush text-lg leading-snug transition-opacity duration-700"
        >
          {sampleLines[lineIndex]}
        </p>
        <div className="mt-6 flex gap-1.5" aria-hidden="true">
          {sampleLines.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${
                i === lineIndex ? "bg-rose" : "bg-blush/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
