export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-emerald-500">
                <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
              </div>
              <span className="font-semibold text-white">GatherSafe</span>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Secure communication built from the ground up for faith-based security teams.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-slate-400">Product</span>
              <a href="#why" className="text-slate-500 transition-colors hover:text-slate-300">Why GatherSafe</a>
              <a href="#features" className="text-slate-500 transition-colors hover:text-slate-300">Features</a>
              <a href="#pricing" className="text-slate-500 transition-colors hover:text-slate-300">Pricing</a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-slate-400">Company</span>
              <a href="mailto:hello@gathersafeapp.com" className="text-slate-500 transition-colors hover:text-slate-300">Contact</a>
              <a href="/privacy" className="text-slate-500 transition-colors hover:text-slate-300">Privacy Policy</a>
              <a href="/terms" className="text-slate-500 transition-colors hover:text-slate-300">Terms of Service</a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
          <p className="text-sm text-slate-600">
            &copy; {new Date().getFullYear()} GatherSafe. All rights reserved.
          </p>
          <p className="text-sm text-slate-600">
            <a href="https://gathersafeapp.com" className="hover:text-slate-400">gathersafeapp.com</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
