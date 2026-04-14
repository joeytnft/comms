export function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
              <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">GatherSafe</span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm text-slate-500">
            <a href="mailto:hello@gathersafeapp.com" className="transition-colors hover:text-slate-300">
              Contact
            </a>
            <a href="/privacy" className="transition-colors hover:text-slate-300">
              Privacy
            </a>
            <a href="/terms" className="transition-colors hover:text-slate-300">
              Terms
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm text-slate-600">
            &copy; {new Date().getFullYear()} GatherSafe. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
