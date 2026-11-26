import shutil

TARGET = "game.js"
BACKUP = "game.js.vfx.bak"

with open(TARGET, "r", encoding="utf-8", newline="") as f:
    raw = f.read()

eol = "\r\n" if "\r\n" in raw else "\n"
src = raw.replace("\r\n", "\n")

patches = [
    (
        "1) Aktif VS sutununda kare win_frame gizleme",
        """    const hasVfxFrame = state.vfxFrames && state.vfxFrames.frame && state.vfxFrames.frame.length > 0;
    if (hasVfxFrame) {
      hitCells.forEach((key) => {
        const [c, r] = key.split('_').map(Number);
        const cx = c * CELL_W + CELL_W / 2;""",
        """    const activeVsCols = new Set(state.activeVsColumns.map(v => v.col));
    const hasVfxFrame = state.vfxFrames && state.vfxFrames.frame && state.vfxFrames.frame.length > 0;
    if (hasVfxFrame) {
      hitCells.forEach((key) => {
        const [c, r] = key.split('_').map(Number);
        if (activeVsCols.has(c)) return;
        const cx = c * CELL_W + CELL_W / 2;"""
    ),
    (
        "2) Carpan kilidi patlamasini 8x yazisinin arkasina alma (alpha 0.58)",
        """      state.activeVsColumns.push({ col, ringGfx: energyRings, multTxt: winnerTxt, edgeGfx, accent: winAccent });

      spawnVfxSheet('burst', centerX, centerY, { size: CELL_W * 1.95, fps: 34, alpha: 0.92 });
      spawnShockwave(centerX, centerY, winAccent, 140);""",
        """      state.activeVsColumns.push({ col, ringGfx: energyRings, multTxt: winnerTxt, edgeGfx, accent: winAccent });

      const lockBurst = spawnVfxSheet('burst', CELL_W / 2, winTargetY, {
        size: CELL_W * 1.85,
        fps: 34,
        alpha: 0.58,
        layer: fgColBox
      });
      if (lockBurst) fgColBox.setChildIndex(lockBurst, 0);
      spawnShockwave(centerX, centerY, winAccent, 140);"""
    ),
    (
        "3) Sembol ustu hit_burst parlaklik ve boyut dengesi (1.42x / alpha 0.64)",
        """      spawnVfxSheet('burst', BOARD_X + c * CELL_W + CELL_W / 2, BOARD_Y + r * CELL_H + CELL_H / 2, {
        size: CELL_W * 1.65,
        fps: 32,
        alpha: 0.92
      });""",
        """      spawnVfxSheet('burst', BOARD_X + c * CELL_W + CELL_W / 2, BOARD_Y + r * CELL_H + CELL_H / 2, {
        size: CELL_W * 1.42,
        fps: 34,
        alpha: 0.64
      });"""
    ),
]

for name, old, new in patches:
    if old not in src:
        print(f"[HATA] Eslesme bulunamadi -> {name}")
        raise SystemExit(1)
    src = src.replace(old, new, 1)
    print(f"[OK] {name}")

shutil.copy2(TARGET, BACKUP)
with open(TARGET, "w", encoding="utf-8", newline="") as f:
    f.write(src.replace("\n", eol))

print("\n[TAMAMLANDI] 3 VFX cilasi uygulandi.")