export function NotFound() {
  return (
    <section>
      <p
        aria-hidden="true"
        className="text-[16vw] leading-none font-medium tracking-[-0.06em] text-ghost"
      >
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">That address does not exist.</p>
    </section>
  );
}
