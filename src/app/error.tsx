"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center space-y-4">
      <h1 className="text-2xl text-[#e0bd4a]">Something went wrong</h1>
      <p className="text-sm text-[#b9ac93]">
        Nothing was saved. You can try again, or head back to the shop.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={reset} className="btn-gold">Try again</button>
        <a href="/" className="btn-ghost">Back to shop</a>
      </div>
    </div>
  );
}
