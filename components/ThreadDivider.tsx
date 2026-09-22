export default function ThreadDivider({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1200 60"
      className={`w-full h-8 ${flip ? "rotate-180" : ""}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="thread"
        strokeDasharray="1 14"
        d="M0,30 C150,0 300,60 450,30 C600,0 750,60 900,30 C1050,0 1150,45 1200,30"
      />
    </svg>
  );
}
