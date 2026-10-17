export function Forbidden() {
  return (
    <section>
      <p
        aria-hidden="true"
        className="text-[16vw] leading-none font-medium tracking-[-0.06em] text-ghost"
      >
        403
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Not allowed</h1>
      <p className="mt-2 text-muted">Your role cannot open this page.</p>
    </section>
  );
}
