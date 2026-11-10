import { useEffect, useRef, type ReactNode } from "react";
import "./funnel.css";

function ChipMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="18" height="18" rx="3" fill="#c8874a" />
      <rect x="9" y="9" width="10" height="10" rx="1.5" fill="#1a2027" />
      <g stroke="#c8874a" strokeWidth="2">
        <path d="M9 1v4M14 1v4M19 1v4M9 23v4M14 23v4M19 23v4M1 9h4M1 14h4M1 19h4M23 9h4M23 14h4M23 19h4" />
      </g>
    </svg>
  );
}

export default function FunnelLayout({
  current,
  focusOnMount = false,
  children,
}: {
  current: "start" | "request";
  focusOnMount?: boolean;
  children: ReactNode;
}) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Move focus to the page on route change so keyboard and screen-reader
    // users start at the new content, not the old link.
    if (focusOnMount) mainRef.current?.focus({ preventScroll: true });
  }, [current, focusOnMount]);
  return (
    <div className="fos-funnel">
      <a
        className="fx-skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="fx-mast">
        <a className="fx-mark" href="#/start">
          <ChipMark />
          Fiduciary OS
        </a>
        <nav aria-label="Funnel pages" className="fx-nav">
          <a href="#/start" aria-current={current === "start" ? "page" : undefined}>
            How it works
          </a>
          <a href="#/request" aria-current={current === "request" ? "page" : undefined}>
            Request advice &amp; plans
          </a>
          <a href="#/workspace">Workspace preview</a>
        </nav>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="fx-main">
        {children}
      </main>
      <footer className="fx-footer">
        <div className="fx-wrap">
          Sample results only, not advice. The guide is a guided assistant,
          not a licensed advisor. Nothing on these pages is saved or sent.
        </div>
      </footer>
    </div>
  );
}
