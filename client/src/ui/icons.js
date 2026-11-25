/**
 * Up We Drive's icon set, hand-drawn as SVG in the Sky Docks style: chunky shapes with
 * thick ink outlines. Strings rather than components so the same art feeds both the DOM
 * HUD (<img src>) and canvas-drawn 3D world labels (`iconUrl`).
 *
 * Every icon uses a 100x100 viewBox. Gradient ids are prefixed per icon so icons can
 * be inlined side by side without clashing.
 */

const INK = '#0d1530'

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs}</defs>${body}</svg>`

const vgrad = (id, top, bottom) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`

const coin = svg(
  `<circle cx="50" cy="52" r="40" fill="#e09a10" stroke="${INK}" stroke-width="6"/>
   <circle cx="50" cy="48" r="36" fill="url(#co-g)" stroke="${INK}" stroke-width="5"/>
   <circle cx="50" cy="48" r="25" fill="none" stroke="#e09a10" stroke-width="5"/>
   <path d="M44 34h12M50 34v28M44 62h12" stroke="#b8730a" stroke-width="7" stroke-linecap="round"/>
   <path d="M28 36a26 26 0 0 1 14-12" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".8"/>
   <path d="M78 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  vgrad('co-g', '#fff2a0', '#ffc21f'),
)

const car = svg(
  `<path d="M10 66V52l10-4 12-16h32l14 16 12 4v14z" fill="url(#ca-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M36 36h12v12H28zM54 36h8l10 12H54z" fill="#bff0ff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
   <circle cx="28" cy="68" r="11" fill="#2b2f36" stroke="${INK}" stroke-width="5"/><circle cx="28" cy="68" r="4" fill="#c9ced4"/>
   <circle cx="72" cy="68" r="11" fill="#2b2f36" stroke="${INK}" stroke-width="5"/><circle cx="72" cy="68" r="4" fill="#c9ced4"/>`,
  vgrad('ca-g', '#ffb36b', '#ff7a1a'),
)

const spin = svg(
  `<path d="M38 88l12-22 12 22z" fill="#8a96a3" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <rect x="26" y="86" width="48" height="9" rx="4" fill="#5a6676" stroke="${INK}" stroke-width="5"/>
   <circle cx="50" cy="52" r="42" fill="url(#sp-rim)" stroke="${INK}" stroke-width="6"/>
   <path d="M50 52L38.5 24.3A30 30 0 0 1 61.5 24.3z" fill="#ff7a1a"/><path d="M50 52L61.5 24.3A30 30 0 0 1 77.7 40.5z" fill="#ffd52a"/><path d="M50 52L77.7 40.5A30 30 0 0 1 77.7 63.5z" fill="#18c3d6"/><path d="M50 52L77.7 63.5A30 30 0 0 1 61.5 79.7z" fill="#ffffff"/><path d="M50 52L61.5 79.7A30 30 0 0 1 38.5 79.7z" fill="#b05cff"/><path d="M50 52L38.5 79.7A30 30 0 0 1 22.3 63.5z" fill="#ffd52a"/><path d="M50 52L22.3 63.5A30 30 0 0 1 22.3 40.5z" fill="#3fd97a"/><path d="M50 52L22.3 40.5A30 30 0 0 1 38.5 24.3z" fill="#ffffff"/>
   <path d="M50 52L38.5 24.3M50 52L61.5 24.3M50 52L77.7 40.5M50 52L77.7 63.5M50 52L61.5 79.7M50 52L38.5 79.7M50 52L22.3 63.5M50 52L22.3 40.5" stroke="${INK}" stroke-width="2.5"/>
   <circle cx="50" cy="52" r="30" fill="none" stroke="${INK}" stroke-width="4"/>
   <circle cx="68.5" cy="20" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/><circle cx="82" cy="33.5" r="3.2" fill="#ff5a4a" stroke="#0d1530" stroke-width="1.6"/><circle cx="87" cy="52" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/><circle cx="82" cy="70.5" r="3.2" fill="#ff5a4a" stroke="#0d1530" stroke-width="1.6"/><circle cx="68.5" cy="84" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/><circle cx="50" cy="89" r="3.2" fill="#ff5a4a" stroke="#0d1530" stroke-width="1.6"/><circle cx="31.5" cy="84" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/><circle cx="18" cy="70.5" r="3.2" fill="#ff5a4a" stroke="#0d1530" stroke-width="1.6"/><circle cx="13" cy="52" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/><circle cx="18" cy="33.5" r="3.2" fill="#ff5a4a" stroke="#0d1530" stroke-width="1.6"/><circle cx="31.5" cy="20" r="3.2" fill="#fffbe0" stroke="#0d1530" stroke-width="1.6"/>
   <path d="M27 34a30 30 0 0 1 16-11" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
   <circle cx="50" cy="52" r="8" fill="url(#sp-hub)" stroke="${INK}" stroke-width="4"/>
   <path d="M50 22L40 3h20z" fill="url(#sp-pin)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
  `${vgrad('sp-rim', '#fff2a0', '#e8960c')}${vgrad('sp-hub', '#ffffff', '#c9ced4')}${vgrad('sp-pin', '#ff8a7a', '#d4142a')}`,
)

const garage = svg(
  `<path d="M6 42L50 10l44 32v50H6z" fill="url(#ga-wall)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M6 42L50 10l44 32" fill="none" stroke="#ff7a1a" stroke-width="5" stroke-linejoin="round" transform="translate(0 6)"/>
   <path d="M14 42L50 17" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>
   <rect x="18" y="46" width="64" height="44" rx="3" fill="#141c33" stroke="${INK}" stroke-width="5"/>
   <path d="M26 88v-8l7-3 6-8h22l7 8 7 3v8z" fill="url(#ga-car)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
   <path d="M41 71h7v6h-11zM52 71h7l5 6H52z" fill="#bff0ff" stroke="${INK}" stroke-width="2"/>
   <circle cx="36" cy="88" r="5" fill="#2b2f36" stroke="${INK}" stroke-width="3"/><circle cx="64" cy="88" r="5" fill="#2b2f36" stroke="${INK}" stroke-width="3"/>
   <rect x="18" y="46" width="64" height="22" fill="url(#ga-door)" stroke="${INK}" stroke-width="5"/>
   <path d="M20 53h60M20 60h60" stroke="${INK}" stroke-width="2.5" opacity=".45"/>
   <rect x="44" y="64" width="12" height="4" rx="2" fill="${INK}"/>`,
  `${vgrad('ga-wall', '#9ff6ff', '#1897b8')}${vgrad('ga-door', '#ffe36a', '#f0a010')}${vgrad('ga-car', '#ff9a4a', '#e8590c')}`,
)

const store = svg(
  `<path d="M33 36V26a17 17 0 0 1 34 0v10" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
   <path d="M33 36V26a17 17 0 0 1 34 0v10" fill="none" stroke="#ffe36a" stroke-width="4" stroke-linecap="round"/>
   <path d="M14 34h72l-5 58H19z" fill="url(#st-bag)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M14 34h72l-1 10H15z" fill="#128a3a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
   <circle cx="33" cy="39" r="3" fill="${INK}"/><circle cx="67" cy="39" r="3" fill="${INK}"/>
   <path d="M24 50l-3 34" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>
   <circle cx="56" cy="68" r="17" fill="url(#st-coin)" stroke="${INK}" stroke-width="5"/>
   <circle cx="56" cy="68" r="11" fill="none" stroke="#e09a10" stroke-width="3"/>
   <path d="M52 61h8M56 61v14M52 75h8" stroke="#b8730a" stroke-width="4" stroke-linecap="round"/>
   <path d="M46 61a12 12 0 0 1 6-5" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/>`,
  `${vgrad('st-bag', '#b6ff6a', '#19b52a')}${vgrad('st-coin', '#fff2a0', '#ffc21f')}`,
)

const trophy = svg(
  `<path d="M27 22H11c0 16 7 25 19 27M73 22h16c0 16-7 25-19 27" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
   <path d="M27 22H11c0 16 7 25 19 27M73 22h16c0 16-7 25-19 27" fill="none" stroke="#ffc41f" stroke-width="5" stroke-linejoin="round"/>
   <path d="M43 58h14l3 14H40z" fill="url(#tr-cup)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <rect x="28" y="72" width="44" height="10" rx="3" fill="#8a5a2a" stroke="${INK}" stroke-width="5"/>
   <rect x="22" y="81" width="56" height="12" rx="4" fill="url(#tr-base)" stroke="${INK}" stroke-width="5"/>
   <path d="M38 87h24" stroke="#ffe36a" stroke-width="3" stroke-linecap="round"/>
   <path d="M23 8h54v22c0 18-12 30-27 30S23 48 23 30z" fill="url(#tr-cup)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M23 8h54v7H23z" fill="#fff6c0" stroke="${INK}" stroke-width="4"/>
   <path d="M50 20L53.1 27.8L61.4 28.3L54.9 33.6L57.1 41.7L50 37.2L42.9 41.7L45.1 33.6L38.6 28.3L46.9 27.8z" fill="#ffffff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
   <path d="M31 20v12c0 6 2 11 6 15" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".6"/>`,
  `${vgrad('tr-cup', '#fff2a0', '#f09a10')}${vgrad('tr-base', '#34508f', '#14234f')}`,
)

const gear = svg(
  `<path d="M42.4 16.9L43.9 6.4L56.1 6.4L57.6 16.9L65.4 19.7L73.3 12.7L82.7 20.6L77.2 29.5L81.3 36.7L91.8 36.4L94 48.5L84 51.8L82.5 59.9L90.8 66.5L84.7 77.1L74.9 73.2L68.5 78.5L70.7 88.8L59.1 93L54.1 83.7L45.9 83.7L40.9 93L29.3 88.8L31.5 78.5L25.1 73.2L15.3 77.1L9.2 66.5L17.5 59.9L16 51.8L6 48.5L8.2 36.4L18.7 36.7L22.8 29.5L17.3 20.6L26.7 12.7L34.6 19.7z" fill="url(#ge-g)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <circle cx="50" cy="50" r="24" fill="none" stroke="#5a6676" stroke-width="3" opacity=".6"/>
   <path d="M24 36a30 30 0 0 1 16-14" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75"/>
   <circle cx="50" cy="50" r="18" fill="#1b2a55" stroke="${INK}" stroke-width="5"/>
   <path d="M61.3 56.5L50 63L38.7 56.5L38.7 43.5L50 37L61.3 43.5z" fill="url(#ge-bolt)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
   <circle cx="50" cy="50" r="4.5" fill="${INK}"/>`,
  `${vgrad('ge-g', '#f4f7fb', '#8a96a3')}${vgrad('ge-bolt', '#ffe36a', '#e8960c')}`,
)

const respawn = svg(
  `<path d="M76 30A32 32 0 1 0 82 58" fill="none" stroke="${INK}" stroke-width="17" stroke-linecap="round"/>
   <path d="M76 30A32 32 0 1 0 82 58" fill="none" stroke="url(#re-g)" stroke-width="9" stroke-linecap="round"/>
   <path d="M30 34a26 26 0 0 1 12-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".7"/>
   <path d="M92 10L87 44 56 32z" fill="url(#re-g)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <path d="M44 72V36" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
   <path d="M46 36h20l-5 7 5 7H46z" fill="#7cf25a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
   <ellipse cx="44" cy="73" rx="9" ry="4" fill="#14234f" stroke="${INK}" stroke-width="3"/>`,
  vgrad('re-g', '#ffc07a', '#e8590c'),
)

const home = svg(
  `<circle cx="74" cy="10" r="5" fill="#eef3f8" stroke="${INK}" stroke-width="2.5"/><circle cx="83" cy="6" r="3.5" fill="#eef3f8" stroke="${INK}" stroke-width="2.5"/>
   <rect x="62" y="16" width="13" height="24" fill="url(#ho-brick)" stroke="${INK}" stroke-width="5"/>
   <rect x="59" y="13" width="19" height="7" rx="2" fill="#5a6676" stroke="${INK}" stroke-width="4"/>
   <rect x="18" y="46" width="64" height="46" fill="url(#ho-wall)" stroke="${INK}" stroke-width="6"/>
   <path d="M6 52L50 14l44 38z" fill="url(#ho-roof)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M18 46L50 20" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>
   <rect x="25" y="58" width="15" height="14" rx="2" fill="#bff0ff" stroke="${INK}" stroke-width="4"/>
   <path d="M32.5 58v14M25 65h15" stroke="${INK}" stroke-width="2.5"/>
   <path d="M50 92V70a9 9 0 0 1 18 0v22z" fill="#2f86e0" stroke="${INK}" stroke-width="4"/>
   <circle cx="63" cy="80" r="2" fill="#ffd52a"/>`,
  `${vgrad('ho-wall', '#fff8e8', '#e3d2b0')}${vgrad('ho-roof', '#ff8a6a', '#d4342a')}${vgrad('ho-brick', '#d97a4a', '#9a4a2a')}`,
)

const lock = svg(
  `<path d="M30 44V32a20 20 0 0 1 40 0v12" fill="none" stroke="${INK}" stroke-width="14"/>
   <path d="M30 44V32a20 20 0 0 1 40 0v12" fill="none" stroke="#c9ced4" stroke-width="6"/>
   <rect x="18" y="42" width="64" height="48" rx="8" fill="url(#lo-g)" stroke="${INK}" stroke-width="6"/>
   <circle cx="50" cy="62" r="7" fill="${INK}"/><path d="M50 64v12" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  vgrad('lo-g', '#fff2a0', '#ffc41f'),
)

const flag = svg(
  `<path d="M22 8v86" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
   <path d="M26 12h58l-10 18 10 18H26z" fill="#fff" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M26 12h14v12H26zM54 12h14v12H54zM40 24h14v12H40zM26 36h14v12H26zM54 36h14v12H54z" fill="${INK}"/>`,
)

const up = svg(
  `<path d="M50 8L88 50H66v42H34V50H12z" fill="url(#up-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
  vgrad('up-g', '#7cf25a', '#19a974'),
)

const sound = svg(
  `<path d="M12 38h16l24-20v64L28 62H12z" fill="#e9edf2" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M64 34c8 8 8 24 0 32M74 24c14 14 14 38 0 52" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
)

const soundOff = svg(
  `<path d="M12 38h16l24-20v64L28 62H12z" fill="#c9ced4" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M64 36l24 28M88 36L64 64" stroke="#ff4a3d" stroke-width="9" stroke-linecap="round"/>`,
)

const music = svg(
  `<path d="M38 74V20l46-10v52" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
   <ellipse cx="28" cy="76" rx="14" ry="11" fill="#18c3d6" stroke="${INK}" stroke-width="6"/>
   <ellipse cx="74" cy="64" rx="14" ry="11" fill="#18c3d6" stroke="${INK}" stroke-width="6"/>`,
)

/** A low sun sinking into the sea (Settings: golden hour). */
const sunset = svg(
  `<path d="M16 62a34 34 0 0 1 68 0z" fill="url(#ss-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M50 10v10M20 24l7 7M80 24l-7 7M6 46h10M84 46h10" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
   <path d="M8 62h84M22 74h56M34 86h32" stroke="#18c3d6" stroke-width="7" stroke-linecap="round"/>`,
  vgrad('ss-g', '#ffe27a', '#ff8a3d'),
)

const nitro = svg(
  `<path d="M36 8h28v12l10 8v62H26V28l10-8z" fill="url(#ni-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M56 34L38 60h12l-6 20 20-28H52z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  vgrad('ni-g', '#9ff0ff', '#18a3c6'),
)

// --- Items ------------------------------------------------------------------------------

const jump = svg(
  `<path d="M20 86h60" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
   <path d="M30 78l40-8-40-8 40-8-40-8" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>
   <path d="M30 78l40-8-40-8 40-8-40-8" fill="none" stroke="#7cf25a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
   <path d="M50 6L72 30H58v10H42V30H28z" fill="#7cf25a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
)

const turbo = svg(
  `<rect x="26" y="14" width="48" height="76" rx="10" fill="url(#tu-g)" stroke="${INK}" stroke-width="6"/>
   <rect x="38" y="6" width="24" height="12" rx="3" fill="#c9ced4" stroke="${INK}" stroke-width="5"/>
   <path d="M56 30L38 56h12l-6 22 20-30H52z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  vgrad('tu-g', '#ffb36b', '#ff5a1a'),
)

const shield = svg(
  `<circle cx="50" cy="50" r="40" fill="url(#sh-g)" stroke="${INK}" stroke-width="6" opacity=".95"/>
   <path d="M28 40a24 24 0 0 1 20-18" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>`,
  `<radialGradient id="sh-g" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e9fbff"/><stop offset="1" stop-color="#2fb8ff"/></radialGradient>`,
)

const magnet = svg(
  `<path d="M18 20v32a32 32 0 0 0 64 0V20H62v32a12 12 0 0 1-24 0V20z" fill="#ff4a3d" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M18 20h20v14H18zM62 20h20v14H62z" fill="#e9edf2" stroke="${INK}" stroke-width="5"/>`,
)

const anchor = svg(
  `<circle cx="50" cy="18" r="9" fill="none" stroke="${INK}" stroke-width="7"/>
   <path d="M50 27v60M32 40h36" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
   <path d="M14 58c4 20 20 30 36 30s32-10 36-30" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
   <path d="M50 27v60M32 40h36M14 58c4 20 20 30 36 30s32-10 36-30" fill="none" stroke="#8a96a3" stroke-width="4" stroke-linecap="round"/>`,
)

const missile = svg(
  `<g transform="rotate(-40 50 50)">
   <path d="M26 42L2 50l24 8z" fill="url(#mi-f)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <path d="M32 40L22 22l24 18zM32 60l-10 18 24-18z" fill="#ff4a2a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <path d="M26 38h42c10 0 20 6 24 12-4 6-14 12-24 12H26z" fill="url(#mi-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M70 39c10 2 18 7 21 11-3 4-11 9-21 11z" fill="#ff4a2a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <circle cx="50" cy="50" r="6" fill="#bff0ff" stroke="${INK}" stroke-width="4"/></g>`,
  `${vgrad('mi-g', '#ffffff', '#c9d0d9')}${vgrad('mi-f', '#fff1a8', '#ff7a1a')}`,
)

const glider = svg(
  `<path d="M6 54c14-16 30-20 44-6 14-14 30-10 44 6-14-4-28 0-44 14C34 54 20 50 6 54z" fill="#f4f7fb" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M44 46l6-12 6 12" fill="#ffc41f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
)


// --- HUD extras ---------------------------------------------------------------------------

const pearl = svg(
  `<ellipse cx="50" cy="86" rx="30" ry="7" fill="${INK}" opacity=".25"/>
   <circle cx="50" cy="50" r="36" fill="url(#pe-g)" stroke="${INK}" stroke-width="6"/>
   <path d="M24 60a28 28 0 0 0 40 14" fill="none" stroke="#c77fb0" stroke-width="4" stroke-linecap="round" opacity=".6"/>
   <ellipse cx="38" cy="36" rx="11" ry="7" fill="#fff" transform="rotate(-30 38 36)"/>
   <circle cx="60" cy="30" r="3" fill="#fff" opacity=".8"/>`,
  `<radialGradient id="pe-g" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#ffe3f1"/><stop offset="1" stop-color="#d48fbd"/></radialGradient>`,
)

const close = svg(
  `<path d="M24 24l52 52M76 24L24 76" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>
   <path d="M24 24l52 52M76 24L24 76" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`,
)

/** Up We Drive's emblem: a road climbing to the right out of a hazard kerb, an arrow up. */
const logo = svg(
  `<g clip-path="url(#lg-c)">
     <rect x="6" y="6" width="88" height="88" fill="url(#lg-sky)"/>
     <circle cx="74" cy="26" r="11" fill="#fff3b0" opacity=".9"/>
     <path d="M2 96L58 96L98 18L80 18Z" fill="#2b3038" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
     <path d="M34 96L89 18" stroke="#ffc41f" stroke-width="5" stroke-dasharray="8 7"/>
     <path d="M0 82h100v20H0z" fill="#ffc41f" stroke="${INK}" stroke-width="4"/>
     <path d="M4 82l8 16M20 82l8 16M36 82l8 16M52 82l8 16M68 82l8 16M84 82l8 16" stroke="${INK}" stroke-width="6"/>
   </g>
   <rect x="6" y="6" width="88" height="88" rx="22" fill="none" stroke="${INK}" stroke-width="7"/>
   <path d="M29 12L47 33H38V52H20V33H11Z" fill="url(#lg-ar)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
   <path d="M18 18a40 40 0 0 1 20-8" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".55"/>`,
  `<clipPath id="lg-c"><rect x="6" y="6" width="88" height="88" rx="22"/></clipPath>${vgrad('lg-sky', '#7fd6ff', '#2f86e0')}${vgrad('lg-ar', '#ffc07a', '#ff6a1a')}`,
)

const warn = svg(
  `<path d="M50 8L94 86H6z" fill="url(#wa-g)" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
   <path d="M50 34v24" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
   <circle cx="50" cy="72" r="6" fill="${INK}"/>`,
  vgrad('wa-g', '#fff27a', '#ff9a0a'),
)

const check = svg(
  `<circle cx="50" cy="50" r="40" fill="url(#ck-g)" stroke="${INK}" stroke-width="6"/>
   <path d="M30 52l13 13 27-29" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M30 52l13 13 27-29" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  vgrad('ck-g', '#9cff6e', '#19a974'),
)

const star = svg(
  `<path d="M50 6l12 27 29 3-22 20 7 29-26-15-26 15 7-29L9 36l29-3z" fill="url(#sr-g)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
   <path d="M34 38l12-2" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>`,
  vgrad('sr-g', '#fff6b0', '#ffb01f'),
)

const timer = svg(
  `<rect x="40" y="4" width="20" height="10" rx="3" fill="#c9ced4" stroke="${INK}" stroke-width="5"/>
   <circle cx="50" cy="56" r="36" fill="#f4f7fb" stroke="${INK}" stroke-width="7"/>
   <path d="M50 56V34" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
   <path d="M50 56l14 10" stroke="#ff7a1a" stroke-width="7" stroke-linecap="round"/>
   <circle cx="50" cy="56" r="5" fill="${INK}"/>`,
)

const info = svg(
  `<circle cx="50" cy="50" r="40" fill="url(#in-g)" stroke="${INK}" stroke-width="6"/>
   <circle cx="50" cy="30" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/>
   <path d="M50 46v26" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
   <path d="M50 46v26" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`,
  vgrad('in-g', '#9ff6ff', '#128fb0'),
)

const gas = svg(
  `<rect x="22" y="8" width="56" height="84" rx="14" fill="url(#gs-g)" stroke="${INK}" stroke-width="6"/>
   <path d="M34 26h32M34 42h32M34 58h32M34 74h32" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity=".55"/>`,
  vgrad('gs-g', '#e9fbe0', '#7cd77a'),
)

const brake = svg(
  `<rect x="12" y="28" width="76" height="46" rx="12" fill="url(#bk-g)" stroke="${INK}" stroke-width="6"/>
   <path d="M26 44h48M26 58h48" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity=".55"/>`,
  vgrad('bk-g', '#ffe1dc', '#ff8a7a'),
)

export const ICON_SVGS = {
  coin,
  car,
  spin,
  garage,
  store,
  trophy,
  gear,
  respawn,
  home,
  lock,
  flag,
  up,
  sound,
  soundOff,
  music,
  sunset,
  nitro,
  jump,
  turbo,
  shield,
  magnet,
  anchor,
  glider,
  missile,
  pearl,
  close,
  logo,
  warn,
  check,
  star,
  timer,
  info,
  gas,
  brake,
}

const urlCache = new Map()
const svgUrl = (name) => (ICON_SVGS[name] ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVGS[name])}` : null)

/** A URL for icon `name` (a ready bitmap once prerasterIcons has made it, else the SVG), or null for an unknown name. Cached. */
export function iconUrl(name) {
  if (urlCache.has(name)) return urlCache.get(name)
  const url = svgUrl(name)
  urlCache.set(name, url)
  return url
}

/** Side of the bitmap each icon is rasterised to (2-3x its usual on-screen size). */
const RASTER = 192

/**
 * Rasterises every icon once, on the CPU (a software canvas), into a PNG that `iconUrl`
 * hands out from then on. Drawn as SVG, each icon's paths and gradients made the browser
 * compile its GPU raster shaders the first time the HUD appeared - about 1.4 s of GPU time
 * on a cold browser, holding up the first frames; a bitmap is one cheap image draw. Called
 * at start-up (main.jsx); an icon asked for before it's ready is drawn as the SVG.
 */
let rastered = null
export function prerasterIcons() {
  rastered ||= rasterAll()
  return rastered
}

function rasterAll() {
  if (typeof document === 'undefined') return Promise.resolve()
  const canvas = document.createElement('canvas')
  canvas.width = RASTER
  canvas.height = RASTER
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return Promise.resolve()
  // Decoded in parallel, drawn one at a time (one shared canvas).
  let queue = Promise.resolve()
  const one = (name) =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        queue = queue.then(
          () =>
            new Promise((done) => {
              ctx.clearRect(0, 0, RASTER, RASTER)
              ctx.drawImage(img, 0, 0, RASTER, RASTER)
              canvas.toBlob((blob) => {
                if (blob) urlCache.set(name, URL.createObjectURL(blob))
                done()
                resolve()
              }, 'image/png')
            }),
        )
      }
      img.onerror = () => resolve()
      img.src = svgUrl(name)
    })
  return Promise.all(Object.keys(ICON_SVGS).map(one))
}
