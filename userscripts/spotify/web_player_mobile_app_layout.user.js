// ==UserScript==
// @name         Spotify Web Player — Mobile App Layout
// @namespace    com.github.u25339iMpJ
// @description  Rebuilds Spotify's desktop web player as a phone-app style UI: native home header with filter chips, 2-column shortcut cards, bottom tab navigation, mini player, and a full-screen Now Playing view with blurred-cover background and Canvas video support.
// @icon         https://external-content.duckduckgo.com/ip3/spotify.com.ico
// @match        https://open.spotify.com/*
// @version      27.9.0
// @copyright    GPL-3.0-or-later
// @grant        none
// @noframes
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/JellyDime/laughing-octo-pancake/refs/heads/main/userscripts/spotify/web_player_mobile_app_layout.user.js
// @supportURL   https://github.com/JellyDime/laughing-octo-pancake/issues
// @homepageURL  https://github.com/JellyDime/laughing-octo-pancake
// ==/UserScript==

/*
 * Architecture (v27 — full rewrite of the mobile layout strategy)
 *
 * Previous versions restructured Spotify's own now-playing bar with grids and
 * padding. This version leaves the native <aside data-testid="now-playing-bar">
 * completely untouched and renders it invisible above the custom bottom stack
 * (visibility: hidden, pointer-events: none). It stays fully functional:
 *
 *   - state  : title / artist / cover / progress / like / shuffle / repeat /
 *              device rows are read from the native bar and mirrored into the
 *              custom mini player + full-screen player.
 *   - control: the custom buttons .click() the native (hidden) buttons.
 *   - seeking: the native progress bar ships a visually-hidden
 *              <input type="range"> (values in milliseconds). Setting its
 *              value and dispatching input/change events seeks natively —
 *              no pointer-event synthesis needed.
 *   - popovers: keeping the bar laid out (not display:none) means Spotify's
 *              own popovers (device picker, etc.) still anchor above the
 *              custom bottom stack.
 *
 * Custom chrome injected at <body> level:
 *   #su-chrome  — bottom stack: mini player + tab bar (Home/Search/Library)
 *   #su-full    — full-screen Now Playing view (Image 3 style)
 *   #su-toast   — small feedback pill
 *
 * The desktop top bar is restyled in place: the account avatar (Spotify's
 * profile menu anchor) moves to the leading edge like the phone app, and the
 * route decides what follows it — Spotify's own home filter chips
 * (All / Music / Podcasts, mirrored into the bar so React keeps owning the
 * originals) on Home, or a custom search field on Search.
 *
 *   - v27.1: bottom chrome restyled to match the native phone app even
 *     closer — icon-only tab bar (no labels) on pure black, slimmer mini
 *     player (play/pause only, full-bleed progress hairline), pure-black
 *     page background, square shelf cards with title/subtitle below the
 *     art, 24px greeting.
 *
 *   - v27.2: the Library tab no longer navigates to /collection/playlists.
 *     That route is gone from the web player's route table (it falls back
 *     to the /collection → /collection/tracks redirect, i.e. Liked Songs).
 *     The tab now reveals the native library panel (#Desktop_LeftSidebar_Id)
 *     as the main view, expanding it and switching it to its full-page
 *     mode when available, so playlists, podcasts and artists are reachable.
 *
 *   - v27.3: the Home tab auto-recovers from Spotify's "Something went
 *     wrong." feed error. The home GraphQL query is cached by React Query
 *     inside a provider mounted on the / layout route, so re-tapping Home
 *     (a popstate on the same route) never remounts it and the error page
 *     sticks until a full reload. The script now detects the error state
 *     (icon + two <p> lines where the feed should be), forces a real
 *     unmount/remount of the home route tree via a blank catch-all path
 *     (React Query refetches errored queries on the fresh mount), and —
 *     if the feed still will not load — performs a single reload guarded
 *     by a sessionStorage flag so it can never loop.
 *
 *   - v27.4: the bottom tab bar mirrors the native phone app exactly —
 *     Spotify's real Home / Search / Your Library glyphs (the leaning-book
 *     library mark replaces the placeholder bar chart), outline glyphs for
 *     inactive tabs and filled ones for the current tab, and the Home /
 *     Search / Your Library captions under the icons (v27.1 had gone
 *     icon-only). The bar grows to 56px to fit icon + caption.
 *
 *   - v27.6.0: the home header now mirrors the phone app. The "Good
 *     evening" greeting is gone — the app has none — and Spotify's own
 *     All / Music / Podcasts filter chips (which the script used to hide
 *     along with the desktop feed header) are mirrored into the top bar as
 *     pill buttons next to the avatar; tapping a mirror clicks the native
 *     chip, so feed filtering stays Spotify's own logic. The shortcut
 *     tiles are rebuilt as the app's horizontal cards — square cover on
 *     the left, single-line bold name beside it on a flat #1f1f1f card —
 *     replacing the art-filled tiles whose selectors depended on a
 *     draggable attribute Spotify no longer ships (they had degraded into
 *     unlabeled cover crops). The mini player gains the app's other two
 *     controls: a Connect-to-device button and a save-to-Liked-Songs
 *     check (green disc when saved), matching the native bar.
 *
 *   - v27.6.1: flat black home, like the phone app. Spotify washes the
 *     top of the web home feed with a per-user color gradient and tints
 *     the top bar to match — the app has neither. Static CSS pins the
 *     home route's stylesheet layers (feed section, wrappers, top bar
 *     background), and the hygiene pass strips the runtime inline styles
 *     React keeps re-applying: gradient-only background images inside
 *     the home section, its wrapper chain and the top bar go to none,
 *     while backgrounds that layer real artwork (url(), e.g. promo
 *     banners) are left untouched.
 *
 *   - v27.6.2: the Library tab no longer bounces back to Home. Two
 *     background events could close the library overlay right after it
 *     opened: Spotify's same-path history writes (boot-time URL
 *     normalization, persistence of its full-page-library "cinema"
 *     state) arrive as route events, and since the library sits on top
 *     of the current route, honoring them closed the panel and revealed
 *     the page underneath — the first Library taps landed back on Home;
 *     and the home-feed recovery's return hop (a synthetic popstate off
 *     the blank recovery path) fired underneath the overlay when the
 *     user opened the Library during the recovery window, closing it
 *     the same way. Route events that do not change the path no longer
 *     touch the library, and the recovery hop defers until the overlay
 *     is gone; a real navigation (path change, back button, tab taps —
 *     including Home tapped while already on "/") still exits it.
 *
 *   - v27.7.0: performance pass — the hygiene loop no longer burns CPU
 *     when nothing changed. Two structural findings drove it. First,
 *     Chromium fires mutation records even for no-op DOM writes (a
 *     classList toggle that leaves the state as it was, setAttribute
 *     with an identical value), so the suite's own per-pass writes were
 *     re-waking the observer and running the whole loop several times
 *     a second forever — every write is now guarded to touch the DOM
 *     only on a real change. Second, the home gradient sweep re-read
 *     computed styles for the entire feed twice a second — it now
 *     memoizes per element and re-checks only mutated or newly mounted
 *     nodes (a stylesheet swap or a ledger overflow falls back to a
 *     full scan). Beyond that: the observer watches structure and
 *     attributes only (Spotify's per-second playback ticker is
 *     text-node noise; every state this script reads arrives as a
 *     style/class/aria write or a node insert) and records WHICH
 *     elements changed, the 500ms tick runs the suite only when
 *     something is dirty or recovery is mid-count, the whole pass is
 *     skipped while the tab is hidden (playback keeps running; the UI
 *     resyncs on return), and the player render no longer rewrites
 *     identical progress/seek values. Measured on a ~9k-node feed:
 *     idle computed-style reads 270k -> 0; while playing, 400k -> 12
 *     per six seconds.
 *
 *   - v27.8.0: the maximized player now plays the Canvas — the short
 *     looping video Spotify ships for many tracks (the phone app swaps
 *     it in over the artwork while a track plays). The video URL is
 *     read through the same persisted GraphQL query Spotify's own
 *     full-screen view uses (pathfinder, hash-pinned), authorized with
 *     the access token captured passively from the page's own
 *     /api/token fetches and API traffic — no extra logins, no tokens
 *     in the script. The loop only runs while it can be seen: it is
 *     fetched/shown in the maximized player while the track plays,
 *     swaps back to the cover art on pause, pauses with the view or
 *     the tab, and results are cached per track (negative results
 *     included) so toggling back and forth costs no requests.
 *
 *   - v27.9.0: fix the phone rendering everything postage-stamp sized.
 *     The page already ships a correct viewport meta and the script
 *     enforced it, but Firefox Android's "Desktop site" toggle (per-site,
 *     sticky, easy to enable by accident) makes the browser ignore the
 *     meta outright: the layout viewport is pinned to ~980px and the
 *     whole mobile UI scales down onto the physical screen. Responsive-
 *     design mode forces the viewport, which is why the page looked
 *     right on the desktop. Page JS cannot restore meta handling, so
 *     when the layout viewport ends up far wider than the physical
 *     screen (touch device, phone-width screen, innerWidth/screen
 *     >= 1.35) the root is zoomed by that ratio: exactly screen.width
 *     layout pixels stay visible — the slice a device-width viewport
 *     would show — and the visual scale returns to 1:1, since the
 *     browser's shrink-to-fit divides by the same factor. The shell's
 *     100vh is relative to the inflated containing block and is
 *     re-pointed at the visible height (--su-vp-vh) while emulated.
 *     The meta also gains maximum-scale=1/user-scalable=no (the app
 *     never pinch-zooms) and is re-asserted every hygiene pass; a
 *     one-time toast names the toggle as the root cause.
 *
 *   - v27.4.1: audit pass — guard the tab icon swap against duplicate
 *     route events (popstate + su:locationchange both fire per tap),
 *     clear a stale .su-player-host class when the native bar moves or
 *     unmounts, activate the mini player from the keyboard (Enter/Space
 *     — it advertised role=button but ignored keys), and relocate a
 *     stray comment into NAV_ICON_STATES.
 *
 *   - v27.5.0: fix pages frozen after leaving the Library tab. The
 *     full-page library is Spotify's "cinema" state, not a route: while
 *     it is active Spotify renders #main-view with the inert attribute,
 *     so the next page (Search, Home, …) rendered fine but swallowed
 *     every tap and scroll. The exit path now clicks Spotify's own
 *     "Minimize Your Library" ("Collapse Your Library" as fallback) so
 *     the state clears the way React expects, and the hygiene loop
 *     strips any inert that still strays onto #main-view (or onto the
 *     pane while the library view is open) as a safety net.
 *
 * Notes / assumptions:
 *   - Selectors rely on stable data-testid hooks wherever possible. A few
 *     fallbacks match English aria-labels (shuffle, connect) or icon path
 *     data; they degrade gracefully on non-English UIs.
 *   - The tab bar mirrors the native app: three tabs (Home / Search /
 *     Your Library), each a glyph plus caption; the current tab renders
 *     the filled/bolder glyph, inactive tabs the outline one. Tab names
 *     are also exposed through aria-label/title.
 */

(() => {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Constants                                                           */
    /* ------------------------------------------------------------------ */

    const MOBILE_CLASS = 'spotify-userscript-mobile-layout';
    const STYLE_ID = 'spotify-userscript-mobile-style';
    const CHROME_ID = 'su-chrome';
    const MINI_ID = 'su-mini-player';
    const FULL_ID = 'su-full-player';
    const TOAST_ID = 'su-toast';
    const CHIPS_ID = 'su-chips';
    const SEARCH_ID = 'su-search';
    const HAS_TRACK_CLASS = 'su-has-track';
    const FULL_OPEN_CLASS = 'su-full-open';
    const PLAYER_BAR_SELECTOR = 'aside[data-testid="now-playing-bar"]';
    const SHELL_SELECTOR = '#main > .Root > div:first-child';
    const NAV_TABS = [
        { tab: 'home', label: 'Home', path: '/' },
        { tab: 'search', label: 'Search', path: '/search' },
        // No path: the Library tab toggles the native library panel
        // (see setLibraryPanel) instead of navigating.
        { tab: 'library', label: 'Your Library' },
    ];

    // Blank catch-all route used to force-remount the home page when its
    // feed errors (see checkHomeRecovery). The route classifier treats it
    // as home so the header does not flicker during the recovery hop.
    const HOME_RECOVERY_PATH = '/su-home-recovery';
    // sessionStorage guard: the automatic reload below may run once per
    // session, never back-to-back (Spotify-side outages would loop).
    const HOME_RELOAD_FLAG = 'su-home-recovery-reload';

    // Canvas (the short looping video shown in the phone app's now-playing
    // view). Fetched through the exact persisted GraphQL query the web
    // player's own full-screen view runs (operation "canvas", hash-pinned);
    // authorized with the access token the page itself obtains — see the
    // token capture at the bottom of this file.
    const CANVAS_ENDPOINT = 'https://api-partner.spotify.com/pathfinder/v2/query';
    const CANVAS_QUERY_HASH = '575138ab27cd5c1b3e54da54d0a7cc8d85485402de26340c2145f0f6bb5e7a9f';
    const CANVAS_CACHE_CAP = 48;
    const CANVAS_RETRY_MS = 60000;

    // Viewport enforcement: the meta content every phone browser should
    // honor, plus the class marking the emulated device-width viewport for
    // the browsers that refuse to (see enforceViewportScale).
    const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    const VP_ZOOM_CLASS = 'su-vp-zoom';
    const VP_ZOOM_NOTICE_FLAG = 'su-vp-zoom-notice';

    /* ------------------------------------------------------------------ */
    /* Icons (inline SVG, currentColor)                                    */
    /* ------------------------------------------------------------------ */

    const ICONS = {
        // Tab glyphs traced from the native phone app (24dp grid).
        // home: rounded filled house with a door notch; search: thin
        // magnifier (paths carry .su-sw so CSS can bold the active tab);
        // library: two shelf bars plus the leaning-book "D".
        home: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.1c-.34 0-.66.12-.92.34L2.98 9.72c-.31.27-.48.65-.48 1.06v8.94c0 .87.71 1.58 1.58 1.58h4.51c.61 0 1.11-.5 1.11-1.11v-4.79c0-.51.41-.92.92-.92h2.76c.51 0 .92.41.92.92v4.79c0 .61.5 1.11 1.11 1.11h4.51c.87 0 1.58-.71 1.58-1.58v-8.94c0-.41-.17-.79-.48-1.06L12.92 2.44A1.4 1.4 0 0 0 12 2.1z"/></svg>',
        homeOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.1c-.34 0-.66.12-.92.34L2.98 9.72c-.31.27-.48.65-.48 1.06v8.94c0 .87.71 1.58 1.58 1.58h4.51c.61 0 1.11-.5 1.11-1.11v-4.79c0-.51.41-.92.92-.92h2.76c.51 0 .92.41.92.92v4.79c0 .61.5 1.11 1.11 1.11h4.51c.87 0 1.58-.71 1.58-1.58v-8.94c0-.41-.17-.79-.48-1.06L12.92 2.44A1.4 1.4 0 0 0 12 2.1z"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle class="su-sw" cx="10.4" cy="10.4" r="7.05"/><path class="su-sw" d="M15.55 15.55 20.7 20.7"/></svg>',
        library: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3.1" y="3.2" width="2.5" height="17.6" rx="1.25"/><rect x="8.1" y="3.2" width="2.5" height="17.6" rx="1.25"/><path d="M13.9 20.9V6.06l1.95-1.56c.63-.5 1.55-.05 1.55.75v14.1c0 .8-.92 1.25-1.55.75z"/></svg>',
        libraryOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.35 3.35v17.3"/><path d="M9.35 3.35v17.3"/><path d="M13.75 20.6V6.2l1.9-1.52c.61-.49 1.5-.05 1.5.73v13.98c0 .78-.89 1.22-1.5.73z"/></svg>',
        chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 9.5 12 16l6.5-6.5"/></svg>',
        heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.6 4.1 12.7a5.4 5.4 0 0 1 7.6-7.6l.3.3.3-.3a5.4 5.4 0 0 1 7.6 7.6L12 20.6z"/></svg>',
        // Saved state of the mini player's like control: the phone app shows
        // a green disc with a white check instead of the outline heart.
        checkLiked: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1ed760"/><path d="M7.2 12.4l3.2 3.2 6.4-6.7" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        heartOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M12 20.1 4.6 12.7a4.9 4.9 0 0 1 6.9-6.9l.5.5.5-.5a4.9 4.9 0 0 1 6.9 6.9L12 20.1z"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.6 4.7a.9.9 0 0 1 1.35-.78l10.1 5.83a.9.9 0 0 1 0 1.56L8.95 17.08A.9.9 0 0 1 7.6 16.4V4.7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.4" y="4.6" width="3.6" height="14.8" rx="0.6"/><rect x="14" y="4.6" width="3.6" height="14.8" rx="0.6"/></svg>',
        prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4.4" y="5" width="2.5" height="14" rx="0.6"/><path d="M19.6 6.1v11.8c0 .8-.9 1.3-1.6.9L8.9 12.87a1.05 1.05 0 0 1 0-1.78l9.1-5.93c.7-.45 1.6.05 1.6.94z"/></svg>',
        next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="17.1" y="5" width="2.5" height="14" rx="0.6"/><path d="M4.4 6.1v11.8c0 .8.9 1.3 1.6.9l9.1-5.93a1.05 1.05 0 0 0 0-1.78L6 5.17c-.7-.45-1.6.05-1.6.93z"/></svg>',
        shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h3.1c1.3 0 2.5.6 3.3 1.6l5.2 6.4c.8 1 2 1.6 3.3 1.6H21"/><path d="M3 17.5h3.1c1.3 0 2.5-.6 3.3-1.6l5.2-6.4c.8-1 2-1.6 3.3-1.6H21"/><path d="M18.4 3.9 21 6.5l-2.6 2.6"/><path d="M18.4 14.9 21 17.5l-2.6 2.6"/></svg>',
        repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2.9l3.1 3.1L17 9.1"/><path d="M20.1 6H7.6a4.1 4.1 0 0 0-4.1 4.1v1.3"/><path d="M7 21.1 3.9 18 7 14.9"/><path d="M3.9 18h12.5a4.1 4.1 0 0 0 4.1-4.1v-1.3"/></svg>',
        devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="2.8" y="4.6" width="12.6" height="8.8" rx="1.5"/><path d="M8.2 16.4h1.8"/><rect x="15.2" y="10.6" width="5.9" height="8.6" rx="1.5"/></svg>',
        share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 14.5V3.7"/><path d="M8 7.4l4-3.7 4 3.7"/><path d="M6.2 11.2h-.9A2.3 2.3 0 0 0 3 13.5v5.2A2.3 2.3 0 0 0 5.3 21h13.4a2.3 2.3 0 0 0 2.3-2.3v-5.2a2.3 2.3 0 0 0-2.3-2.3h-.9"/></svg>',
    };

    // Idle vs active glyph per tab, like the native app: outline artwork
    // when a tab is dormant, filled (or bolder) when current. Search keeps
    // one glyph — CSS bumps its stroke via .su-sw.
    const NAV_ICON_STATES = {
        home: { idle: 'homeOutline', active: 'home' },
        search: { idle: 'search', active: 'search' },
        library: { idle: 'libraryOutline', active: 'library' },
    };

    /* ------------------------------------------------------------------ */
    /* Layout detection                                                    */
    /* ------------------------------------------------------------------ */

    function isNarrowLayout() {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const screenWidth = window.screen?.width || viewportWidth;
        const effectiveWidth = Math.min(viewportWidth, screenWidth);
        const hasTouch = (navigator.maxTouchPoints || 0) > 0;
        return effectiveWidth <= 960 || (hasTouch && effectiveWidth <= 1280);
    }

    function syncMobileClass() {
        const mobile = isNarrowLayout();
        document.documentElement?.classList.toggle(MOBILE_CLASS, mobile);
        if (!mobile) {
            // Leaving the mobile layout: drop the library view and restore
            // the native pane width so the desktop sidebar behaves normally.
            if (libraryOpen) setLibraryPanel(false);
            const pane = libraryPane();
            if (pane) pane.style.removeProperty('--left-sidebar-width');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Viewport enforcement                                                */
    /* ------------------------------------------------------------------ */

    // Re-asserted every hygiene pass: the content is Spotify's own plus
    // maximum-scale/user-scalable (the app never pinch-zooms), and anything
    // that rewrites or drops the meta re-shrinks the whole UI on a phone.
    function enforceViewportMeta() {
        const head = document.head;
        if (!head) return;
        let meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'viewport';
            head.appendChild(meta);
        }
        if (meta.getAttribute('content') !== VIEWPORT_CONTENT) {
            meta.setAttribute('content', VIEWPORT_CONTENT);
        }
    }

    function applyViewportEmulation(on, zoomText, visibleHeight) {
        const root = document.documentElement;
        if (!root) return;
        if (root.classList.contains(VP_ZOOM_CLASS) !== on) {
            root.classList.toggle(VP_ZOOM_CLASS, on);
        }
        if (on) {
            if (root.style.getPropertyValue('--su-vp-zoom') !== zoomText) {
                root.style.setProperty('--su-vp-zoom', zoomText);
                root.style.setProperty('zoom', zoomText);
            }
            if (visibleHeight && root.style.getPropertyValue('--su-vp-vh') !== visibleHeight) {
                root.style.setProperty('--su-vp-vh', visibleHeight);
            }
        } else {
            if (root.style.getPropertyValue('--su-vp-zoom')) {
                root.style.removeProperty('--su-vp-zoom');
                root.style.removeProperty('zoom');
            }
            if (root.style.getPropertyValue('--su-vp-vh')) {
                root.style.removeProperty('--su-vp-vh');
            }
        }
    }

    // Firefox Android's "Desktop site" toggle (per-site, sticky) ignores the
    // viewport meta entirely: the layout viewport is pinned to ~980px and the
    // whole mobile UI scales down onto the physical screen. No page script
    // can restore meta handling, so when the layout viewport ends up far
    // wider than the physical screen the device-width viewport is emulated:
    // zooming the root by innerWidth / screen.width keeps exactly
    // screen.width layout pixels visible — the slice a real device-width
    // viewport would show — and the visual scale returns to 1:1 because the
    // browser's shrink-to-fit divides by the same factor. Guarded so desktop
    // PCs (no touch), RDM sessions (screen = the monitor) and honored metas
    // (innerWidth ~= screen.width) never emulate.
    function enforceViewportScale() {
        const off = () => applyViewportEmulation(false, '', '');
        const root = document.documentElement;
        if (!root || !root.classList.contains(MOBILE_CLASS)) return off();
        const screenW = (window.screen && window.screen.width) || 0;
        const innerW = window.innerWidth || 0;
        const touchable = (navigator.maxTouchPoints || 0) > 0 ||
            (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        if (!screenW || screenW > 700 || !innerW || !touchable) return off();
        const ratio = innerW / screenW;
        if (ratio < 1.35) return off();
        const innerH = window.innerHeight || 0;
        applyViewportEmulation(true, ratio.toFixed(4), innerH ? Math.round(innerH / ratio) + 'px' : '');
        let noticed = false;
        try { noticed = Boolean(sessionStorage.getItem(VP_ZOOM_NOTICE_FLAG)); } catch (error) { /* private mode */ }
        if (!noticed && document.body) {
            toast('Desktop site mode is on in this browser — the layout is emulated at phone width. Turn off "Desktop site" for the native view.');
            try { sessionStorage.setItem(VP_ZOOM_NOTICE_FLAG, '1'); } catch (error) { /* private mode */ }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    function installMobileLayout() {
        const head = document.head;
        if (!head) return;

        enforceViewportMeta();

        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
        }
        style.textContent = `
      /* ---------- tokens ---------- */
      html.${MOBILE_CLASS} {
        --su-font: 'SpotifyMixUI', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif;
        --su-green: #1ed760;
        --su-nav-h: 56px;
        --su-mini-h: 64px;
        --su-safe-b: env(safe-area-inset-bottom, 0px);
        --su-stack-h: calc(var(--su-nav-h) + var(--su-mini-h) + var(--su-safe-b));
      }
      html.${MOBILE_CLASS}:not(.${HAS_TRACK_CLASS}) {
        --su-stack-h: calc(var(--su-nav-h) + var(--su-safe-b));
      }

      /* ---------- page frame ---------- */
      html.${MOBILE_CLASS},
      html.${MOBILE_CLASS} body {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      html.${MOBILE_CLASS} #main {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100vw !important;
        overflow-x: hidden !important;
      }
      html.${MOBILE_CLASS} .Root {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100vw !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Defense: floating button left behind by older versions of this script */
      html.${MOBILE_CLASS} #spotify-userscript-library-shortcut { display: none !important; }
      html:not(.${MOBILE_CLASS}) #${CHROME_ID},
      html:not(.${MOBILE_CLASS}) #${FULL_ID},
      html:not(.${MOBILE_CLASS}) #${TOAST_ID} { display: none !important; }

      /* ---------- app grid shell ---------- */
      html.${MOBILE_CLASS} ${SHELL_SELECTOR} {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
        grid-template-areas: none !important;
        gap: 0 !important;
        width: 100% !important;
        height: 100vh !important;
        min-height: 100vh !important;
        min-width: 0 !important;
        max-width: 100vw !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }

      /* ---------- desktop-site viewport emulation ----------
         While the root is zoomed back to phone width (Firefox Android's
         sticky "Desktop site" toggle ignores the viewport meta — see
         enforceViewportScale), the shell's 100vh is relative to the
         inflated initial containing block and is re-pointed at the
         actually-visible height. Sits AFTER the shell block on purpose:
         equal specificity, source order decides. */
      html.${VP_ZOOM_CLASS} ${SHELL_SELECTOR} {
        height: var(--su-vp-vh, 100vh) !important;
        min-height: var(--su-vp-vh, 100vh) !important;
      }
      html.${MOBILE_CLASS} .su-pane-hide { display: none !important; }

      /* The native player bar's host: kept in the layout (but invisible) so
         Spotify's own popovers anchor above the custom bottom stack and the
         hidden <input type=range> keeps a real value. */
      html.${MOBILE_CLASS} .su-player-host {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: var(--su-stack-h) !important;
        visibility: hidden !important;
        pointer-events: none !important;
        z-index: -1 !important;
      }

      /* ---------- top bar (mobile header) ---------- */
      html.${MOBILE_CLASS} #global-nav-bar {
        grid-column: 1 !important;
        grid-row: 1 !important;
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        min-height: 58px !important;
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 0 !important;
        padding: calc(env(safe-area-inset-top, 0px) + 8px) 10px 8px 16px !important;
        background: #000 !important;
        border: 0 !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
      }
      html.${MOBILE_CLASS} #global-nav-bar .su-nav-hide { display: none !important; }
      html.${MOBILE_CLASS} .e-10860-skip-link { display: none !important; }
      html.${MOBILE_CLASS}.su-route-content #global-nav-bar { display: none !important; }

      html.${MOBILE_CLASS} #${SEARCH_ID} { display: none; }
      html.${MOBILE_CLASS}.su-route-search #${SEARCH_ID} { display: flex; }

      /* Avatar leads the bar like the phone app (it sits deep inside the
         desktop right-hand cluster; the cluster itself is reordered). */
      html.${MOBILE_CLASS} #global-nav-bar > div:has([data-testid="user-widget-link"]) {
        order: -1 !important;
        flex: none !important;
      }
      html.${MOBILE_CLASS} [data-testid="user-widget-link"] {
        width: 40px !important;
        height: 40px !important;
        padding: 0 !important;
        border: 0 !important;
        box-shadow: none !important;
        background: none !important;
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      html.${MOBILE_CLASS} [data-testid="user-widget-link"]:not(:focus-visible) { outline: none !important; }
      html.${MOBILE_CLASS} [data-testid="user-widget-link"] span[data-encore-id="text"] {
        display: inline-block !important;
        width: 40px !important;
        height: 40px !important;
        line-height: 40px !important;
        border-radius: 999px !important;
        font-size: 15px !important;
        overflow: hidden !important;
        box-shadow: none !important;
        text-align: center;
      }

      /* Home filter chips (All / Music / Podcasts): mirrors of Spotify's
         own feed chips, styled as the phone app's pills — green for the
         active filter, dark gray for the rest. */
      html.${MOBILE_CLASS} #${CHIPS_ID} {
        display: none;
        flex: 1 1 auto;
        min-width: 0;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      html.${MOBILE_CLASS} #${CHIPS_ID}::-webkit-scrollbar { display: none; }
      html.${MOBILE_CLASS}.su-route-home #${CHIPS_ID} { display: flex; }
      html.${MOBILE_CLASS} #${CHIPS_ID}:empty { display: none !important; }
      html.${MOBILE_CLASS} .su-chip {
        flex: none;
        height: 34px;
        padding: 0 15px;
        border: 0;
        border-radius: 999px;
        background: #2a2a2a;
        color: #fff;
        font: 600 13px/1 var(--su-font);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} .su-chip.su-active {
        background: var(--su-green);
        color: #000;
      }
      html.${MOBILE_CLASS} #${SEARCH_ID} {
        flex: 1 1 auto;
        min-width: 0;
        align-items: center;
        gap: 10px;
        height: 42px;
        border-radius: 999px;
        background: #242424;
        padding: 0 14px;
        color: #b3b3b3;
        box-sizing: border-box;
      }
      html.${MOBILE_CLASS} #${SEARCH_ID} svg { width: 20px; height: 20px; flex: none; }
      html.${MOBILE_CLASS} #su-search-input {
        flex: 1 1 auto;
        min-width: 0;
        background: none;
        border: 0;
        outline: none;
        color: #fff;
        font: 400 14px/1.2 var(--su-font);
      }
      html.${MOBILE_CLASS} #su-search-input::placeholder { color: #7a7a7a; }

      /* ---------- main view ---------- */
      html.${MOBILE_CLASS} #global-nav-bar,
      html.${MOBILE_CLASS} #main-view,
      html.${MOBILE_CLASS} .main-view-container,
      html.${MOBILE_CLASS} .main-view-container__scroll-node,
      html.${MOBILE_CLASS} .main-view-container__scroll-node-child,
      html.${MOBILE_CLASS} #main-view [data-overlayscrollbars="host"],
      html.${MOBILE_CLASS} #main-view [data-overlayscrollbars-viewport] {
        box-sizing: border-box !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100vw !important;
      }
      html.${MOBILE_CLASS} #main-view {
        grid-column: 1 !important;
        grid-row: 2 !important;
        position: relative !important;
        left: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        padding: 0 0 calc(var(--su-stack-h) + 12px) !important;
        overflow: hidden !important;
      }
      html.${MOBILE_CLASS} #main-view [data-overlayscrollbars-viewport],
      html.${MOBILE_CLASS} #main-view .main-view-container .os-viewport {
        overflow-x: hidden !important;
        scrollbar-width: none !important;
      }
      /* Native-app canvas: everything sits on pure black; cards carry the
         elevation (#181828-ish) instead of the desktop #121212 page. */
      html.${MOBILE_CLASS} #main-view,
      html.${MOBILE_CLASS} .main-view-container,
      html.${MOBILE_CLASS} .main-view-container__scroll-node,
      html.${MOBILE_CLASS} .main-view-container__scroll-node-child {
        background: #000 !important;
      }

      /* ---------- generic overflow guards ---------- */
      html.${MOBILE_CLASS} [role="row"],
      html.${MOBILE_CLASS} [role="row"] > * { min-width: 0 !important; }
      html.${MOBILE_CLASS} img,
      html.${MOBILE_CLASS} video { max-width: 100% !important; }

      /* ---------- home feed ---------- */
      html.${MOBILE_CLASS} .su-hide { display: none !important; }
      html.${MOBILE_CLASS} .main-view-container__mh-footer-container { display: none !important; }
      html.${MOBILE_CLASS} #main-view [data-testid="carousel-previous-button"],
      html.${MOBILE_CLASS} #main-view [data-testid="carousel-next-button"] { display: none !important; }
      /* The desktop feed indents 40px per side; the app uses ~16px. */
      html.${MOBILE_CLASS} section[data-testid="home-page"] > div.contentSpacing {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      /* Flat black home, like the phone app: Spotify paints a colored
         gradient wash behind the top of the feed and tints the top bar
         to match. These rules pin the static layers on the home route
         only (playlist/artist pages keep their header washes — the app
         paints those too). Only art-free elements are pinned here:
         gradient washes on wrappers and feed nodes are stripped by
         markHomeExtras instead, which checks the resolved value and
         spares backgrounds that carry real artwork (url() layers). */
      html.${MOBILE_CLASS}.su-route-home section[data-testid="home-page"] {
        background: #000 !important;
      }
      html.${MOBILE_CLASS}.su-route-home #global-nav-bar .main-topBar-background {
        background: #000 !important;
        background-image: none !important;
      }

      /* Shortcut grid ("Good afternoon" tiles) as the phone app renders
         them: a 2-column grid of flat cards, square cover on the left and
         a single-line bold name beside it. Selectors hook the tile's
         cover image instead of Spotify's draggable attribute (a deploy
         dropped it once and the grid degraded into unlabeled crops). */
      html.${MOBILE_CLASS} section:has([data-testid="shortcut-image"]):not([data-testid="home-page"]) > div {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      html.${MOBILE_CLASS} section:has([data-testid="shortcut-image"]):not([data-testid="home-page"]) > div > div {
        min-width: 0 !important;
        width: auto !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      /* The tile: a flat dark card, cover bleeding into its left edge.
         position:relative anchors Spotify's desktop text overlays back to
         the tile; the text chain itself is reset to static below. */
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) {
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        height: 52px !important;
        min-width: 0 !important;
        border-radius: 4px !important;
        overflow: hidden !important;
        background: #1f1f1f !important;
      }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) > a {
        position: static !important;
        flex: none !important;
        width: 52px !important;
        height: 52px !important;
        margin: 0 !important;
      }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) a > div,
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) a > div > div {
        width: 100% !important;
        height: 100% !important;
        min-width: 0 !important;
      }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border-radius: 0 !important;
      }
      /* Text block: static flex child, name vertically centered. */
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) > div:not([data-testid="shortcut-background"]) {
        position: static !important;
        flex: 1 1 auto !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 10px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: stretch !important;
        gap: 0 !important;
        pointer-events: none;
      }
      /* Inside the text block: drop the hover play-button wrapper, unwrap
         the name chain down to the <p>. Spotify's desktop wrappers are
         absolutely positioned for the overlay design — reset every inner
         node to static flow or long names clip outside the card. */
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) > div:not([data-testid="shortcut-background"]) > div:has([data-testid="play-button"]) { display: none !important; }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) > div:not([data-testid="shortcut-background"]) div,
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) > div:not([data-testid="shortcut-background"]) a {
        position: static !important;
        display: block !important;
        width: auto !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        min-width: 0 !important;
        text-align: left !important;
      }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) p {
        font: 700 13px/1.25 var(--su-font) !important;
        color: #fff !important;
        text-align: left !important;
        margin: 0 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        text-shadow: none !important;
        pointer-events: none;
      }
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) [data-testid="play-button"],
      html.${MOBILE_CLASS} div:has(> a [data-testid="shortcut-image"]) [data-testid="shortcut-background"] {
        display: none !important;
      }

      /* Shelf headers: mobile typography; "Show all" becomes the small
         gray "See all"-style link of the phone app. */
      html.${MOBILE_CLASS} [data-testid="rich-title-row-shelf-header"] .e-10860-legacy-list-row__slot a,
      html.${MOBILE_CLASS} [data-testid="rich-title-row-shelf-header"] .e-10860-legacy-list-row__slot span {
        font: 400 13px/1.2 var(--su-font) !important;
        color: #b3b3b3 !important;
      }
      html.${MOBILE_CLASS} [data-testid="rich-title-row-shelf-header"] a { text-decoration: none !important; }
      html.${MOBILE_CLASS} [data-testid="rich-title-row-shelf-header"] h2 {
        font-size: 22px !important;
        font-weight: 700 !important;
        line-height: 1.3 !important;
        letter-spacing: -0.01em !important;
      }
      html.${MOBILE_CLASS} [data-testid="rich-title-row-shelf-header"] p { font-size: 12px !important; }

      /* Shelf cards: square cover + bold title / gray subtitle below, like
         the phone app (no card background, tiny radius on the art only). */
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] [data-carousel-item="true"] {
        width: 42vw !important;
        max-width: 176px !important;
        min-width: 0 !important;
        margin: 0 !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] .e-10860-card {
        width: 100% !important;
        min-width: 0 !important;
        --box-padding: 0px !important;
        background: none !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] .e-10860-card [data-testid="play-button"] { display: none !important; }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] .e-10860-card__main {
        padding: 8px 0 0 !important;
        min-width: 0 !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] div:has(> div > [data-testid="card-image"]),
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] div:has(> [data-testid="card-image"]) {
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        aspect-ratio: 1 / 1 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        border-radius: 6px !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] [data-testid="card-image"] {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border-radius: 0 !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] [data-encore-id="cardTitle"] {
        height: auto !important;
        font: 700 14px/1.3 var(--su-font) !important;
        color: #fff !important;
        margin: 0 !important;
        display: block !important;
      }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] [data-encore-id="cardTitle"] .e-10860-line-clamp { --encore-line-clamp: 2; }
      html.${MOBILE_CLASS} section[data-testid="component-shelf"] [data-encore-id="cardSubtitle"] {
        font: 400 12px/1.35 var(--su-font) !important;
        color: #b3b3b3 !important;
        margin: 3px 0 0 !important;
        display: block !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      /* ---------- Library tab: native library panel as the page ----------
         #Desktop_LeftSidebar_Id is normally force-hidden as a shell pane
         (su-pane-hide). In Library mode it takes over the main-view grid
         cell instead; the ID selector outranks .su-pane-hide. Spotify
         renders both the expanded panel and its full-page mode inside
         this pane (YourLibraryX). */
      html.${MOBILE_CLASS}.su-route-library #Desktop_LeftSidebar_Id {
        display: flex !important;
        flex-direction: column !important;
        grid-column: 1 !important;
        grid-row: 2 !important;
        width: 100% !important;
        max-width: 100vw !important;
        min-width: 0 !important;
        min-height: 0 !important;
        box-sizing: border-box !important;
        background: #000 !important;
        border-radius: 0 !important;
        padding-bottom: calc(var(--su-stack-h) + 12px) !important;
        overflow: hidden !important;
      }
      html.${MOBILE_CLASS}.su-route-library #main-view { display: none !important; }

      /* ---------- light-touch page restyles ---------- */
      html.${MOBILE_CLASS} [data-testid="playlist-header"],
      html.${MOBILE_CLASS} .main-entityHeader-container {
        flex-direction: column !important;
        align-items: flex-start !important;
      }
      /* ---------- bottom stack: mini player + tab bar ---------- */
      html.${MOBILE_CLASS} #${CHROME_ID} {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999;
        display: flex;
        flex-direction: column;
        pointer-events: none;
        font-family: var(--su-font);
      }
      html.${MOBILE_CLASS} #${MINI_ID},
      html.${MOBILE_CLASS} #su-nav-bar { pointer-events: auto; }
      html.${MOBILE_CLASS}:not(.${HAS_TRACK_CLASS}) #${MINI_ID} { display: none; }

      html.${MOBILE_CLASS} #${MINI_ID} {
        position: relative;
        display: flex;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        height: 56px;
        margin: 0 8px 8px;
        padding: 0 10px 0 7px;
        border-radius: 10px;
        background: #212121;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .5);
        cursor: pointer;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} #su-mini-art {
        width: 42px;
        height: 42px;
        flex: none;
        border-radius: 4px;
        object-fit: cover;
        background: #333;
      }
      html.${MOBILE_CLASS} .su-mini-meta {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      html.${MOBILE_CLASS} #su-mini-title {
        font: 700 14px/1.2 var(--su-font);
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.${MOBILE_CLASS} #su-mini-sub {
        font: 400 12px/1.2 var(--su-font);
        color: #b3b3b3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.${MOBILE_CLASS} .su-mini-btn {
        width: 44px;
        height: 44px;
        flex: none;
        display: grid;
        place-items: center;
        color: #fff;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} .su-mini-btn svg { width: 28px; height: 28px; display: block; }
      /* Secondary controls stay visually quieter than play, like the app. */
      html.${MOBILE_CLASS} #su-mini-devices { color: rgba(255, 255, 255, .8); }
      html.${MOBILE_CLASS} #su-mini-devices svg { width: 21px; height: 21px; }
      html.${MOBILE_CLASS} #su-mini-like svg { width: 24px; height: 24px; }
      html.${MOBILE_CLASS} #su-mini-like.su-liked svg { width: 27px; height: 27px; }
      html.${MOBILE_CLASS} #su-mini-progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        border-radius: 0;
        background: rgba(255, 255, 255, .22);
        overflow: hidden;
      }
      html.${MOBILE_CLASS} #su-mini-progress-fill {
        height: 100%;
        width: 0%;
        background: rgba(255, 255, 255, .9);
      }

      html.${MOBILE_CLASS} #su-nav-bar {
        display: flex;
        align-items: stretch;
        background: #000;
        padding: 6px 8px calc(6px + var(--su-safe-b));
      }
      html.${MOBILE_CLASS} .su-nav-btn {
        flex: 1 1 0;
        min-width: 0;
        height: 44px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: 0;
        background: none;
        color: #b3b3b3;
        cursor: pointer;
        text-decoration: none;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} .su-nav-btn svg { width: 24px; height: 24px; display: block; }
      html.${MOBILE_CLASS} .su-nav-label {
        font-family: var(--su-font);
        font-size: 10px;
        line-height: 1;
        letter-spacing: .01em;
        white-space: nowrap;
      }
      html.${MOBILE_CLASS} .su-nav-btn.su-active { color: #fff; }
      html.${MOBILE_CLASS} .su-nav-btn.su-active .su-nav-label { font-weight: 600; }
      /* Bolder strokes on the active tab's outline-based glyphs. */
      html.${MOBILE_CLASS} .su-nav-btn.su-active svg .su-sw { stroke-width: 2.2px; }

      /* ---------- full-screen Now Playing view ---------- */
      html.${MOBILE_CLASS}.su-full-open,
      html.${MOBILE_CLASS}.su-full-open body { overflow: hidden !important; }
      html.${MOBILE_CLASS} #${FULL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: linear-gradient(178deg, #1e4632 0%, #14261b 42%, #0c0c0c 100%);
        transform: translateY(103%);
        visibility: hidden;
        transition: transform 340ms cubic-bezier(.32, .72, 0, 1), visibility 0s 340ms;
      }
      html.${MOBILE_CLASS}.su-full-open #${FULL_ID} {
        transform: translateY(0);
        visibility: visible;
        transition: transform 340ms cubic-bezier(.32, .72, 0, 1);
      }
      html.${MOBILE_CLASS} #su-full-bg {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 68%;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        filter: blur(70px) brightness(.55) saturate(1.5);
        transform: scale(1.3);
        opacity: .85;
        pointer-events: none;
      }
      html.${MOBILE_CLASS} #su-full-inner {
        position: relative;
        height: 100%;
        max-width: 480px;
        margin: 0 auto;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: calc(env(safe-area-inset-top, 0px) + 10px) 22px calc(env(safe-area-inset-bottom, 0px) + 14px);
        font-family: var(--su-font);
      }
      html.${MOBILE_CLASS} .su-full-top { display: flex; align-items: center; gap: 8px; }
      html.${MOBILE_CLASS} #su-full-close,
      html.${MOBILE_CLASS} #su-full-like,
      html.${MOBILE_CLASS} #su-full-share {
        width: 42px;
        height: 42px;
        flex: none;
        display: grid;
        place-items: center;
        background: none;
        border: 0;
        color: #fff;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} #su-full-close svg { width: 26px; height: 26px; }
      html.${MOBILE_CLASS} .su-full-context {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        text-align: center;
      }
      html.${MOBILE_CLASS} #su-full-context-label {
        font: 700 10px/1.1 var(--su-font);
        letter-spacing: .14em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, .62);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.${MOBILE_CLASS} #su-full-context-label:empty { display: none; }
      html.${MOBILE_CLASS} #su-full-context-name {
        font: 700 13px/1.2 var(--su-font);
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.${MOBILE_CLASS} .su-full-top-spacer { width: 42px; flex: none; }
      html.${MOBILE_CLASS} .su-full-art-wrap {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        place-items: center;
        padding: 6px 0;
      }
      html.${MOBILE_CLASS} #su-full-art {
        grid-area: 1 / 1;
        height: 100%;
        width: auto;
        max-width: 100%;
        object-fit: cover;
        aspect-ratio: 1 / 1;
        border-radius: 10px;
        background: #1c1c1c;
        box-shadow: 0 28px 60px rgba(0, 0, 0, .55);
      }
      /* Canvas video: stacked in the art cell (grid-area 1/1) so it exactly
         overlays the cover art while it plays, cropped square like the app. */
      html.${MOBILE_CLASS} #su-full-canvas {
        grid-area: 1 / 1;
        height: 100%;
        width: auto;
        max-width: 100%;
        object-fit: cover;
        aspect-ratio: 1 / 1;
        border-radius: 10px;
        background: #1c1c1c;
        box-shadow: 0 28px 60px rgba(0, 0, 0, .55);
        display: none;
        pointer-events: none;
      }
      html.${MOBILE_CLASS} #su-full-canvas.su-on { display: block; }
      html.${MOBILE_CLASS} .su-full-info { display: flex; flex-direction: column; gap: 3px; }
      html.${MOBILE_CLASS} .su-full-track-row { display: flex; align-items: center; gap: 12px; }
      html.${MOBILE_CLASS} #su-full-title {
        flex: 1 1 auto;
        min-width: 0;
        font: 700 22px/1.25 var(--su-font);
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.${MOBILE_CLASS} #su-full-like svg { width: 24px; height: 24px; }
      html.${MOBILE_CLASS} #su-full-like.su-liked { color: var(--su-green); }
      html.${MOBILE_CLASS} #su-full-artist {
        align-self: flex-start;
        max-width: 100%;
        background: none;
        border: 0;
        padding: 0;
        text-align: left;
        font: 400 15px/1.3 var(--su-font);
        color: rgba(255, 255, 255, .74);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      html.${MOBILE_CLASS} .su-full-progress { display: flex; flex-direction: column; gap: 6px; }
      html.${MOBILE_CLASS} #su-full-seek {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 22px;
        margin: 0;
        background: transparent;
        cursor: pointer;
        --val: 0%;
      }
      html.${MOBILE_CLASS} #su-full-seek::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(90deg, #fff 0 var(--val), rgba(255, 255, 255, .28) var(--val) 100%);
      }
      html.${MOBILE_CLASS} #su-full-seek::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: #fff;
        margin-top: -4px;
        box-shadow: 0 1px 5px rgba(0, 0, 0, .45);
      }
      html.${MOBILE_CLASS} #su-full-seek::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, .28);
      }
      html.${MOBILE_CLASS} #su-full-seek::-moz-range-progress {
        height: 4px;
        border-radius: 2px;
        background: #fff;
      }
      html.${MOBILE_CLASS} #su-full-seek::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 999px;
        background: #fff;
      }
      html.${MOBILE_CLASS} .su-full-times {
        display: flex;
        justify-content: space-between;
        font: 400 11px/1 var(--su-font);
        color: rgba(255, 255, 255, .62);
      }
      html.${MOBILE_CLASS} .su-full-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 2px 0;
      }
      html.${MOBILE_CLASS} .su-full-controls button {
        position: relative;
        background: none;
        border: 0;
        padding: 0;
        color: rgba(255, 255, 255, .72);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} #su-full-shuffle,
      html.${MOBILE_CLASS} #su-full-repeat { width: 34px; height: 34px; display: grid; place-items: center; }
      html.${MOBILE_CLASS} #su-full-shuffle svg,
      html.${MOBILE_CLASS} #su-full-repeat svg { width: 24px; height: 24px; }
      html.${MOBILE_CLASS} #su-full-shuffle.su-active,
      html.${MOBILE_CLASS} #su-full-repeat.su-active { color: var(--su-green); }
      html.${MOBILE_CLASS} #su-full-shuffle .su-dot,
      html.${MOBILE_CLASS} #su-full-repeat .su-dot { display: none; }
      html.${MOBILE_CLASS} #su-full-shuffle.su-active .su-dot,
      html.${MOBILE_CLASS} #su-full-repeat.su-active .su-dot {
        display: block;
        position: absolute;
        left: 50%;
        bottom: 1px;
        width: 4px;
        height: 4px;
        margin-left: -2px;
        border-radius: 999px;
        background: #fff;
      }
      html.${MOBILE_CLASS} .su-r1 {
        display: none;
        position: absolute;
        top: 0;
        right: 0;
        font: 700 9px/1 var(--su-font);
        color: #fff;
      }
      html.${MOBILE_CLASS} #su-full-repeat.su-one .su-r1 { display: block; }
      html.${MOBILE_CLASS} #su-full-prev,
      html.${MOBILE_CLASS} #su-full-next { width: 46px; height: 46px; display: grid; place-items: center; color: #fff; }
      html.${MOBILE_CLASS} #su-full-prev svg,
      html.${MOBILE_CLASS} #su-full-next svg { width: 32px; height: 32px; }
      html.${MOBILE_CLASS} #su-full-play {
        width: 64px;
        height: 64px;
        border-radius: 999px;
        background: #fff;
        color: #000;
        display: grid;
        place-items: center;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
      }
      html.${MOBILE_CLASS} #su-full-play svg { width: 28px; height: 28px; }
      html.${MOBILE_CLASS} .su-full-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
      }
      html.${MOBILE_CLASS} #su-full-devices {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 9px 12px 9px 14px;
        border-radius: 999px;
        border: 0;
        background: rgba(255, 255, 255, .12);
        color: rgba(255, 255, 255, .9);
        font: 700 12px/1 var(--su-font);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      html.${MOBILE_CLASS} #su-full-devices svg { width: 16px; height: 16px; }
      html.${MOBILE_CLASS} #su-full-share svg { width: 22px; height: 22px; }

      /* ---------- toast ---------- */
      html.${MOBILE_CLASS} #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: calc(var(--su-stack-h) + 18px);
        transform: translateX(-50%) translateY(8px);
        z-index: 2147483500;
        max-width: 80vw;
        box-sizing: border-box;
        padding: 10px 16px;
        border-radius: 999px;
        background: #2b2b2b;
        color: #fff;
        font: 500 13px/1.3 var(--su-font);
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity .25s, transform .25s;
      }
      html.${MOBILE_CLASS} #${TOAST_ID}.su-show {
        opacity: 1;
        transform: translateX(-50%);
      }
        `;
        head.appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /* Small helpers                                                       */
    /* ------------------------------------------------------------------ */

    const byId = (id) => document.getElementById(id);

    function setText(id, value) {
        const node = byId(id);
        const text = value || '';
        if (node && node.textContent !== text) node.textContent = text;
    }

    // classList.toggle(name, force) re-serializes the class attribute (and
    // fires a mutation record) even when the state already matches — the
    // same goes for add() of an existing token and setAttribute() with an
    // identical value. Every per-pass write must therefore be guarded, or
    // the observer wakes the hygiene loop forever.
    function setClass(el, name, on) {
        if (el && el.classList.contains(name) !== on) el.classList.toggle(name, on);
    }

    function formatTime(totalSeconds) {
        const s = Math.max(0, Math.round(totalSeconds || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
        const ss = String(sec).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    function parseTime(text) {
        if (!text) return null;
        const parts = String(text).trim().split(':').map(Number);
        if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0];
    }

    // Upgrade i.scdn.co cover art to the 640px variant (token is a fixed-size
    // prefix inside the path segment).
    function hiResArt(url) {
        if (!url) return null;
        const marker = 'https://i.scdn.co/image/ab67616d';
        if (url.startsWith(marker) && url.length > marker.length + 8) {
            return `${marker}0000b273${url.slice(marker.length + 8)}`;
        }
        return url;
    }

    function navigate(path) {
        if (location.pathname === path) {
            window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
            return;
        }
        history.pushState(history.state, '', path);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    }

    /* ------------------------------------------------------------------ */
    /* Library tab (native library panel as the main view)                 */
    /* ------------------------------------------------------------------ */

    // The web player no longer routes /collection/playlists: the route
    // table only keeps /collection/tracks, /collection/episodes and
    // /collection/local-files, and /collection redirects to Liked Songs.
    // The real library — playlists, podcasts, artists — is the native
    // left sidebar panel, so the Library tab reveals that pane as the
    // main view instead of navigating. The panel (YourLibraryX) renders
    // inside #Desktop_LeftSidebar_Id in three states, each with its own
    // toggle button:
    //   collapsed rail  -> "Open Your Library"
    //   expanded panel  -> "Collapse Your Library" + "Expand Your Library"
    //   full-page mode  -> "Minimize Your Library"
    const LIBRARY_PANE_ID = 'Desktop_LeftSidebar_Id';
    const LIBRARY_OPEN_CLASS = 'su-route-library';
    let libraryOpen = false;

    function libraryPane() {
        return document.getElementById(LIBRARY_PANE_ID);
    }

    function libraryButton(label) {
        const pane = libraryPane();
        return pane ? pane.querySelector(`button[aria-label="${label}"]`) : null;
    }

    function stretchLibraryPane() {
        const pane = libraryPane();
        if (!pane) return;
        // Spotify sizes the pane via the unitless --left-sidebar-width var
        // (consumed as calc(var * 1px)). Pin it to the viewport so the
        // expanded panel spans the screen even when the full-page mode is
        // unavailable (e.g. non-English UIs where the toggle labels differ).
        const viewportWidth = Math.max(320, window.innerWidth || 0);
        pane.style.setProperty('--left-sidebar-width', String(viewportWidth));
    }

    function libraryPaneAvailable() {
        return Boolean(libraryPane())
            && Boolean(libraryButton('Open Your Library')
                || libraryButton('Collapse Your Library')
                || libraryButton('Minimize Your Library'));
    }

    function goFullPageLibraryIfPossible() {
        if (libraryButton('Minimize Your Library')) return;
        const expand = libraryButton('Expand Your Library');
        if (expand) expand.click();
    }

    function leaveFullPageLibrary() {
        // The full-page library is Spotify's "cinema" state machine, not a
        // route: while it is active Spotify renders #main-view with the
        // inert attribute, which swallows every tap and scroll on whatever
        // page we show next. The state only clears through Spotify's own
        // exit button, so leaving the view must click it — React then
        // removes inert itself. "Collapse" covers the expanded panel state.
        const minimize = libraryButton('Minimize Your Library');
        if (minimize) {
            minimize.click();
            return true;
        }
        const collapse = libraryButton('Collapse Your Library');
        if (collapse) {
            collapse.click();
            return true;
        }
        return false;
    }

    function setLibraryPanel(open) {
        const html = document.documentElement;
        if (open) {
            if (!libraryPaneAvailable()) {
                // Panel unavailable (unknown build): fall back to the only
                // surviving /collection page.
                navigate('/collection/tracks');
                return;
            }
            libraryOpen = true;
            html.classList.add(LIBRARY_OPEN_CLASS);
            // Expand the rail on the next frames so the CSS unhide lands
            // before Spotify measures the pane. Already-expanded panels
            // skip this (their "Open Your Library" button is gone).
            window.setTimeout(() => {
                if (!libraryOpen) return;
                const openBtn = libraryButton('Open Your Library');
                if (openBtn) openBtn.click();
                stretchLibraryPane();
            }, 60);
            // Switch to the full-page library once the panel has rendered.
            window.setTimeout(() => {
                if (!libraryOpen) return;
                stretchLibraryPane();
                goFullPageLibraryIfPossible();
            }, 420);
            // Late retry in case the expanded render was slow.
            window.setTimeout(() => {
                if (!libraryOpen) return;
                stretchLibraryPane();
                goFullPageLibraryIfPossible();
            }, 950);
        } else {
            libraryOpen = false;
            // Leave the native full-page state before dropping our class so
            // Spotify clears its own inert marker on #main-view (see
            // leaveFullPageLibrary). One delayed retry covers the case where
            // the exit button has not rendered yet (state still switching).
            if (!leaveFullPageLibrary()) {
                window.setTimeout(() => {
                    if (!libraryOpen) leaveFullPageLibrary();
                }, 120);
            }
            html.classList.remove(LIBRARY_OPEN_CLASS);
        }
        updateNavActive(location.pathname);
    }

    /* ------------------------------------------------------------------ */
    /* Reading state out of the native player bar                          */
    /* ------------------------------------------------------------------ */

    let currentState = null;

    function findShuffleButton(bar, prevBtn) {
        // The shuffle button has no data-testid; it sits immediately before
        // the skip-back button inside the same container.
        if (prevBtn instanceof HTMLElement) {
            const candidate = prevBtn.previousElementSibling;
            if (candidate instanceof HTMLButtonElement) return candidate;
        }
        return bar.querySelector('button[aria-label*="Shuffle" i]');
    }

    function findConnectButton(bar) {
        // The connect button sits in the wrapper element right before the
        // volume bar in the extras cluster.
        const volumeBar = bar.querySelector('[data-testid="volume-bar"]');
        if (volumeBar instanceof HTMLElement) {
            const wrapper = volumeBar.previousElementSibling;
            const button = wrapper instanceof Element ? wrapper.querySelector('button') : null;
            if (button instanceof HTMLButtonElement) return button;
        }
        return bar.querySelector('button[aria-label*="device" i]');
    }

    function extractDeviceName(bar) {
        // When playback is running on a Spotify Connect device, the desktop
        // bar grows a status row ("Playing on device <name>"). Best effort.
        const host = bar.parentElement;
        const roots = [];
        if (host instanceof Element) roots.push(...host.children);
        roots.push(...bar.children);
        for (const node of roots) {
            if (!(node instanceof Element) || node === bar) continue;
            const text = (node.textContent || '').trim();
            if (!text || text.length > 80) continue;
            if (/playing on device/i.test(text)) {
                const match = text.match(/device\s+(.+)$/i);
                return match ? match[1].trim() : text;
            }
        }
        return null;
    }

    function readState() {
        const bar = document.querySelector(PLAYER_BAR_SELECTOR);
        if (!bar) return null;

        const widget = bar.querySelector('[data-testid="now-playing-widget"]');
        const titleEl = bar.querySelector('[data-testid="context-item-info-title"]');
        const linkEl = bar.querySelector('[data-testid="context-item-link"]');
        const artistEl = bar.querySelector('[data-testid="context-item-info-subtitles"]');
        const artistLinkEl = bar.querySelector('[data-testid="context-item-info-artist"]');
        const artEl = bar.querySelector('img[data-testid="cover-art-image"]');

        const playpauseBtn = bar.querySelector('[data-testid="control-button-playpause"]');
        const prevBtn = bar.querySelector('[data-testid="control-button-skip-back"]');
        const nextBtn = bar.querySelector('[data-testid="control-button-skip-forward"]');
        const repeatBtn = bar.querySelector('[data-testid="control-button-repeat"]');
        const likeBtn = widget ? widget.querySelector('button[aria-checked]') : null;
        const shuffleBtn = findShuffleButton(bar, prevBtn);
        const connectBtn = findConnectButton(bar);

        const seekInput = bar.querySelector('[data-testid="playback-progressbar"] input[type="range"]');
        const progressBar = bar.querySelector('[data-testid="playback-progressbar"] [data-testid="progress-bar"]');
        const posEl = bar.querySelector('[data-testid="playback-position"]');
        const durEl = bar.querySelector('[data-testid="playback-duration"]');

        const title = ((titleEl && titleEl.textContent) || (linkEl && linkEl.textContent) || '').trim();
        const artist = ((artistEl && artistEl.textContent) || '').trim();
        const rawArt = (artEl && (artEl.currentSrc || artEl.src)) || '';

        // Playback flag: prefer the aria-label, fall back to the play-triangle
        // icon path (language independent).
        let playing = null;
        const ppLabel = (playpauseBtn && playpauseBtn.getAttribute('aria-label')) || '';
        if (/\bpause\b/i.test(ppLabel)) playing = true;
        else if (/\bplay\b/i.test(ppLabel)) playing = false;
        else {
            const d = playpauseBtn?.querySelector('path')?.getAttribute('d') || '';
            playing = d ? !d.startsWith('M3 1.7') : null;
        }

        // Saved/liked flag: the widget's save button carries aria-checked
        // semantics; the green styling class is only a fallback for builds
        // that do not expose the attribute.
        const liked = likeBtn
            ? (likeBtn.hasAttribute('aria-checked')
                ? likeBtn.getAttribute('aria-checked') === 'true'
                : /bright-accent/.test(likeBtn.className))
            : false;

        let shuffleOn = false;
        if (shuffleBtn) {
            const label = shuffleBtn.getAttribute('aria-label') || '';
            shuffleOn = /disable shuffle/i.test(label) || /bright-accent/.test(shuffleBtn.className);
        }

        let repeatOn = false;
        let repeatOne = false;
        if (repeatBtn) {
            const label = repeatBtn.getAttribute('aria-label') || '';
            if (repeatBtn.hasAttribute('aria-checked')) {
                repeatOn = repeatBtn.getAttribute('aria-checked') === 'true';
            } else {
                repeatOn = /disable repeat/i.test(label) || /bright-accent/.test(repeatBtn.className);
            }
            repeatOne = repeatOn && /repeat one/i.test(label);
        }

        let fraction = null;
        const transform = (progressBar && progressBar.style && progressBar.style.getPropertyValue('--progress-bar-transform')) || '';
        const percent = transform.match(/-?[\d.]+%/);
        if (percent) fraction = Math.max(0, Math.min(1, parseFloat(percent[0]) / 100));
        if (fraction == null && seekInput) {
            const value = Number(seekInput.value);
            const max = Number(seekInput.max);
            if (Number.isFinite(value) && Number.isFinite(max) && max > 0) {
                fraction = Math.max(0, Math.min(1, value / max));
            }
        }

        // Canvas key: the base62 id from the track link (the same href the
        // share button uses). The title link normally is the track page, but
        // some contexts point it at the album instead — fall back to any
        // track anchor inside the bar before giving up. Album/playlist-only
        // states carry no per-track canvas.
        const trackHref = (linkEl && linkEl.getAttribute('href')) || '';
        let trackId = (trackHref.match(/^\/track\/([A-Za-z0-9]+)/) || [])[1] || null;
        let trackUrl = trackHref || null;
        if (!trackId) {
            const trackAnchor = bar.querySelector('a[href^="/track/"]');
            if (trackAnchor) {
                trackUrl = trackAnchor.getAttribute('href');
                trackId = (trackUrl.match(/^\/track\/([A-Za-z0-9]+)/) || [])[1] || null;
            }
        }

        return {
            bar,
            title,
            artist,
            artUrl: hiResArt(rawArt) || rawArt || null,
            trackUrl,
            trackId,
            artistHref: (artistLinkEl && artistLinkEl.getAttribute('href')) || null,
            deviceName: extractDeviceName(bar),
            playing,
            liked,
            shuffleOn,
            repeatOn,
            repeatOne,
            fraction,
            positionSec: parseTime(posEl && posEl.textContent),
            durationSec: parseTime(durEl && durEl.textContent),
            playpauseBtn,
            prevBtn,
            nextBtn,
            repeatBtn,
            likeBtn,
            shuffleBtn,
            connectBtn,
        };
    }

    function clickNative(testId) {
        const btn = document.querySelector(`${PLAYER_BAR_SELECTOR} [data-testid="${testId}"]`);
        if (btn instanceof HTMLElement) btn.click();
    }

    /* ------------------------------------------------------------------ */
    /* Seeking                                                             */
    /* ------------------------------------------------------------------ */

    function seekToFraction(fraction) {
        const clamped = Math.max(0, Math.min(1, fraction || 0));
        const input = document.querySelector(`${PLAYER_BAR_SELECTOR} [data-testid="playback-progressbar"] input[type="range"]`);
        if (input) {
            const max = Number(input.max);
            if (Number.isFinite(max) && max > 0) {
                input.value = String(Math.round(clamped * max));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
        }
        seekViaPointer(clamped);
    }

    function seekViaPointer(fraction) {
        const target = document.querySelector(`${PLAYER_BAR_SELECTOR} [data-testid="progress-bar"]`)
            || document.querySelector(`${PLAYER_BAR_SELECTOR} [data-testid="playback-progressbar"]`);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (!rect.width) return;
        const x = rect.left + rect.width * fraction;
        const y = rect.top + rect.height / 2;
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            target.dispatchEvent(new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                clientX: x,
                clientY: y,
                button: 0,
                buttons: type === 'pointerdown' ? 1 : 0,
            }));
        }
    }

    /* ------------------------------------------------------------------ */
    /* Toast                                                               */
    /* ------------------------------------------------------------------ */

    let toastTimer = 0;

    function buildToast() {
        const node = document.createElement('div');
        node.id = TOAST_ID;
        node.setAttribute('role', 'status');
        document.body.appendChild(node);
        return node;
    }

    function toast(message) {
        if (!document.body) return;
        let node = byId(TOAST_ID);
        if (!node) node = buildToast();
        node.textContent = message;
        node.classList.add('su-show');
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => node.classList.remove('su-show'), 2400);
    }

    /* ------------------------------------------------------------------ */
    /* Custom chrome: bottom stack + full-screen player                    */
    /* ------------------------------------------------------------------ */

    let seekDragging = false;

    function buildChrome() {
        const chrome = document.createElement('div');
        chrome.id = CHROME_ID;

        // -- mini player -------------------------------------------------
        const mini = document.createElement('div');
        mini.id = MINI_ID;
        mini.setAttribute('role', 'button');
        mini.setAttribute('tabindex', '0');
        mini.setAttribute('aria-label', 'Open the full Now Playing view');
        mini.innerHTML = `
            <img id="su-mini-art" alt="" draggable="false">
            <div class="su-mini-meta">
                <span id="su-mini-title"></span>
                <span id="su-mini-sub"></span>
            </div>
            <div id="su-mini-progress"><div id="su-mini-progress-fill"></div></div>
            <button type="button" class="su-mini-btn" id="su-mini-devices" aria-label="Connect to a device">${ICONS.devices}</button>
            <button type="button" class="su-mini-btn" id="su-mini-like" aria-label="Save to Liked Songs">${ICONS.heartOutline}</button>
            <button type="button" class="su-mini-btn" id="su-mini-play" aria-label="Play or pause">${ICONS.play}</button>`;
        mini.addEventListener('click', (event) => {
            if (event.target instanceof Element && event.target.closest('.su-mini-btn')) return;
            openFullPlayer();
        });
        const miniPlay = mini.querySelector('#su-mini-play');
        miniPlay.addEventListener('click', () => clickNative('control-button-playpause'));
        mini.querySelector('#su-mini-devices').addEventListener('click', () => currentState?.connectBtn?.click());
        mini.querySelector('#su-mini-like').addEventListener('click', () => currentState?.likeBtn?.click());
        // role=button + tabindex promise keyboard activation; deliver it.
        mini.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openFullPlayer();
        });
        chrome.appendChild(mini);

        // -- tab bar -----------------------------------------------------
        const nav = document.createElement('nav');
        nav.id = 'su-nav-bar';
        nav.setAttribute('aria-label', 'Main navigation');
        for (const def of NAV_TABS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'su-nav-btn';
            btn.dataset.suTab = def.tab;
            btn.setAttribute('aria-label', def.label);
            btn.title = def.label;
            btn.innerHTML = `<span class="su-nav-ico">${ICONS[NAV_ICON_STATES[def.tab].idle]}</span>`;
            const label = document.createElement('span');
            label.className = 'su-nav-label';
            label.textContent = def.label;
            btn.appendChild(label);
            btn.addEventListener('click', () => {
                if (def.tab === 'library') {
                    setLibraryPanel(!libraryOpen);
                    return;
                }
                navigate(def.path);
            });
            nav.appendChild(btn);
        }
        chrome.appendChild(nav);

        document.body.appendChild(chrome);
    }

    function buildFullPlayer() {
        const full = document.createElement('div');
        full.id = FULL_ID;
        full.setAttribute('role', 'dialog');
        full.setAttribute('aria-label', 'Now Playing');
        full.setAttribute('aria-hidden', 'true');
        full.innerHTML = `
            <div id="su-full-bg" aria-hidden="true"></div>
            <div id="su-full-inner">
                <div class="su-full-top">
                    <button type="button" id="su-full-close" aria-label="Close the Now Playing view">${ICONS.chevronDown}</button>
                    <div class="su-full-context">
                        <span id="su-full-context-label"></span>
                        <span id="su-full-context-name"></span>
                    </div>
                    <div class="su-full-top-spacer" aria-hidden="true"></div>
                </div>
                <div class="su-full-art-wrap">
                    <img id="su-full-art" alt="" draggable="false">
                    <video id="su-full-canvas" aria-hidden="true" playsinline muted loop disablepictureinpicture disableremoteplayback preload="auto"></video>
                </div>
                <div class="su-full-info">
                    <div class="su-full-track-row">
                        <span id="su-full-title"></span>
                        <button type="button" id="su-full-like" aria-label="Save to Liked Songs">${ICONS.heartOutline}</button>
                    </div>
                    <button type="button" id="su-full-artist" aria-label="Open the artist page"></button>
                </div>
                <div class="su-full-progress">
                    <input id="su-full-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
                    <div class="su-full-times">
                        <span id="su-full-pos">0:00</span>
                        <span id="su-full-dur">0:00</span>
                    </div>
                </div>
                <div class="su-full-controls">
                    <button type="button" id="su-full-shuffle" aria-label="Toggle shuffle">${ICONS.shuffle}<span class="su-dot" aria-hidden="true"></span></button>
                    <button type="button" id="su-full-prev" aria-label="Previous track">${ICONS.prev}</button>
                    <button type="button" id="su-full-play" aria-label="Play or pause">${ICONS.play}</button>
                    <button type="button" id="su-full-next" aria-label="Next track">${ICONS.next}</button>
                    <button type="button" id="su-full-repeat" aria-label="Toggle repeat">${ICONS.repeat}<span class="su-dot" aria-hidden="true"></span><span class="su-r1" aria-hidden="true">1</span></button>
                </div>
                <div class="su-full-bottom">
                    <button type="button" id="su-full-devices" aria-label="Connect to a device">${ICONS.devices}<span id="su-full-device-name">This device</span></button>
                    <button type="button" id="su-full-share" aria-label="Share">${ICONS.share}</button>
                </div>
            </div>`;

        full.querySelector('#su-full-close').addEventListener('click', closeFullPlayer);
        full.querySelector('#su-full-play').addEventListener('click', () => clickNative('control-button-playpause'));
        full.querySelector('#su-full-prev').addEventListener('click', () => clickNative('control-button-skip-back'));
        full.querySelector('#su-full-next').addEventListener('click', () => clickNative('control-button-skip-forward'));
        full.querySelector('#su-full-shuffle').addEventListener('click', () => currentState?.shuffleBtn?.click());
        full.querySelector('#su-full-repeat').addEventListener('click', () => currentState?.repeatBtn?.click());
        full.querySelector('#su-full-like').addEventListener('click', () => currentState?.likeBtn?.click());
        full.querySelector('#su-full-devices').addEventListener('click', () => currentState?.connectBtn?.click());
        full.querySelector('#su-full-share').addEventListener('click', shareCurrentTrack);
        full.querySelector('#su-full-artist').addEventListener('click', () => {
            const href = currentState?.artistHref;
            if (href) {
                closeFullPlayer();
                navigate(href);
            }
        });

        // Canvas video lifecycle: show it only once frames exist (loadeddata
        // -> readyState >= 2) so the cover art never flickers, and treat a
        // broken/expired media URL as "this track has no canvas".
        const canvasVideo = full.querySelector('#su-full-canvas');
        canvasVideo.addEventListener('loadeddata', syncCanvas);
        canvasVideo.addEventListener('canplay', syncCanvas);
        canvasVideo.addEventListener('error', () => {
            // An empty-src load() (track switch reset) also surfaces here —
            // only a real media failure with a source attached is meaningful.
            if (!canvasVideo.getAttribute('src')) return;
            if (canvasTrackId) cacheCanvas(canvasTrackId, null);
            canvasUrl = null;
            syncCanvas();
        });

        const seek = full.querySelector('#su-full-seek');
        seek.addEventListener('input', () => {
            seekDragging = true;
            const st = currentState;
            const fraction = Number(seek.value) / 1000;
            seek.style.setProperty('--val', `${(fraction * 100).toFixed(1)}%`);
            if (st && st.durationSec) setText('su-full-pos', formatTime(fraction * st.durationSec));
        });
        seek.addEventListener('change', () => {
            seekToFraction(Number(seek.value) / 1000);
            seekDragging = false;
        });

        document.body.appendChild(full);
    }

    function ensureChrome() {
        if (!document.body) return;
        if (!byId(CHROME_ID)) buildChrome();
        if (!byId(FULL_ID)) buildFullPlayer();
        if (!byId(TOAST_ID)) buildToast();
    }

    function openFullPlayer() {
        document.documentElement.classList.add(FULL_OPEN_CLASS);
        byId(FULL_ID)?.setAttribute('aria-hidden', 'false');
        // The view just became visible: kick the lazy canvas lookup (in case
        // the track was playing while hidden) and resume the surface.
        refreshCanvas(currentState);
    }

    function closeFullPlayer() {
        document.documentElement.classList.remove(FULL_OPEN_CLASS);
        byId(FULL_ID)?.setAttribute('aria-hidden', 'true');
        // Offscreen video: stop decoding immediately instead of waiting for
        // the next mirror pass.
        syncCanvas();
    }

    async function shareCurrentTrack() {
        const st = currentState;
        if (!st) return;
        const url = st.trackUrl ? new URL(st.trackUrl, location.origin).toString() : location.origin;
        try {
            if (navigator.share) {
                await navigator.share({ title: st.title, text: st.artist || undefined, url });
            } else {
                await navigator.clipboard.writeText(url);
                toast('Link copied to clipboard');
            }
        } catch (error) {
            if (error && error.name === 'AbortError') return;
            toast('Could not share this track');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Canvas (short looping video in the maximized player)                */
    /* ------------------------------------------------------------------ */

    // The web player reads canvas data through a persisted pathfinder query
    // when its own full-screen view is open. This script replays exactly that
    // request (same endpoint, same hash, same variables) so behavior matches
    // the native view — including empty responses for tracks without a
    // canvas. The bearer token is never created here: it is captured from
    // the page's own /api/token fetches and API traffic (see the fetch hook
    // installed at document-start at the bottom of this file).
    //
    // Results are cached per track id — positive (video URL) and negative
    // (no canvas) — so revisiting tracks costs nothing. Transient failures
    // (network, non-40x responses) are retried after a cooldown instead of
    // being remembered, so a flaky moment cannot permanently hide a canvas.

    const canvasCache = new Map();     // trackId -> video url | null (none)
    const canvasInflight = new Map();  // trackId -> fetch promise in progress
    const canvasRetryAt = new Map();   // trackId -> earliest next attempt (transient failures)
    let canvasTrackId = null;          // track the video element currently targets
    let canvasUrl = null;              // canvas url applied to the current track
    let canvasRequestedFor = null;     // track whose lookup already ran this pass

    function cacheCanvas(trackId, url) {
        if (!trackId) return;
        if (canvasCache.has(trackId)) canvasCache.delete(trackId);
        canvasCache.set(trackId, url);
        if (canvasRetryAt.has(trackId)) canvasRetryAt.delete(trackId);
        while (canvasCache.size > CANVAS_CACHE_CAP) {
            const oldest = canvasCache.keys().next().value;
            canvasCache.delete(oldest);
            canvasRetryAt.delete(oldest);
        }
    }

    async function fetchCanvasUrl(trackId) {
        const token = suToken.value;
        if (!token) return undefined; // no token seen yet — retried later
        let response;
        try {
            response = await fetch(CANVAS_ENDPOINT, {
                method: 'POST',
                credentials: 'omit',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    variables: { trackUri: `spotify:track:${trackId}` },
                    operationName: 'canvas',
                    extensions: { persistedQuery: { version: 1, sha256Hash: CANVAS_QUERY_HASH } },
                }),
            });
        } catch (error) {
            return undefined; // network trouble — the next trigger retries
        }
        if (response.status === 401 || response.status === 403) {
            // Token expired or refused: drop it so a freshly captured one
            // (the page renews its own constantly) is required first.
            suToken.value = null;
            return undefined;
        }
        if (!response.ok) {
            canvasRetryAt.set(trackId, Date.now() + CANVAS_RETRY_MS);
            return null;
        }
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            canvasRetryAt.set(trackId, Date.now() + CANVAS_RETRY_MS);
            return null;
        }
        if (payload && Array.isArray(payload.errors) && payload.errors.length) {
            // PersistedQueryNotFound means this build moved past our hash —
            // retry after the cooldown in case that is momentary; anything
            // else (restricted track, bad uri) is a firm "no canvas".
            const transient = payload.errors.some((e) => e && e.message === 'PersistedQueryNotFound');
            if (transient) canvasRetryAt.set(trackId, Date.now() + CANVAS_RETRY_MS);
            else cacheCanvas(trackId, null);
            return null;
        }
        const trackUnion = payload && payload.data && payload.data.trackUnion;
        if (!trackUnion || trackUnion.__typename !== 'Track' || !trackUnion.canvas) {
            cacheCanvas(trackId, null);
            return null;
        }
        const canvas = trackUnion.canvas;
        const staticArt = canvas.type === 'IMAGE' || canvas.type === 'GIF';
        const url = !staticArt && canvas.url ? canvas.url : null;
        cacheCanvas(trackId, url);
        return url;
    }

    function requestCanvas(trackId, onReady) {
        if (!trackId) return;
        if (canvasCache.has(trackId)) {
            const url = canvasCache.get(trackId);
            if (url) onReady(url);
            return;
        }
        if (Date.now() < (canvasRetryAt.get(trackId) || 0)) return;
        let inflight = canvasInflight.get(trackId);
        if (!inflight) {
            inflight = fetchCanvasUrl(trackId);
            inflight.finally(() => canvasInflight.delete(trackId));
            canvasInflight.set(trackId, inflight);
        }
        inflight.then((url) => {
            if (url && canvasTrackId === trackId) onReady(url);
            // undefined = no decision yet (token not captured, network
            // blip): allow the next trigger (view open, play toggle, track
            // change) to retry instead of blacklisting the track.
            if (url === undefined && canvasRequestedFor === trackId) canvasRequestedFor = null;
        }).catch(() => {});
    }

    function applyCanvas(url) {
        const video = byId('su-full-canvas');
        if (!video || !url) return;
        canvasUrl = url;
        if (video.getAttribute('src') !== url) {
            video.setAttribute('src', url);
            video.load();
        }
        syncCanvas();
    }

    // Central show/hide + playback gate. The canvas behaves like the phone
    // app: visible only in the maximized view, only while the track plays,
    // and only once frames are actually decodable (readyState >= 2) so the
    // cover art stays up until the very first video frame exists. Any other
    // combination falls back to the artwork — and the video element is
    // paused whenever it is not the visible surface.
    function syncCanvas() {
        const video = byId('su-full-canvas');
        if (!video) return;
        const fullOpen = document.documentElement.classList.contains(FULL_OPEN_CLASS);
        const live = Boolean(
            fullOpen
            && currentState
            && currentState.playing
            && canvasUrl
            && video.getAttribute('src') === canvasUrl
            && video.readyState >= 2
            && !video.error
        );
        setClass(video, 'su-on', live);
        if (live) {
            if (video.paused) video.play().catch(() => {});
        } else if (!video.paused) {
            video.pause();
        }
    }

    // Track-change + laziness controller, driven from renderFull each pass.
    // Cheap by construction: the reset path runs only on a real track change
    // and the request path once per track (cached/negative results make the
    // repeat calls a single Map lookup).
    function refreshCanvas(st) {
        const video = byId('su-full-canvas');
        if (!video) return;
        const trackId = st ? st.trackId : null;
        if (trackId !== canvasTrackId) {
            canvasTrackId = trackId;
            canvasUrl = null;
            canvasRequestedFor = null;
            video.pause();
            // Full reset (not just src swap): load() with no source aborts
            // the previous track's media and frees its buffer.
            video.removeAttribute('src');
            video.load();
            setClass(video, 'su-on', false);
        }
        if (!trackId) return;
        // Lazy fetch: only when the video could actually be seen now or
        // imminently (maximized view open, or the track is playing so the
        // user is one tap away from the maximized view).
        const fullOpen = document.documentElement.classList.contains(FULL_OPEN_CLASS);
        if ((fullOpen || st.playing) && canvasRequestedFor !== trackId) {
            canvasRequestedFor = trackId;
            requestCanvas(trackId, applyCanvas);
        }
        syncCanvas();
    }

    /* ------------------------------------------------------------------ */
    /* Rendering (native state -> custom chrome)                           */
    /* ------------------------------------------------------------------ */

    const lastMini = { playing: null, liked: null, artUrl: null, fill: null };
    const lastFull = { trackId: null, playing: null, liked: null, artUrl: null, seekVal: null, seekCss: null };

    function mirror() {
        const st = readState();
        currentState = st;
        const hasTrack = Boolean(st && st.title);
        setClass(document.documentElement, HAS_TRACK_CLASS, hasTrack);
        if (!st) {
            // Bar gone (context switch, rebuild): the canvas must not stay
            // live on stale state. syncCanvas re-evaluates and pauses it.
            syncCanvas();
            return;
        }
        renderMini(st);
        renderFull(st);
    }

    function renderMini(st) {
        const art = byId('su-mini-art');
        if (art && lastMini.artUrl !== st.artUrl) {
            if (st.artUrl) art.src = st.artUrl;
            else art.removeAttribute('src');
            lastMini.artUrl = st.artUrl;
        }
        setText('su-mini-title', st.title);
        setText('su-mini-sub', st.artist);

        if (st.playing !== lastMini.playing) {
            const btn = byId('su-mini-play');
            if (btn) btn.innerHTML = st.playing ? ICONS.pause : ICONS.play;
            lastMini.playing = st.playing;
        }
        if (st.liked !== lastMini.liked) {
            const btn = byId('su-mini-like');
            if (btn) {
                // Saved state mirrors the app's green check disc.
                btn.innerHTML = st.liked ? ICONS.checkLiked : ICONS.heartOutline;
                btn.classList.toggle('su-liked', st.liked);
            }
            lastMini.liked = st.liked;
        }
        const fill = byId('su-mini-progress-fill');
        if (fill && st.fraction != null) {
            const width = `${Math.round(st.fraction * 100)}%`;
            // Identical per-tick values are skipped: every write dirties
            // the inline style and would wake the observer for nothing.
            if (lastMini.fill !== width) {
                fill.style.width = width;
                lastMini.fill = width;
            }
        }
    }

    function renderFull(st) {
        if (lastFull.trackId !== st.trackId) {
            lastFull.trackId = st.trackId;
            // Canvas lifecycle rides on the track identity: reset + lazy
            // lookup for the new id (refreshCanvas guards every write).
            refreshCanvas(st);
        }
        if (lastFull.artUrl !== st.artUrl) {
            const art = byId('su-full-art');
            if (art && st.artUrl) art.src = st.artUrl;
            const bg = byId('su-full-bg');
            if (bg) bg.style.backgroundImage = st.artUrl ? `url("${st.artUrl}")` : 'none';
            lastFull.artUrl = st.artUrl;
        }

        setText('su-full-title', st.title);
        setText('su-full-artist', st.artist);

        if (st.playing !== lastFull.playing) {
            const btn = byId('su-full-play');
            if (btn) btn.innerHTML = st.playing ? ICONS.pause : ICONS.play;
            lastFull.playing = st.playing;
            // Play/pause flips the canvas surface with it (app behavior:
            // artwork while paused). refreshCanvas below re-gates too, but
            // this covers paused tracks whose lookup only just resolved.
            refreshCanvas(st);
        }
        if (st.liked !== lastFull.liked) {
            const btn = byId('su-full-like');
            if (btn) {
                btn.innerHTML = st.liked ? ICONS.heart : ICONS.heartOutline;
                btn.classList.toggle('su-liked', st.liked);
            }
            lastFull.liked = st.liked;
        }

        setClass(byId('su-full-shuffle'), 'su-active', st.shuffleOn);
        setClass(byId('su-full-repeat'), 'su-active', st.repeatOn);
        setClass(byId('su-full-repeat'), 'su-one', st.repeatOne);
        setText('su-full-device-name', st.deviceName || 'This device');

        setText('su-full-dur', formatTime(st.durationSec));
        if (!seekDragging) {
            setText('su-full-pos', formatTime(st.positionSec));
            if (st.fraction != null) {
                const seek = byId('su-full-seek');
                if (seek) {
                    const value = String(Math.round(st.fraction * 1000));
                    const css = `${(st.fraction * 100).toFixed(1)}%`;
                    // The full view spends most of its life hidden; do not
                    // churn CSSOM with values it already shows.
                    if (lastFull.seekVal !== value) {
                        seek.value = value;
                        lastFull.seekVal = value;
                    }
                    if (lastFull.seekCss !== css) {
                        seek.style.setProperty('--val', css);
                        lastFull.seekCss = css;
                    }
                }
            }
        }

        // Context header ("Playing from playlist ...") — captured from the
        // last visited playlist/album page, falling back to Now Playing.
        if (byId('su-full-context-label')) {
            setText('su-full-context-label', contextInfo && contextInfo.name
                ? (contextInfo.kind === 'album' ? 'Playing from album' : 'Playing from playlist')
                : '');
            setText('su-full-context-name', contextInfo && contextInfo.name ? contextInfo.name : 'Now Playing');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Top bar: filter chips / search field injection and pruning          */
    /* ------------------------------------------------------------------ */

    function ensureHeaderBits(nav) {
        if (!nav) return;
        if (!byId(SEARCH_ID)) {
            const wrap = document.createElement('div');
            wrap.id = SEARCH_ID;
            wrap.innerHTML = ICONS.search;
            const input = document.createElement('input');
            input.id = 'su-search-input';
            input.type = 'text';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.placeholder = 'What do you want to play?';
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                const value = input.value.trim();
                navigate(value ? `/search/${encodeURIComponent(value)}` : '/search');
                input.blur();
            });
            wrap.appendChild(input);
            nav.insertBefore(wrap, nav.firstChild);
        }
        if (!byId(CHIPS_ID)) {
            const chips = document.createElement('div');
            chips.id = CHIPS_ID;
            chips.setAttribute('role', 'group');
            chips.setAttribute('aria-label', 'Home filters');
            nav.appendChild(chips);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Home filter chips (mirrors of Spotify's own feed chips)             */
    /* ------------------------------------------------------------------ */

    // The web player ships the same All / Music / Podcasts filter chips the
    // phone app shows, but renders them at the top of the scrolling feed.
    // The script hides that block (markHomeExtras) and mirrors the chips
    // into the top bar next to the avatar. Mirrors are plain buttons that
    // .click() the native chips — feed filtering stays Spotify's own React
    // logic; only the pills' checked state is synced back every pass.
    let chipsSignature = '';

    function syncHomeChips() {
        const chips = byId(CHIPS_ID);
        if (!chips) return;
        const home = document.querySelector('main section[data-testid="home-page"], section[data-testid="home-page"]');
        const nativeChips = home && home.previousElementSibling instanceof HTMLElement
            ? Array.from(home.previousElementSibling.querySelectorAll('button[data-encore-id="chip"]'))
            : [];
        if (!nativeChips.length) {
            // Feed gone (error page, other route): drop mirrors so the
            // bar cannot offer dead buttons; :empty hides the container.
            if (chips.firstChild) chips.replaceChildren();
            chipsSignature = '';
            return;
        }

        // Rebuild the mirrors only when the chip set itself changes.
        const signature = nativeChips.map((chip) => chip.getAttribute('aria-label') || chip.textContent.trim()).join('|');
        if (signature !== chipsSignature) {
            chipsSignature = signature;
            const mirrors = nativeChips.map((chip) => {
                const label = chip.getAttribute('aria-label') || chip.textContent.trim();
                const mirror = document.createElement('button');
                mirror.type = 'button';
                mirror.className = 'su-chip';
                mirror.textContent = label;
                mirror.setAttribute('aria-label', label);
                mirror.addEventListener('click', () => {
                    // Resolve the native chip again at tap time: React may
                    // have re-rendered the block since the mirror was built.
                    const homeNow = document.querySelector('section[data-testid="home-page"]');
                    const current = homeNow && homeNow.previousElementSibling instanceof HTMLElement
                        ? Array.from(homeNow.previousElementSibling.querySelectorAll('button[data-encore-id="chip"]'))
                        : [];
                    const target = current.find((c) => (c.getAttribute('aria-label') || c.textContent.trim()) === label);
                    if (target) target.click();
                });
                return mirror;
            });
            chips.replaceChildren(...mirrors);
        }

        // Sync checked state (native chips carry aria-checked). The
        // setAttribute is guarded: writing an identical value STILL fires
        // a mutation record, which would wake the observer and keep the
        // hygiene loop running forever.
        const mirrors = chips.querySelectorAll('.su-chip');
        nativeChips.forEach((chip, index) => {
            const mirror = mirrors[index];
            if (!mirror) return;
            const checked = chip.getAttribute('aria-checked') === 'true'
                || chip.className.includes('--selected');
            setClass(mirror, 'su-active', checked);
            if (mirror.getAttribute('aria-pressed') !== String(checked)) {
                mirror.setAttribute('aria-pressed', String(checked));
            }
        });
    }

    // Sticky dirty flag: the prune regex-tests every link/button in the top
    // bar, so it only re-runs when the bar itself changed — a mutation
    // inside #global-nav-bar (target or an inserted node), or the bar
    // being replaced wholesale.
    let navPruneDirty = true;

    function pruneNavBar(nav, mutated) {
        if (!nav) return;
        let dirty = navPruneDirty;
        if (!dirty) {
            for (const el of mutated) {
                if (el === nav || el.closest('#global-nav-bar')) {
                    dirty = true;
                    break;
                }
            }
        }
        navPruneDirty = false;
        if (!dirty) return;
        const marks = new Set();

        for (const a of nav.querySelectorAll('a[href="/"]')) marks.add(a);

        // Home button + search field cluster: climb from the search input to
        // the bar-level wrapper.
        const searchInput = nav.querySelector('input[data-testid="search-input"]');
        const anchor = searchInput || nav.querySelector('[data-testid="home-button"]');
        if (anchor instanceof HTMLElement) {
            let node = anchor;
            while (node.parentElement && node.parentElement !== nav) node = node.parentElement;
            if (node !== anchor) marks.add(node);
        }

        const bell = nav.querySelector('[data-testid="whats-new-feed-button"]');
        if (bell) marks.add(bell);
        const friends = nav.querySelector('[data-testid="friend-activity-button"]');
        if (friends) marks.add(friends);
        const install = Array.from(nav.querySelectorAll('a'))
            .find((a) => /install app/i.test(a.textContent || ''));
        if (install) marks.add(install);
        const onboarding = Array.from(nav.querySelectorAll('button'))
            .find((b) => /onboarding/i.test(b.getAttribute('aria-label') || '')
                || /^\d+\s*\/\s*\d+$/.test((b.textContent || '').trim()));
        if (onboarding) marks.add(onboarding);

        for (const el of nav.querySelectorAll('.su-nav-hide')) {
            if (!marks.has(el)) el.classList.remove('su-nav-hide');
        }
        for (const el of marks) {
            if (!el.classList.contains('su-nav-hide')) el.classList.add('su-nav-hide');
        }
    }

    /* ------------------------------------------------------------------ */
    /* App-shell hygiene (panes, home extras)                              */
    /* ------------------------------------------------------------------ */

    function markHiddenPanes() {
        const shell = document.querySelector(SHELL_SELECTOR);
        if (!shell) return;
        const nav = byId('global-nav-bar');
        const mainView = byId('main-view');
        const bar = document.querySelector(PLAYER_BAR_SELECTOR);
        const host = bar ? (bar.parentElement === shell ? bar : bar.parentElement) : null;
        for (const child of Array.from(shell.children)) {
            if (!(child instanceof HTMLElement)) continue;
            const keep = child === nav || child === mainView || child === host;
            setClass(child, 'su-pane-hide', !keep);
            // Always resolve su-player-host: if the native bar moved to
            // another shell child or unmounted, a stale class would keep
            // the previous host pinned as an invisible fixed element.
            setClass(child, 'su-player-host', Boolean(host) && child === host);
        }
    }

    function clearStrayInert() {
        // Spotify sets inert on #main-view whenever its full-page "cinema"
        // state (library / now playing / expanded panel) is active — the
        // pane states of the desktop layout this script replaces. A state
        // that never got torn down leaves a page that renders fine but
        // ignores every tap and scroll. The Library tab now exits through
        // Spotify's own Minimize button (leaveFullPageLibrary), so anything
        // still marked inert here is stray — strip it. In library view the
        // pane itself must stay tappable, so it gets the same treatment.
        const mainView = byId('main-view');
        if (mainView && mainView.hasAttribute('inert')) mainView.removeAttribute('inert');
        if (libraryOpen) {
            const pane = libraryPane();
            if (pane && pane.hasAttribute('inert')) pane.removeAttribute('inert');
        }
    }

    // The phone app's home is flat black, but the web player paints a
    // colored gradient wash behind the top of the feed (and tints the top
    // bar to match). The colors are runtime inline styles (React style
    // props), so no static selector can carry them: drop gradient-only
    // background images from the feed section, every wrapper between it
    // and #main-view (plus those wrappers' other children — a wash overlay
    // can sit beside the section), the container-level boxes and the top
    // bar. Backgrounds that layer real artwork (a url() layer, e.g. promo
    // banners) are left alone; stylesheet classes are handled by the
    // su-route-home CSS rules above the home feed block.
    //
    // The sweep used to re-read computed styles for the whole feed twice a
    // second — the heaviest thing the hygiene loop did. Each element is
    // now evaluated once and memoized: background-image is not inherited,
    // so an element's computed value can only change when its own
    // style/class attributes change (both surface as mutation records and
    // land it in the ledger), when the element is brand new (never
    // memoized), or when Spotify swaps stylesheets in/out (tracked by the
    // sheet count). Steady state re-checks only the mutated few; a ledger
    // overflow or a new stylesheet downgrades to a full scan.
    const stripMemo = new WeakMap();
    let lastSheetCount = -1;

    function flattenHomeBackgrounds(mainView, home, mutated, overflow) {
        const sheetsChanged = document.styleSheets.length !== lastSheetCount;
        lastSheetCount = document.styleSheets.length;
        const strip = (el) => {
            if (!(el instanceof HTMLElement)) return;
            if (!overflow && !sheetsChanged && stripMemo.has(el) && !mutated.has(el)) return;
            const image = getComputedStyle(el).backgroundImage;
            if (image.includes('gradient(') && !image.includes('url(')) {
                el.style.backgroundImage = 'none';
            }
            stripMemo.set(el, true);
        };
        for (let node = home; node instanceof HTMLElement && node !== mainView; node = node.parentElement) {
            strip(node);
            for (const child of node.children) strip(child);
        }
        for (const key of ['.main-view-container', '.main-view-container__scroll-node-child']) {
            const box = mainView.querySelector(key);
            if (box instanceof HTMLElement) {
                for (const child of box.children) strip(child);
            }
        }
        for (const el of home.querySelectorAll('*')) strip(el);
        // The top bar picks up a matching tint; the app keeps its header
        // black on Home.
        const nav = byId('global-nav-bar');
        if (nav instanceof HTMLElement) {
            strip(nav);
            for (const el of nav.querySelectorAll('*')) strip(el);
        }
    }

    function markHomeExtras(mutated, overflow) {
        const mainView = byId('main-view');
        if (!mainView) return;
        const home = mainView.querySelector('section[data-testid="home-page"]');
        if (!home) return;

        // The feed's leading block is Spotify's own home filter chip row
        // (All / Music / Podcasts). It is hidden here and mirrored into the
        // top bar (see syncHomeChips) — the phone app keeps its chips in the
        // header, not in the scrolling feed.
        const prev = home.previousElementSibling;
        if (prev instanceof HTMLElement && prev.querySelector('[data-testid="carousel-scroller"]')) {
            if (!prev.classList.contains('su-hide')) prev.classList.add('su-hide');
        }

        // Inside the feed: keep the shortcut ("Good evening") section and
        // real shelves; hide onboarding-style sections.
        for (const section of home.querySelectorAll(':scope > div > section')) {
            const isGreeting = Boolean(section.querySelector('[data-testid="shortcut-image"]'));
            const isShelf = section.getAttribute('data-testid') === 'component-shelf';
            setClass(section, 'su-hide', !isGreeting && !isShelf);
        }

        flattenHomeBackgrounds(mainView, home, mutated, overflow);
    }

    /* ------------------------------------------------------------------ */
    /* Home feed recovery                                                  */
    /* ------------------------------------------------------------------ */

    // The home feed is a GraphQL query held by React Query in a provider
    // mounted on the "/" layout route. When the query errors, Spotify
    // renders its page-level error state — an icon plus two <p> lines
    // ("Something went wrong." / "Search for something else?") — and the
    // errored entry stays cached: tapping Home again is a popstate on the
    // same route, which never remounts the provider, so the page sticks.
    // Recovery: leave the home route tree entirely (the catch-all path
    // renders nothing) so the provider unmounts, then return — React Query
    // treats the errored query as stale and refetches on the fresh mount.
    let homeErrorTicks = 0;
    let homeSoftRetries = 0;
    const HOME_SOFT_RETRY_MAX = 2;
    let homeRecovering = false;

    function homeErrorElement() {
        const mainView = byId('main-view');
        if (!mainView) return null;
        // Feed or skeleton present -> home is fine (both carry the testid).
        if (mainView.querySelector('section[data-testid="home-page"]')) return null;
        // Suspense fallback (spinner) -> still loading, give it time.
        if (mainView.querySelector('[data-testid="loading-page"]')) return null;
        // The error box: shared .contentSpacing wrapper, icon + two <p>
        // lines. The offline variant has only one <p> and is skipped.
        for (const box of mainView.querySelectorAll('div.contentSpacing')) {
            if (box.closest('[data-testid="loading-page"]')) continue;
            const lines = box.querySelectorAll(':scope > p');
            if (lines.length >= 2 && box.querySelector(':scope > svg')) return box;
        }
        return null;
    }

    function softRemountHome() {
        if (homeRecovering) return;
        homeRecovering = true;
        // replaceState (not pushState) keeps the back button clean; the
        // patched history methods fire su:locationchange and the synthetic
        // popstate is what Spotify's router reacts to.
        history.replaceState(history.state, '', HOME_RECOVERY_PATH);
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        window.setTimeout(() => {
            homeRecovering = false;
            // If the user tapped another tab during the blank hop, do not
            // yank them back to the home route. The Library overlay is
            // invisible to the pathname check (it changes no route), and
            // this hop's popstate would close it and drop the user on the
            // stale home view mid-recovery — defer until it is gone; the
            // refetch fires whenever the home tree next mounts fresh.
            if (location.pathname !== HOME_RECOVERY_PATH || libraryOpen) return;
            history.replaceState(history.state, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        }, 380);
    }

    function checkHomeRecovery() {
        if (!isHomePath(location.pathname) || libraryOpen) {
            homeErrorTicks = 0;
            return;
        }
        if (!homeErrorElement()) {
            homeErrorTicks = 0;
            return;
        }
        // Require the error to persist across two hygiene passes so a
        // transient error/flash is not acted on.
        homeErrorTicks += 1;
        if (homeErrorTicks < 2) return;
        homeErrorTicks = 0;
        if (homeSoftRetries < HOME_SOFT_RETRY_MAX) {
            homeSoftRetries += 1;
            softRemountHome();
            return;
        }
        // Soft retries exhausted: one clean reload per session revives the
        // feed when the failure is stale client state (fresh query client
        // + tokens). Guarded by sessionStorage so it can never loop.
        try {
            if (window.sessionStorage.getItem(HOME_RELOAD_FLAG) === '1') return;
            window.sessionStorage.setItem(HOME_RELOAD_FLAG, '1');
        } catch (error) {
            // Storage unavailable (cookies blocked): skip the reload rather
            // than risk an unguarded loop; soft retries remain available.
            return;
        }
        location.reload();
    }

    /* ------------------------------------------------------------------ */
    /* Routing                                                             */
    /* ------------------------------------------------------------------ */

    let contextInfo = null;

    function captureContext() {
        const match = location.pathname.match(/^\/(playlist|album)\/[^/]+/);
        if (!match) return;
        const kind = match[1];
        window.setTimeout(() => {
            const mainView = byId('main-view');
            const heading = mainView ? mainView.querySelector('h1') : null;
            let name = heading ? (heading.textContent || '').trim() : '';
            if (!name) {
                const docTitle = (document.title || '').split(/\s+\|\s+Spotify/i)[0].trim();
                name = docTitle.replace(/\s*[-\u2013]\s*(Playlist|Album|Single|EP|Compilation)\b.*$/i, '').trim();
            }
            if (name) contextInfo = { kind, name };
        }, 450);
    }

    function isHomePath(path) {
        return path === '/' || path === '' || path === HOME_RECOVERY_PATH;
    }

    function updateNavActive(path) {
        const chrome = byId(CHROME_ID);
        if (!chrome) return;
        const isHome = isHomePath(path);
        const isSearch = path === '/search' || path.startsWith('/search/');
        const isLibrary = libraryOpen || path.startsWith('/collection');
        for (const btn of chrome.querySelectorAll('[data-su-tab]')) {
            const tab = btn.getAttribute('data-su-tab');
            const active = (tab === 'home' && isHome && !libraryOpen)
                || (tab === 'search' && isSearch && !libraryOpen)
                || (tab === 'library' && isLibrary);
            setClass(btn, 'su-active', active);
            const isActive = active;
            // Swap outline/filled artwork to match the native app states.
            // Route events fire twice per tap (synthetic popstate +
            // su:locationchange), so guard on the rendered state and only
            // re-parse the SVG when the tab actually changes.
            const stateKey = isActive ? 'active' : 'idle';
            if (btn.dataset.suIconState !== stateKey) {
                btn.dataset.suIconState = stateKey;
                const ico = btn.querySelector('.su-nav-ico');
                if (ico) ico.innerHTML = ICONS[NAV_ICON_STATES[tab][stateKey]];
            }
        }
    }

    let lastRoutePath = null;

    function onRouteChange(event) {
        const path = location.pathname;
        // Spotify writes history without changing the path: boot-time URL
        // normalization, and persistence of its cinema state (the full-page
        // library) whenever that state toggles. Those writes surface here
        // as su:locationchange events. While the library view is open they
        // are not navigations — the library is an overlay on the current
        // route, so honoring a same-path write closed the panel and
        // revealed the page underneath: tapping Library in the first
        // seconds after boot (or as the full-page state engaged) bounced
        // straight back to Home. A real navigation changes the path, and a
        // popstate (back button, tab taps re-treading the current path) is
        // a deliberate exit — both go through.
        const isWriteEvent = Boolean(event) && event.type === 'su:locationchange';
        if (libraryOpen && isWriteEvent && path === lastRoutePath) return;
        lastRoutePath = path;
        const html = document.documentElement;
        // Any real navigation (tab tap, item opened from the panel, back
        // button) leaves the library view; the panel keeps its state hidden.
        if (libraryOpen) setLibraryPanel(false);
        const isHome = isHomePath(path);
        const isSearch = path === '/search' || path.startsWith('/search/');
        setClass(html, 'su-route-home', isHome);
        setClass(html, 'su-route-search', isSearch);
        setClass(html, 'su-route-content', !isHome && !isSearch);
        updateNavActive(path);
        if (isSearch) {
            const input = byId('su-search-input');
            const encoded = path.replace(/^\/search\/?/, '');
            let value = '';
            try {
                value = encoded ? decodeURIComponent(encoded) : '';
            } catch (error) {
                value = encoded;
            }
            if (input && input.value !== value && document.activeElement !== input) input.value = value;
        }
        captureContext();
        scheduleHygiene();
    }

    // Track SPA navigations by wrapping the history API.
    for (const method of ['pushState', 'replaceState']) {
        const original = history[method].bind(history);
        history[method] = function patched(...args) {
            const result = original.apply(this, args);
            window.dispatchEvent(new Event('su:locationchange'));
            return result;
        };
    }
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('su:locationchange', onRouteChange);

    /* ------------------------------------------------------------------ */
    /* Hygiene loop                                                        */
    /* ------------------------------------------------------------------ */

    let hygieneQueued = false;
    let hygieneDirty = true;

    // Element ledger fed by the observer: between passes it records WHICH
    // elements changed (targets of attribute records plus inserted nodes),
    // so each pass re-checks just those instead of re-scanning every node
    // unconditionally. Capped — an overflow downgrades the next sweep to a
    // full scan rather than losing track of changes.
    let pendingMutations = new Set();
    let mutationOverflow = false;
    const MUTATION_LEDGER_CAP = 3000;

    function scheduleHygiene() {
        hygieneDirty = true;
        if (hygieneQueued) return;
        hygieneQueued = true;
        window.setTimeout(() => {
            hygieneQueued = false;
            runHygiene();
        }, 250);
    }

    function noteMutations(records) {
        hygieneDirty = true;
        for (const record of records) {
            if (mutationOverflow) break;
            const target = record.target;
            if (target instanceof Element && !pendingMutations.has(target)) {
                if (pendingMutations.size >= MUTATION_LEDGER_CAP) {
                    mutationOverflow = true;
                    break;
                }
                pendingMutations.add(target);
            }
            for (const node of record.addedNodes) {
                if (mutationOverflow) break;
                if (!(node instanceof Element) || pendingMutations.has(node)) continue;
                if (pendingMutations.size >= MUTATION_LEDGER_CAP) {
                    mutationOverflow = true;
                    break;
                }
                pendingMutations.add(node);
            }
        }
        scheduleHygiene();
    }

    function runHygiene() {
        if (!document.body) return;
        // The tab is invisible: nothing consumes the suite's work and the
        // player keeps playing server-side. Skip the whole pass — one is
        // scheduled the moment the tab becomes visible again.
        if (document.visibilityState === 'hidden') return;
        hygieneDirty = false;
        const mutated = pendingMutations;
        pendingMutations = new Set();
        const overflow = mutationOverflow;
        mutationOverflow = false;
        ensureChrome();
        markHiddenPanes();
        clearStrayInert();
        enforceViewportMeta();
        enforceViewportScale();
        const nav = byId('global-nav-bar');
        ensureHeaderBits(nav);
        pruneNavBar(nav, mutated);
        syncHomeChips();
        markHomeExtras(mutated, overflow);
        checkHomeRecovery();
        mirror();
    }

    function startObservers() {
        const target = document.body || document.documentElement;
        // childList + attributes only: Spotify's per-second playback ticker
        // mutates text nodes, and every state this script reads surfaces
        // through attributes or structure — observing characterData made
        // the suite run twice a second forever.
        const observer = new MutationObserver(noteMutations);
        observer.observe(target, { childList: true, subtree: true, attributes: true });
        // Catch-up tick: in steady state nothing is dirty and this is one
        // boolean check. homeErrorTicks keeps recovery alive while its
        // error page sits static (no mutations to react to).
        window.setInterval(() => {
            if (hygieneDirty || homeErrorTicks > 0) runHygiene();
        }, 500);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') scheduleHygiene();
            else syncCanvas(); // hidden: muted videos keep decoding — stop it
        });
        runHygiene();
    }

    /* ------------------------------------------------------------------ */
    /* Access-token capture (Canvas fetch authorization)                   */
    /* ------------------------------------------------------------------ */

    // The canvas GraphQL query needs the session's bearer token. This script
    // never requests one: it watches the token the page already fetches for
    // itself. Installed at document-start (this runs before any page script,
    // so nothing can slip past the hook), it is a passive observer — every
    // call is transparently forwarded to the native fetch untouched.
    //   1. /api/token responses carry the full payload, expiry included —
    //      the page fetches it at every boot and on every renewal.
    //   2. Authorization headers of the page's own API calls (the home feed
    //      and friends hit pathfinder constantly) keep the value fresh even
    //      when the JSON payload path misses.
    const suToken = { value: null, expiresMs: 0 };

    function noteAccessToken(token, expiresMs) {
        if (!token) return;
        suToken.value = token;
        suToken.expiresMs = expiresMs || 0;
    }

    function headerValue(headers, name) {
        if (!headers) return null;
        if (typeof headers.get === 'function') return headers.get(name);
        if (Array.isArray(headers)) {
            const pair = headers.find(([key]) => String(key).toLowerCase() === name);
            return pair ? pair[1] : null;
        }
        const lower = name.toLowerCase();
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === lower) return headers[key];
        }
        return null;
    }

    function inspectForToken(input, init, promise) {
        let url = '';
        try {
            url = typeof input === 'string' ? input : (input && input.url) || '';
        } catch (error) {
            return;
        }
        try {
            const auth = headerValue((init && init.headers) || (input && input.headers) || null, 'authorization');
            if (auth && /^Bearer\s/i.test(auth)) noteAccessToken(auth.replace(/^Bearer\s/i, '').trim(), 0);
        } catch (error) { /* header introspection must never break traffic */ }
        if (url.indexOf('/api/token') !== -1 && promise && typeof promise.then === 'function') {
            promise.then((response) => {
                const clone = response && typeof response.clone === 'function' ? response.clone() : null;
                if (!clone) return;
                clone.json().then((data) => {
                    if (data && data.accessToken) {
                        noteAccessToken(data.accessToken, Number(data.accessTokenExpirationTimestampMs) || 0);
                    }
                }).catch(() => {});
            }).catch(() => {});
        }
    }

    function installTokenCapture() {
        if (typeof window.fetch !== 'function') return;
        const nativeFetch = window.fetch;
        window.fetch = function tokenAwareFetch(...args) {
            const promise = nativeFetch.apply(this, args);
            try {
                inspectForToken(args[0], args[1], promise);
            } catch (error) { /* observing must never break traffic */ }
            return promise;
        };
    }

    /* ------------------------------------------------------------------ */
    /* Boot                                                                */
    /* ------------------------------------------------------------------ */

    function initialize() {
        installMobileLayout();
        syncMobileClass();
        enforceViewportScale();
        ensureChrome();
        onRouteChange();
        runHygiene();
        window.setTimeout(startObservers, 300);
    }

    window.addEventListener('resize', () => {
        syncMobileClass();
        enforceViewportScale();
        if (libraryOpen) stretchLibraryPane();
        scheduleHygiene();
    }, { passive: true });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (document.documentElement.classList.contains(FULL_OPEN_CLASS)) {
                closeFullPlayer();
            } else if (libraryOpen) {
                setLibraryPanel(false);
            }
        }
    });

    // The fetch hook must be in place before any page script runs — this
    // whole IIFE body executes synchronously at document-start, so the
    // bottom of it is still long before Spotify's deferred bundles boot.
    installTokenCapture();

    syncMobileClass();
    // Applied before first paint when possible: at document-start the
    // documentElement already exists, so a desktop-site phone gets its zoom
    // emulation without ever flashing the shrunken layout.
    enforceViewportScale();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
