/* Heimdallone — Marketing chrome (nav + footer)
   Inject via: <div data-marketing-nav></div> and <div data-marketing-footer></div>
   Pass data-current="pricing" on body to highlight active nav item.
*/
(() => {
	const NAV_LINKS = [
		{ key: "product", label: "Product", href: "marketing.html#features" },
		{ key: "features", label: "Features", href: "features.html" },
		{ key: "payroll", label: "Payroll", href: "marketing.html#payroll" },
		{ key: "pricing", label: "Pricing", href: "pricing.html" },
		{ key: "docs", label: "Docs", href: "docs.html" },
	];

	function navHTML(current) {
		return `
      <nav class="m-nav" data-screen-label="Marketing Nav">
        <div class="container m-nav-inner">
          <a href="marketing.html" class="h-logo">
            <span data-heimdall-logo class="h-logo-mark"></span>
            <span>Heimdallone</span>
          </a>
          <div class="m-nav-links">
            ${NAV_LINKS.map((l) => `<a href="${l.href}" class="${current === l.key ? "active" : ""}">${l.label}</a>`).join("")}
          </div>
          <div class="m-nav-actions">
            <div class="theme-toggle" data-theme-toggle>
              <button data-theme="dark" title="Dark">${window.Icon("moon", 14)}</button>
              <button data-theme="light" title="Light">${window.Icon("sun", 14)}</button>
            </div>
            <a href="login.html" class="btn btn-ghost">Sign in</a>
            <a href="app/dashboard.html" class="btn btn-primary">Get started ${window.Icon("arrow-right", 13)}</a>
          </div>
        </div>
      </nav>
    `;
	}

	function footerHTML() {
		return `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-col">
              <a href="marketing.html" class="h-logo" style="margin-bottom: 16px;">
                <span data-heimdall-logo class="h-logo-mark"></span>
                <span>Heimdallone</span>
              </a>
              <p style="font-size: 13px; color: var(--fg-3); max-width: 280px; line-height: 1.5;">The workforce command center for multi-country operations.</p>
            </div>
            <div class="footer-col">
              <h5>Product</h5>
              <a href="features.html">Features</a>
              <a href="marketing.html#payroll">Payroll</a>
              <a href="marketing.html#compliance">Compliance</a>
              <a href="docs.html#integrations">Integrations</a>
            </div>
            <div class="footer-col">
              <h5>Solutions</h5>
              <a href="#">For operations</a>
              <a href="#">For finance</a>
              <a href="#">For HR leaders</a>
              <a href="#">Multi-tenant</a>
            </div>
            <div class="footer-col">
              <h5>Resources</h5>
              <a href="docs.html">Documentation</a>
              <a href="#">Changelog</a>
              <a href="#">Status</a>
              <a href="#">Security</a>
            </div>
            <div class="footer-col">
              <h5>Company</h5>
              <a href="#">About</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
              <a href="#">Privacy</a>
            </div>
          </div>
          <div class="footer-meta">
            <div>© 2026 Heimdallone. All rights reserved.</div>
            <div class="mono">v0.4.0-preview · build #1148</div>
          </div>
        </div>
      </footer>
    `;
	}

	document.addEventListener("DOMContentLoaded", () => {
		const current = document.body.dataset.current;
		const navHost = document.querySelector("[data-marketing-nav]");
		const footHost = document.querySelector("[data-marketing-footer]");
		if (navHost) {
			navHost.outerHTML = navHTML(current);
		}
		if (footHost) {
			footHost.outerHTML = footerHTML();
		}
		if (window.hydrateIcons) {
			window.hydrateIcons();
		}
		if (window.hydrateLogos) {
			window.hydrateLogos();
		}
		// sync theme toggle state
		const t = document.documentElement.getAttribute("data-theme");
		document
			.querySelectorAll("[data-theme-toggle] button")
			.forEach((b) => b.classList.toggle("active", b.dataset.theme === t));
	});
})();
