// Tracks the last local edit time so the cross-device sync poll can back off
// while the user is actively editing (avoids clobbering in-flight edits).
let lastEditAt = 0

export function markEdit() {
  lastEditAt = Date.now()
}

export function recentlyEdited(ms = 2000): boolean {
  return Date.now() - lastEditAt < ms
}
