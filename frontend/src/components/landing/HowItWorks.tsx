const STEPS = [
  {
    number: "01",
    title: "Find your subject",
    body: "Pick your program, branch, and semester — narrow straight down to the subject you need.",
  },
  {
    number: "02",
    title: "Open what's approved",
    body: "Every note has already passed moderation, so you can trust what you open.",
  },
  {
    number: "03",
    title: "Upload your own",
    body: "Give back in two steps — pick the subject, add your file, and it's in the queue.",
  },
];

export function HowItWorks() {
  return (
    <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
      {STEPS.map((step) => (
        <div key={step.number} className="flex flex-col gap-2">
          <span className="font-mono text-caption text-text-tertiary">{step.number}</span>
          <h3 className="text-ui font-semibold text-text-primary">{step.title}</h3>
          <p className="text-ui text-text-muted">{step.body}</p>
        </div>
      ))}
    </div>
  );
}
