import re, shutil

# --- 1) game.js YAMA ---
JS_TARGET = "game.js"
shutil.copy2(JS_TARGET, "game.js.ui.bak")

with open(JS_TARGET, "r", encoding="utf-8", newline="") as f:
    raw = f.read()

eol = "\r\n" if "\r\n" in raw else "\n"
src = raw.replace("\r\n", "\n")

js_patches = [
    (
        "1) Karo ici 4 cark yerine mat obsidyen + ince pirinc cerceve",
        """    const tile = new PIXI.Sprite(state.textures.tile_bg || PIXI.Texture.EMPTY);
    tile.anchor.set(0.5);
    tile.width = CELL_W - 8;
    tile.height = CELL_H - 8;
    tile.alpha = 0.94;
    box.addChild(tile);""",
        """    const tw = CELL_W - 8;
    const th = CELL_H - 8;
    const tile = new PIXI.Graphics();
    tile.roundRect(-tw / 2, -th / 2, tw, th, 11)
      .fill({ color: 0x0f141d, alpha: 0.94 })
      .stroke({ width: 1.5, color: 0x704e1e, alpha: 0.72 });
    tile.roundRect(-tw / 2 + 4, -th / 2 + 4, tw - 8, th - 8, 8)
      .fill({ color: 0x080b11, alpha: 0.82 })
      .stroke({ width: 1, color: 0x2a2016, alpha: 0.75 });
    const rx = tw / 2 - 8;
    const ry = th / 2 - 8;
    [[-rx, -ry], [rx, -ry], [-rx, ry], [rx, ry]].forEach(([px, py]) => {
      tile.circle(px, py, 1.8).fill({ color: 0xb98635, alpha: 0.42 });
    });
    box.addChild(tile);"""
    ),
    (
        "2) fitSlot icindeki eski tile_bg dokusunu kaldirma",
        """    if (state.textures.tile_bg) {
      slot.tile.texture = state.textures.tile_bg;
      slot.tile.width = CELL_W - 8;
      slot.tile.height = CELL_H - 8;
    }

""",
        ""
    ),
    (
        "3) Tease sutun dolgusunu inceltme (akan semboller net gorunsun)",
        """    g.roundRect(col * CELL_W + 2, 2, CELL_W - 4, BOARD_H - 4, 12)
      .fill({ color: 0xff5a12, alpha: 0.22 })
      .stroke({ width: 6, color: 0xff9a2e, alpha: 0.95 });""",
        """    g.roundRect(col * CELL_W + 2, 2, CELL_W - 4, BOARD_H - 4, 12)
      .fill({ color: 0xff5a12, alpha: 0.10 })
      .stroke({ width: 6, color: 0xff9a2e, alpha: 0.95 });"""
    ),
    (
        "4) Tease beklemesinde bos sutun yerine hizli akan sembol dongusu",
        """    if (teaseHoldMs > 0) {
      await exitPromise;
      let waited = 0;
      while (!state.quickStop && waited < teaseHoldMs) {
        await gameSleep(35);
        waited += 35;
      }
    } else {""",
        """    if (teaseHoldMs > 0) {
      const teasePool = (typeof SYMBOL_KEYS !== 'undefined' && SYMBOL_KEYS.length)
        ? SYMBOL_KEYS
        : ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4'];
      const spinSlots = [];
      const totalSpinSlots = ROWS + 2;
      for (let i = 0; i < totalSpinSlots; i++) {
        const s = createSlot();
        fitSlot(s, teasePool[Math.floor(Math.random() * teasePool.length)]);
        s.box.x = CELL_W / 2;
        s.box.y = -CELL_H * (i + 0.5);
        s.box.alpha = 0.86;
        s.sp.scale.set(s.baseScale * 0.96, s.baseScale * 1.18);
        reel.container.addChild(s.box);
        spinSlots.push(s);
      }
      await new Promise((resolve) => {
        let elapsed = 0;
        let last = performance.now();
        const speedPxPerMs = (CELL_H * 14.5) / 1000;
        const wrapSpan = totalSpinSlots * CELL_H;
        const bottomLimit = BOARD_H + CELL_H * 0.65;
        function spinTick(now) {
          if (!state.paused) {
            const delta = Math.min(60, now - last);
            elapsed += delta;
            const dy = delta * speedPxPerMs;
            for (let i = 0; i < spinSlots.length; i++) {
              const s = spinSlots[i];
              s.box.y += dy;
              if (s.box.y > bottomLimit) {
                s.box.y -= wrapSpan;
                fitSlot(s, teasePool[Math.floor(Math.random() * teasePool.length)]);
                s.box.alpha = 0.86;
                s.sp.scale.set(s.baseScale * 0.96, s.baseScale * 1.18);
              }
            }
          }
          last = now;
          if (state.quickStop || elapsed >= teaseHoldMs) {
            const flushDur = state.quickStop ? 65 : 135;
            const flushStartYs = spinSlots.map(s => s.box.y);
            let fElapsed = 0;
            let fLast = performance.now();
            function flushTick(fNow) {
              if (!state.paused) fElapsed += Math.min(60, fNow - fLast);
              fLast = fNow;
              const fp = Math.min(1, fElapsed / flushDur);
              for (let i = 0; i < spinSlots.length; i++) {
                spinSlots[i].box.y = flushStartYs[i] + fp * (BOARD_H + CELL_H);
                spinSlots[i].box.alpha = Math.max(0, 0.86 * (1 - fp * 1.25));
              }
              if (fp >= 1) {
                spinSlots.forEach(s => {
                  if (s.box.parent) s.box.parent.removeChild(s.box);
                  s.box.destroy({ children: true });
                });
                return;
              }
              requestAnimationFrame(flushTick);
            }
            requestAnimationFrame(flushTick);
            return resolve();
          }
          requestAnimationFrame(spinTick);
        }
        requestAnimationFrame(spinTick);
      });
      await exitPromise;
    } else {"""
    ),
]

for name, old, new in js_patches:
    if old not in src:
        print(f"[HATA] Eslesme bulunamadi -> {name}")
        raise SystemExit(1)
    src = src.replace(old, new, 1)
    print(f"[OK] {name}")

with open(JS_TARGET, "w", encoding="utf-8", newline="") as f:
    f.write(src.replace("\n", eol))

# --- 2) index.html YAMA ---
HTML_TARGET = "index.html"
shutil.copy2(HTML_TARGET, "index.html.ui.bak")

with open(HTML_TARGET, "r", encoding="utf-8", newline="") as f:
    hraw = f.read()

pat = re.compile(r'<p class="modal-desc">Boosted VS Reels.*?100.*?</p>')
if not pat.search(hraw):
    print("[UYARI] index.html icinde Free Spins alt satiri zaten degismis veya bulunamadi.")
else:
    hnew = pat.sub(
        '<p class="modal-desc" style="font-size:0.9em;">Boosted VS Reels &bull; Retriggers &bull; Up&nbsp;to&nbsp;<strong>100&times;</strong></p>',
        hraw,
        count=1
    )
    with open(HTML_TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(hnew)
    print("[OK] 5) index.html Free Spins 100x tek satir hizalamasi")

print("\n[TAMAMLANDI] Tum gorsel duzeltmeler uygulandi.")