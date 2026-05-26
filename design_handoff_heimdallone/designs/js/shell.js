/* Heimdallone — Shared App Shell
   Renders sidebar + topbar into [data-app-shell-sidebar] and [data-app-shell-topbar].
   Pass `data-current` on body to highlight the active nav item.
*/
(() => {
	const NAV = [
		{
			group: "Operate",
			items: [
				{
					key: "overview",
					label: "Overview",
					icon: "layout-dashboard",
					href: "dashboard.html",
				},
				{
					key: "employees",
					label: "Employees",
					icon: "users",
					href: "employees.html",
					meta: "1,284",
				},
				{
					key: "attendance",
					label: "Attendance",
					icon: "clock",
					href: "attendance.html",
				},
				{
					key: "leave",
					label: "Leave",
					icon: "calendar",
					href: "leave.html",
					meta: "12",
				},
				{
					key: "payroll",
					label: "Payroll",
					icon: "wallet",
					href: "payroll.html",
					meta: "●",
					metaAccent: true,
				},
			],
		},
		{
			group: "Govern",
			items: [
				{
					key: "countries",
					label: "Countries & Tax",
					icon: "globe",
					href: "countries.html",
				},
				{
					key: "compliance",
					label: "Compliance",
					icon: "shield-check",
					href: "compliance.html",
					meta: "3",
				},
				{
					key: "documents",
					label: "Documents",
					icon: "file-text",
					href: "documents.html",
				},
				{
					key: "clients",
					label: "Clients",
					icon: "briefcase",
					href: "clients.html",
				},
			],
		},
		{
			group: "Workspace",
			items: [
				{
					key: "settings",
					label: "Settings",
					icon: "settings",
					href: "settings.html",
				},
			],
		},
	];

	function renderSidebar(host, current) {
		if (!host) {
			return;
		}
		host.innerHTML = `
      <div class="menu-root" style="border-bottom: 1px solid var(--line);">
        <div class="tenant-switcher" data-menu-trigger="tenantMenu">
          <div class="tenant-avatar">AS</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 13.5px; letter-spacing: -0.005em;">Atlas Shipping</div>
            <div style="font-size: 11.5px; color: var(--fg-3); display: flex; align-items: center; gap: 5px;">
              <span data-flag="GY"></span>
              <span data-flag="TT"></span>
              <span data-flag="BB"></span>
              <span style="color: var(--fg-4);">+ 2 more</span>
            </div>
          </div>
          <span data-icon="chevron-down" data-size="14" style="color: var(--fg-3);"></span>
        </div>
        <div class="menu" data-menu="tenantMenu" data-side="bottom-start" style="left: 14px; right: 14px; min-width: 0; top: calc(100% - 6px);">
          <div class="menu-section">Switch workspace</div>
          <button class="menu-item">
            <span class="tenant-avatar" style="width: 22px; height: 22px; border-radius: 7px; font-size: 10px;">AS</span>
            <span style="flex: 1;">Atlas Shipping</span>
            <span class="menu-meta">current</span>
          </button>
          <button class="menu-item">
            <span class="tenant-avatar" style="width: 22px; height: 22px; border-radius: 7px; font-size: 10px; background: linear-gradient(135deg, #4f8dff, #7aa9ff); color: #fff;">MG</span>
            <span style="flex: 1;">Mahaica Group</span>
            <span class="menu-meta">328 emp</span>
          </button>
          <button class="menu-item">
            <span class="tenant-avatar" style="width: 22px; height: 22px; border-radius: 7px; font-size: 10px; background: linear-gradient(135deg, #3ddc97, #5fe6ad); color: #0a1813;">TC</span>
            <span style="flex: 1;">Trident Capital</span>
            <span class="menu-meta">84 emp</span>
          </button>
          <div class="menu-sep"></div>
          <button class="menu-item">
            <span class="menu-icon">${window.Icon("plus", 14)}</span>
            <span>Create workspace</span>
          </button>
          <button class="menu-item">
            <span class="menu-icon">${window.Icon("settings", 14)}</span>
            <span>Workspace settings</span>
          </button>
        </div>
      </div>

      ${NAV.map(
				(group) => `
        <div class="sidebar-section">
          <div class="nav-group-label">${group.group}</div>
          ${group.items
						.map(
							(it) => `
            <a href="${it.href}" class="nav-item ${it.key === current ? "active" : ""}">
              <span class="nav-icon">${window.Icon(it.icon, 16)}</span>
              <span>${it.label}</span>
              ${it.meta ? `<span class="nav-meta" style="${it.metaAccent ? "color: var(--accent);" : ""}">${it.meta}</span>` : ""}
            </a>
          `
						)
						.join("")}
        </div>
      `
			).join("")}

      <div class="menu-root" style="margin-top: auto; border-top: 1px solid var(--line);">
        <div data-menu-trigger="userMenu" style="padding: 14px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background 120ms ease;">
          <div class="avatar" style="width: 30px; height: 30px;">MP</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12.5px; font-weight: 500;">Maya Persaud</div>
            <div style="font-size: 11px; color: var(--fg-3);">Ops Lead · Atlas</div>
          </div>
          <span data-icon="chevron-down" data-size="14" style="color: var(--fg-3);"></span>
        </div>
        <div class="menu" data-menu="userMenu" data-side="top-end" style="left: 12px; right: 12px; min-width: 0; bottom: calc(100% - 4px); transform-origin: bottom left;">
          <div style="padding: 10px 10px 8px; border-bottom: 1px solid var(--line); margin: -2px -2px 4px;">
            <div style="font-size: 12.5px; font-weight: 500;">Maya Persaud</div>
            <div style="font-size: 11px; color: var(--fg-3);">maya@atlas-shipping.com</div>
          </div>
          <button class="menu-item"><span class="menu-icon">${window.Icon("user", 14)}</span> Profile</button>
          <button class="menu-item"><span class="menu-icon">${window.Icon("settings", 14)}</span> Account settings</button>
          <button class="menu-item"><span class="menu-icon">${window.Icon("shield", 14)}</span> Security <span class="menu-meta">2FA on</span></button>
          <div class="menu-sep"></div>
          <button class="menu-item"><span class="menu-icon">${window.Icon("command", 14)}</span> Command palette <span class="menu-meta"><span class="kbd">⌘</span><span class="kbd">K</span></span></button>
          <button class="menu-item"><span class="menu-icon">${window.Icon("info", 14)}</span> Help &amp; docs</button>
          <div class="menu-sep"></div>
          <button class="menu-item danger"><span class="menu-icon">${window.Icon("log-out", 14)}</span> Sign out</button>
        </div>
      </div>
    `;
		window.hydrateFlags(host);
	}

	function renderTopbar(host) {
		if (!host) {
			return;
		}
		host.innerHTML = `
      <button class="cmd-trigger">
        <span data-icon="search" data-size="15"></span>
        <span>Find anyone, anything…</span>
        <span class="right"><span class="kbd">⌘</span><span class="kbd">K</span></span>
      </button>

      <div class="menu-root" style="display: flex; align-items: center; gap: 6px;">
        <button class="badge badge-success" data-menu-trigger="hrSyncMenu" style="border: 0; cursor: pointer; font-family: inherit; height: 26px; padding: 0 10px;">
          <span class="badge-dot"></span>HR sync · 14:42
        </button>
        <div class="menu" data-menu="hrSyncMenu" data-side="bottom-start" style="min-width: 280px;">
          <div class="menu-section">Horilla HRMS sync</div>
          <div style="padding: 8px 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12.5px;">
              <span style="color: var(--fg-2);">Status</span>
              <span class="badge badge-success" style="height: 18px;"><span class="badge-dot"></span>Operational</span>
            </div>
            <div class="kv" style="padding: 6px 0;"><span class="kv-k">Last full sync</span><span class="kv-v">14:42:08</span></div>
            <div class="kv" style="padding: 6px 0;"><span class="kv-k">Records ingested</span><span class="kv-v">1,284</span></div>
            <div class="kv" style="padding: 6px 0;"><span class="kv-k">Next sync</span><span class="kv-v">15:00</span></div>
          </div>
          <div class="menu-sep"></div>
          <button class="menu-item"><span class="menu-icon">${window.Icon("play", 14)}</span> Sync now</button>
          <button class="menu-item"><span class="menu-icon">${window.Icon("external-link", 14)}</span> Open Horilla admin</button>
        </div>
      </div>

      <div style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
        <div class="theme-toggle" data-theme-toggle>
          <button data-theme="dark" title="Dark">${window.Icon("moon", 14)}</button>
          <button data-theme="light" title="Light">${window.Icon("sun", 14)}</button>
        </div>

        <div class="menu-root">
          <button class="icon-btn" data-menu-trigger="notifMenu" title="Notifications" style="position: relative;">
            ${window.Icon("bell", 16)}
            <span style="position: absolute; top: 7px; right: 7px; width: 6px; height: 6px; background: var(--accent); border-radius: 50%; border: 1.5px solid var(--bg);"></span>
          </button>
          <div class="menu menu-wide" data-menu="notifMenu" data-side="bottom-end">
            <div class="menu-header">
              <span class="ttl">Notifications</span>
              <span class="clear">Mark all read</span>
            </div>
            <div class="menu-notif-item">
              <div class="icon warn">${window.Icon("alert-triangle", 13)}</div>
              <div>
                <div class="ttl">NIS rate change · Guyana</div>
                <div class="desc">Profile gy.v2026.2 staged. Effective 1 Oct.</div>
                <div class="time">12 min ago</div>
              </div>
            </div>
            <div class="menu-notif-item">
              <div class="icon info">${window.Icon("info", 13)}</div>
              <div>
                <div class="ttl">14 contracts renew this quarter</div>
                <div class="desc">Renewal pack ready for review.</div>
                <div class="time">38 min ago</div>
              </div>
            </div>
            <div class="menu-notif-item">
              <div class="icon success">${window.Icon("check", 13)}</div>
              <div>
                <div class="ttl">Barbados pay run sealed</div>
                <div class="desc">BBD 412,600 · 88 employees · by you</div>
                <div class="time">14:08</div>
              </div>
            </div>
            <div class="menu-sep"></div>
            <button class="menu-item" style="justify-content: center; color: var(--accent);">View all activity</button>
          </div>
        </div>

        <button class="icon-btn" title="Help">${window.Icon("info", 16)}</button>
        <div style="width: 1px; height: 20px; background: var(--line); margin: 0 4px;"></div>

        <div class="menu-root">
          <button class="avatar" data-menu-trigger="topUserMenu" title="Maya Persaud" style="border: 0; cursor: pointer; font-family: inherit;">MP</button>
          <div class="menu" data-menu="topUserMenu" data-side="bottom-end">
            <div style="padding: 10px 10px 8px; border-bottom: 1px solid var(--line); margin: -2px -2px 4px;">
              <div style="font-size: 12.5px; font-weight: 500;">Maya Persaud</div>
              <div style="font-size: 11px; color: var(--fg-3);">maya@atlas-shipping.com</div>
            </div>
            <button class="menu-item"><span class="menu-icon">${window.Icon("user", 14)}</span> Profile</button>
            <button class="menu-item"><span class="menu-icon">${window.Icon("settings", 14)}</span> Account settings</button>
            <button class="menu-item"><span class="menu-icon">${window.Icon("command", 14)}</span> Keyboard shortcuts <span class="menu-meta"><span class="kbd">?</span></span></button>
            <div class="menu-sep"></div>
            <button class="menu-item danger"><span class="menu-icon">${window.Icon("log-out", 14)}</span> Sign out</button>
          </div>
        </div>
      </div>
    `;
		const t = window.HeimdallTheme.get();
		host
			.querySelectorAll("[data-theme-toggle] button")
			.forEach((b) => b.classList.toggle("active", b.dataset.theme === t));
	}

	window.renderAppShell = () => {
		const current = document.body.dataset.current;
		renderSidebar(document.querySelector("[data-app-shell-sidebar]"), current);
		renderTopbar(document.querySelector("[data-app-shell-topbar]"));
		window.hydrateIcons();
	};

	document.addEventListener("DOMContentLoaded", () => {
		if (window.renderAppShell) {
			window.renderAppShell();
		}
	});
})();
