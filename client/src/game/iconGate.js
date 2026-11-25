/**
 * Car portraits (cars/carIcons.js) are drawn - one a frame, each read back from the GPU -
 * only once this is open (App: a few seconds after the track is ready). Asked for earlier
 * (the HUD's name tag wants yours at once), the first draw and its readback would land in
 * the lobby, where the readback waits on a GPU still busy with the HUD's first raster (a
 * 1.1 s frame, measured). GameScene's frame start checks it.
 */
export const iconGate = { open: false }

export function allowCarIcons() {
  iconGate.open = true
}
