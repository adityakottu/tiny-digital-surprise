const quotes = [
  {
    text: "I sent it before dinner and she called before I even finished cooking. She's watched it maybe fifty times since.",
    name: "Rohit, Pune",
  },
  {
    text: "We're in different cities most of the year. This is the first gift that felt like I was actually there.",
    name: "Meera, Bengaluru",
  },
  {
    text: "Took me ten minutes to make and she still brings it up months later.",
    name: "Aakash, Delhi",
  },
];

export default function Testimonials() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {quotes.map((q) => (
        <figure
          key={q.name}
          className="rounded-2xl bg-blush/60 p-6 flex flex-col justify-between"
        >
          <blockquote className="font-body text-ink/90 leading-relaxed">
            &ldquo;{q.text}&rdquo;
          </blockquote>
          <figcaption className="mt-4 text-sm text-rose font-semibold">
            {q.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
