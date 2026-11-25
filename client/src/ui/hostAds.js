/**
 * The host portal floats its own screen ads over the game (a banner along the bottom, boxes at
 * the sides on big screens and in landscape on phones). The modal panels (index.css,
 * `.pp-backdrop`) always keep clear of the strips those ads cover, wherever the game runs, so
 * the layout you test is the layout the portal shows: the root element gets `data-ads="1"`.
 * `?noads` in the URL turns the reserved space off (to see the panels at full size).
 */
if (typeof window !== 'undefined' && !new URLSearchParams(window.location.search).has('noads')) {
  document.documentElement.dataset.ads = '1'
}
