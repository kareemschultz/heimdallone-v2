/* Heimdallone shared client helpers
   - Theme (dark/light) with localStorage persistence
   - SVG icon system (Lucide-style strokes)
   - Tiny country flag generator
*/
(() => {
	// ---- Theme ----
	const KEY = "heimdall.theme";
	const stored = (() => {
		try {
			return localStorage.getItem(KEY);
		} catch {
			return null;
		}
	})();
	const initial = stored || "dark";
	document.documentElement.setAttribute("data-theme", initial);

	window.HeimdallTheme = {
		get() {
			return document.documentElement.getAttribute("data-theme");
		},
		set(t) {
			document.documentElement.setAttribute("data-theme", t);
			try {
				localStorage.setItem(KEY, t);
			} catch {}
			document.querySelectorAll("[data-theme-toggle] button").forEach((b) => {
				b.classList.toggle("active", b.dataset.theme === t);
			});
		},
		toggle() {
			this.set(this.get() === "dark" ? "light" : "dark");
		},
	};

	document.addEventListener("click", (e) => {
		const btn = e.target.closest("[data-theme-toggle] button");
		if (btn && btn.dataset.theme) {
			window.HeimdallTheme.set(btn.dataset.theme);
		}
	});

	// ---- Icons (Lucide-style SVG paths) ----
	const ICONS = {
		"layout-dashboard":
			'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
		users:
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
		clock:
			'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
		calendar:
			'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
		wallet:
			'<path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h16v4"/><path d="M3 7v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><circle cx="17" cy="14.5" r="1.5"/>',
		globe:
			'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
		"shield-check":
			'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
		"file-text":
			'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
		briefcase:
			'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
		settings:
			'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
		search:
			'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
		bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
		"chevron-down": '<polyline points="6 9 12 15 18 9"/>',
		"chevron-right": '<polyline points="9 18 15 12 9 6"/>',
		"chevron-left": '<polyline points="15 18 9 12 15 6"/>',
		"arrow-up-right":
			'<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
		"arrow-right":
			'<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
		"arrow-up":
			'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
		"arrow-down":
			'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
		"trending-up":
			'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
		"trending-down":
			'<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
		check: '<polyline points="20 6 9 17 4 12"/>',
		x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
		"alert-triangle":
			'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
		info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
		moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
		sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
		plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
		"more-horizontal":
			'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
		play: '<polygon points="5 3 19 12 5 21 5 3"/>',
		fingerprint:
			'<path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/>',
		lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
		filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
		download:
			'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
		"external-link":
			'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
		circle: '<circle cx="12" cy="12" r="10"/>',
		zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
		activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
		database:
			'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
		command:
			'<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
		eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
		"log-out":
			'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
		folder:
			'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
		"git-branch":
			'<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
		sparkles:
			'<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
		shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
		building:
			'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
		"users-2":
			'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
		menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
		user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
		github:
			'<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
		key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
	};

	window.Icon = (name, size = 16, opts = {}) => {
		const body = ICONS[name] || ICONS["circle"];
		const sw = opts.strokeWidth || 1.75;
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
	};

	// Replace [data-icon="name"] placeholders
	function hydrateIcons(root = document) {
		root.querySelectorAll("[data-icon]").forEach((el) => {
			if (el.dataset.iconHydrated) {
				return;
			}
			const name = el.dataset.icon;
			const size = Number.parseInt(el.dataset.size || "16", 10);
			el.innerHTML = window.Icon(name, size);
			el.dataset.iconHydrated = "1";
		});
	}
	window.hydrateIcons = hydrateIcons;
	document.addEventListener("DOMContentLoaded", () => hydrateIcons());

	// ---- Country flag (mini SVG, schematic) ----
	// Just simple horizontal stripes; recognizable for the few we use.
	const FLAGS = {
		GY: {
			type: "triangles",
			a: "#cd1f25",
			b: "#fdca39",
			c: "#019a3d",
			k: "#000",
			w: "#fff",
		}, // Guyana golden arrowhead (simplified)
		TT: { type: "diag", a: "#da141c", b: "#fff", c: "#000" }, // T&T red with black/white diagonal
		BB: { type: "vstripes", a: "#00267e", b: "#ffc726", c: "#00267e" }, // Barbados
		JM: { type: "saltire", a: "#009b3a", b: "#000", c: "#fed100" }, // Jamaica
		US: { type: "us" },
		CA: { type: "ca" },
		GB: { type: "uk" },
	};
	window.flagSvg = (cc) => {
		const f = FLAGS[cc];
		if (!f) {
			return "";
		}
		const w = 18,
			h = 12;
		if (f.type === "vstripes") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="6" height="12" fill="${f.a}"/><rect x="6" width="6" height="12" fill="${f.b}"/><rect x="12" width="6" height="12" fill="${f.c}"/></svg>`;
		}
		if (f.type === "diag") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="18" height="12" fill="${f.a}"/><polygon points="0,0 7,0 18,12 11,12" fill="${f.b}"/><polygon points="2,0 5,0 16,12 13,12" fill="${f.c}"/></svg>`;
		}
		if (f.type === "saltire") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="18" height="12" fill="${f.c}"/><polygon points="0,0 9,6 0,12" fill="${f.a}"/><polygon points="18,0 9,6 18,12" fill="${f.a}"/><polygon points="0,0 18,0 9,6" fill="${f.b}"/><polygon points="0,12 18,12 9,6" fill="${f.b}"/></svg>`;
		}
		if (f.type === "triangles") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="18" height="12" fill="${f.c}"/><polygon points="0,0 18,6 0,12" fill="${f.b}"/><polygon points="0,0 14,6 0,12" fill="${f.k}" opacity="0.55"/><polygon points="0,0 11,6 0,12" fill="${f.a}"/></svg>`;
		}
		if (f.type === "us") {
			let s = `<svg viewBox="0 0 18 12" width="${w}" height="${h}">`;
			for (let i = 0; i < 7; i++) {
				s += `<rect y="${i * (12 / 7)}" width="18" height="${12 / 7}" fill="${i % 2 === 0 ? "#b22234" : "#fff"}"/>`;
			}
			s += `<rect width="8" height="${(12 * 4) / 7}" fill="#3c3b6e"/></svg>`;
			return s;
		}
		if (f.type === "ca") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="4.5" height="12" fill="#d80021"/><rect x="4.5" width="9" height="12" fill="#fff"/><rect x="13.5" width="4.5" height="12" fill="#d80021"/><path d="M9 3.5 L9.6 5 L11 4.5 L10.2 6 L11.2 7 L9.8 6.8 L9.5 8 L9 7.2 L8.5 8 L8.2 6.8 L6.8 7 L7.8 6 L7 4.5 L8.4 5 Z" fill="#d80021"/></svg>`;
		}
		if (f.type === "uk") {
			return `<svg viewBox="0 0 18 12" width="${w}" height="${h}"><rect width="18" height="12" fill="#012169"/><path d="M0,0 L18,12 M18,0 L0,12" stroke="#fff" stroke-width="2"/><path d="M0,0 L18,12 M18,0 L0,12" stroke="#c8102e" stroke-width="1"/><rect x="7" width="4" height="12" fill="#fff"/><rect y="4" width="18" height="4" fill="#fff"/><rect x="8" width="2" height="12" fill="#c8102e"/><rect y="5" width="18" height="2" fill="#c8102e"/></svg>`;
		}
		return "";
	};

	window.hydrateFlags = (root = document) => {
		root.querySelectorAll("[data-flag]").forEach((el) => {
			if (el.dataset.flagHydrated) {
				return;
			}
			el.innerHTML = window.flagSvg(el.dataset.flag.toUpperCase());
			el.dataset.flagHydrated = "1";
		});
	};
	document.addEventListener("DOMContentLoaded", () => window.hydrateFlags());

	// ---- Heimdall logo (geometric H + watchful eye) ----
	window.heimdallLogo = (
		size = 22
	) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="4.2" height="26" rx="1" fill="currentColor"/>
      <rect x="23.8" y="3" width="4.2" height="26" rx="1" fill="currentColor"/>
      <path d="M6 16 Q16 9 26 16 Q16 23 6 16 Z" fill="currentColor" opacity="0.95"/>
      <ellipse cx="16" cy="16" rx="3.2" ry="3.2" fill="var(--bg, #0a0d12)"/>
      <circle cx="16" cy="16" r="1.4" fill="currentColor"/>
    </svg>`;
	window.hydrateLogos = (root = document) => {
		root.querySelectorAll("[data-heimdall-logo]").forEach((el) => {
			if (el.dataset.logoHydrated) {
				return;
			}
			const size = Number.parseInt(el.dataset.size || "22", 10);
			el.innerHTML = window.heimdallLogo(size);
			el.dataset.logoHydrated = "1";
		});
	};
	document.addEventListener("DOMContentLoaded", () => window.hydrateLogos());

	// ============================================================
	//  shadcn-style: Tabs
	//  Use: <div class="tabs" data-tabs="myGroup">
	//         <button class="tab" data-tab="overview" aria-selected="true">Overview</button>
	//         <button class="tab" data-tab="settings">Settings</button>
	//       </div>
	//       <div class="tab-panel active" data-tab-panel="overview">…</div>
	//       <div class="tab-panel" data-tab-panel="settings">…</div>
	// ============================================================
	document.addEventListener("click", (e) => {
		const tabBtn = e.target.closest(".tab[data-tab]");
		if (!tabBtn) {
			return;
		}
		const container = tabBtn.closest("[data-tabs]");
		if (!container) {
			return;
		}
		const group = container.dataset.tabs;
		const key = tabBtn.dataset.tab;
		// toggle aria-selected on siblings
		container.querySelectorAll(".tab[data-tab]").forEach((b) => {
			b.setAttribute("aria-selected", b === tabBtn ? "true" : "false");
		});
		// show matching panels in same group (siblings of container or parent scope)
		const scope =
			container.closest("[data-tab-scope]") || container.parentElement;
		scope
			.querySelectorAll(
				`[data-tab-panel][data-tab-group="${group}"], [data-tab-panel]`
			)
			.forEach((p) => {
				if (p.dataset.tabGroup && p.dataset.tabGroup !== group) {
					return;
				}
				p.classList.toggle("active", p.dataset.tabPanel === key);
			});
	});

	// ============================================================
	//  shadcn-style: Dropdown menus
	//  Use: <div class="menu-root">
	//         <button data-menu-trigger="myMenu">…</button>
	//         <div class="menu" data-menu="myMenu" data-side="bottom-end">…</div>
	//       </div>
	// ============================================================
	function closeAllMenus(except) {
		document.querySelectorAll('.menu[data-open="true"]').forEach((m) => {
			if (m !== except) {
				m.dataset.open = "false";
			}
		});
	}
	document.addEventListener("click", (e) => {
		const trigger = e.target.closest("[data-menu-trigger]");
		if (trigger) {
			e.preventDefault();
			e.stopPropagation();
			const id = trigger.dataset.menuTrigger;
			const menu =
				trigger
					.closest(".menu-root")
					?.querySelector(`.menu[data-menu="${id}"]`) ||
				document.querySelector(`.menu[data-menu="${id}"]`);
			if (!menu) {
				return;
			}
			const isOpen = menu.dataset.open === "true";
			closeAllMenus(menu);
			menu.dataset.open = isOpen ? "false" : "true";
			return;
		}
		// click inside open menu? keep it open unless it's a menu-item
		const insideMenu = e.target.closest(".menu[data-open='true']");
		const isItem = e.target.closest(".menu-item, [data-menu-close]");
		if (insideMenu && !isItem) {
			return;
		}
		closeAllMenus(null);
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			closeAllMenus(null);
		}
	});

	// ============================================================
	//  Spotlight effect — track mouse for [data-spotlight] elements
	// ============================================================
	document.addEventListener("mousemove", (e) => {
		const t = e.target.closest(".spotlight");
		if (!t) {
			return;
		}
		const r = t.getBoundingClientRect();
		t.style.setProperty("--mx", e.clientX - r.left + "px");
		t.style.setProperty("--my", e.clientY - r.top + "px");
	});

	// ============================================================
	//  Animated number counter — counts when scrolled into view
	//  Use: <span class="count-up" data-end="1284" data-duration="1500"></span>
	// ============================================================
	function animateCount(el) {
		if (el.dataset.counted) {
			return;
		}
		el.dataset.counted = "1";
		const end = Number.parseFloat(el.dataset.end);
		const duration = Number.parseInt(el.dataset.duration || "1400", 10);
		const decimals = Number.parseInt(el.dataset.decimals || "0", 10);
		const prefix = el.dataset.prefix || "";
		const suffix = el.dataset.suffix || "";
		const formatter = new Intl.NumberFormat(undefined, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
		const start = performance.now();
		function frame(now) {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3;
			const value = end * eased;
			el.textContent = prefix + formatter.format(value) + suffix;
			if (t < 1) {
				requestAnimationFrame(frame);
			}
		}
		requestAnimationFrame(frame);
	}

	// ============================================================
	//  Reveal-on-scroll for .reveal elements
	// ============================================================
	function setupObservers() {
		if (!("IntersectionObserver" in window)) {
			document
				.querySelectorAll(".reveal")
				.forEach((el) => el.classList.add("in"));
			document.querySelectorAll(".count-up[data-end]").forEach(animateCount);
			return;
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const ent of entries) {
					if (!ent.isIntersecting) {
						continue;
					}
					if (ent.target.classList.contains("reveal")) {
						ent.target.classList.add("in");
					}
					if (ent.target.matches(".count-up[data-end]")) {
						animateCount(ent.target);
					}
					io.unobserve(ent.target);
				}
			},
			{ threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
		);
		document
			.querySelectorAll(".reveal, .count-up[data-end]")
			.forEach((el) => io.observe(el));
	}
	document.addEventListener("DOMContentLoaded", setupObservers);
})();
