import shutil

TARGET = "game.js"
BACKUP = "game.js.bak"

with open(TARGET, "r", encoding="utf-8", newline="") as f:
    raw = f.read()

eol = "\r\n" if "\r\n" in raw else "\n"
src = raw.replace("\r\n", "\n")

if "function spawnVfxSheet(" in src:
    print("[BILGI] VFX yamasi game.js icinde zaten kurulu.")
    raise SystemExit(0)

patches = [
    (
        "1) VFX yardimcilari (sliceVfxSheet & spawnVfxSheet)",
        """    state.floatingTexts.push({ txt: t, life: 1, vy: -0.7 });
  }""",
        """    state.floatingTexts.push({ txt: t, life: 1, vy: -0.7 });
  }

  state.vfxFrames = { clash: [], burst: [], frame: [] };
  state.vfxSprites = [];

  function sliceVfxSheet(baseTex, cols = 4, rows = 4) {
    if (!baseTex || baseTex === PIXI.Texture.EMPTY) return [];
    const cw = Math.floor(baseTex.width / cols);
    const ch = Math.floor(baseTex.height / rows);
    const frames = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        frames.push(new PIXI.Texture({
          source: baseTex.source,
          frame: new PIXI.Rectangle(c * cw, r * ch, cw, ch)
        }));
      }
    }
    return frames;
  }

  function spawnVfxSheet(type, x, y, opts = {}) {
    const frames = state.vfxFrames && state.vfxFrames[type];
    if (!frames || !frames.length) return null;
    const spr = new PIXI.Sprite(frames[0]);
    spr.anchor.set(0.5);
    spr.position.set(x, y);
    spr.blendMode = 'add';
    spr.alpha = opts.alpha ?? 1.0;
    if (opts.width && opts.height) {
      spr.width = opts.width;
      spr.height = opts.height;
    } else {
      const sz = opts.size ?? 256;
      spr.width = sz;
      spr.height = sz;
    }
    if (opts.rotation) spr.rotation = opts.rotation;
    const layer = opts.layer || fxLayer;
    layer.addChild(spr);
    state.vfxSprites.push({
      spr,
      frames,
      frame: opts.startFrame ?? 0,
      fps: opts.fps ?? 30,
      loop: !!opts.loop
    });
    return spr;
  }"""
    ),
    (
        "2) Ticker VFX animasyon dongusu + hizli flash sonumleme",
        """    if (flashOverlay.alpha > 0.005) flashOverlay.alpha = Math.max(0, flashOverlay.alpha - 0.045 * dt);
    else flashOverlay.alpha = 0;""",
        """    if (flashOverlay.alpha > 0.005) flashOverlay.alpha = Math.max(0, flashOverlay.alpha - 0.065 * dt);
    else flashOverlay.alpha = 0;

    for (let i = state.vfxSprites.length - 1; i >= 0; i--) {
      const v = state.vfxSprites[i];
      if (!v.spr || v.spr.destroyed || !v.spr.parent) {
        if (v.spr && !v.spr.destroyed) v.spr.destroy();
        state.vfxSprites.splice(i, 1);
        continue;
      }
      v.frame += (v.fps / 60) * dt;
      if (v.loop) {
        v.spr.texture = v.frames[Math.floor(v.frame) % v.frames.length];
      } else {
        const idx = Math.floor(v.frame);
        if (idx >= v.frames.length) {
          v.spr.parent.removeChild(v.spr);
          v.spr.destroy();
          state.vfxSprites.splice(i, 1);
        } else {
          v.spr.texture = v.frames[idx];
        }
      }
    }"""
    ),
    (
        "3) VS Duello carpismasina vfx_vs_clash + dengeli flash",
        """      // 3. Çapraz Kılıç Kesiği + Flash + Şok Dalgası
      AUDIO.playSfx('vs_clash', { volume: 1.0 });
      triggerShake(15, 380);
      triggerFlash(0.46);
      spawnShockwave(centerX, centerY, 0xfff1bf, 215);
      spawnShockwave(centerX, centerY, winAccent, 150);
      spawnBurst(centerX, centerY, 72, [0xffffff, 0xfff1bf, winAccent, 0xff7b29]);

      const slash = new PIXI.Graphics();
      slash.moveTo(-12, BOARD_H * 0.72).lineTo(CELL_W + 12, BOARD_H * 0.28).stroke({ width: 16, color: 0xffae34, alpha: 0.85, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.28).lineTo(CELL_W + 12, BOARD_H * 0.72).stroke({ width: 14, color: 0x49d6ff, alpha: 0.8, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.72).lineTo(CELL_W + 12, BOARD_H * 0.28).stroke({ width: 6, color: 0xffffff, alpha: 1, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.28).lineTo(CELL_W + 12, BOARD_H * 0.72).stroke({ width: 5, color: 0xffffff, alpha: 1, cap: 'round' });
      fgColBox.addChild(slash);""",
        """      // 3. Çapraz Kılıç Kesiği (DaVinci VFX) + Dengeli Flash
      AUDIO.playSfx('vs_clash', { volume: 1.0 });
      triggerShake(15, 380);
      triggerFlash(0.14);
      spawnVfxSheet('clash', centerX, centerY, { size: Math.max(CELL_W * 2.55, 400), fps: 30, alpha: 1.0 });
      spawnBurst(centerX, centerY, 20, [0xffffff, 0xfff1bf, winAccent, 0xff7b29]);

      const slash = new PIXI.Container();
      fgColBox.addChild(slash);"""
    ),
    (
        "4) Aktif VS sutun takibi + carpan kilitlenmesinde vfx_hit_burst",
        """      state.activeVsColumns.push({ ringGfx: energyRings, multTxt: winnerTxt, edgeGfx, accent: winAccent });

      spawnShockwave(centerX, centerY, winAccent, 140);""",
        """      state.activeVsColumns.push({ col, ringGfx: energyRings, multTxt: winnerTxt, edgeGfx, accent: winAccent });

      spawnVfxSheet('burst', centerX, centerY, { size: CELL_W * 1.95, fps: 34, alpha: 0.92 });
      spawnShockwave(centerX, centerY, winAccent, 140);"""
    ),
    (
        "5) Coklu VS toplam carpaninda vfx_hit_burst",
        """      spawnBurst(STAGE_W / 2, STAGE_H / 2, 42, [0xfff1bf, 0xff7b29, 0x49d6ff]);""",
        """      spawnVfxSheet('burst', STAGE_W / 2, STAGE_H / 2, { size: 420, fps: 30, alpha: 0.95 });
      spawnBurst(STAGE_W / 2, STAGE_H / 2, 22, [0xfff1bf, 0xff7b29, 0x49d6ff]);"""
    ),
    (
        "6) Kazanan karolarda donen altin cerceve (vfx_win_frame)",
        """    const framesGfx = new PIXI.Graphics();
    hitCells.forEach((key) => {
      const [c, r] = key.split('_').map(Number);
      const x = c * CELL_W + 5;
      const y = r * CELL_H + 5;
      framesGfx.roundRect(x, y, CELL_W - 10, CELL_H - 10, 12)
        .fill({ color: 0xf6d379, alpha: 0.12 })
        .stroke({ width: 5, color: 0xff8c24, alpha: 0.5 });
      framesGfx.roundRect(x + 2, y + 2, CELL_W - 14, CELL_H - 14, 10)
        .stroke({ width: 2.5, color: 0xfff1bf, alpha: 0.96 });
    });
    winFrameLayer.addChild(framesGfx);""",
        """    const hasVfxFrame = state.vfxFrames && state.vfxFrames.frame && state.vfxFrames.frame.length > 0;
    if (hasVfxFrame) {
      hitCells.forEach((key) => {
        const [c, r] = key.split('_').map(Number);
        const cx = c * CELL_W + CELL_W / 2;
        const cy = r * CELL_H + CELL_H / 2;
        spawnVfxSheet('frame', cx, cy, {
          width: CELL_W * 1.24,
          height: CELL_H * 1.24,
          fps: 24,
          loop: true,
          alpha: 0.96,
          layer: winFrameLayer
        });
      });
    } else {
      const framesGfx = new PIXI.Graphics();
      hitCells.forEach((key) => {
        const [c, r] = key.split('_').map(Number);
        const x = c * CELL_W + 5;
        const y = r * CELL_H + 5;
        framesGfx.roundRect(x, y, CELL_W - 10, CELL_H - 10, 12)
          .fill({ color: 0xf6d379, alpha: 0.12 })
          .stroke({ width: 5, color: 0xff8c24, alpha: 0.5 });
        framesGfx.roundRect(x + 2, y + 2, CELL_W - 14, CELL_H - 14, 10)
          .stroke({ width: 2.5, color: 0xfff1bf, alpha: 0.96 });
      });
      winFrameLayer.addChild(framesGfx);
    }"""
    ),
    (
        "7) Tek cizgi rozetinin aktif VS sutunuyla cakismasini engelleme",
        """    if (showSingleBadge && winList.length === 1) {
      const w = winList[0];
      const line = PAYLINES[w.line];
      const midCol = Math.min(2, Math.floor((w.count - 1) / 2));""",
        """    if (showSingleBadge && winList.length === 1) {
      const w = winList[0];
      const line = PAYLINES[w.line];
      const vsCols = new Set(state.activeVsColumns.map(v => v.col));
      let midCol = Math.min(2, Math.floor((w.count - 1) / 2));
      if (vsCols.has(midCol)) {
        for (let c = 0; c < w.count; c++) {
          if (!vsCols.has(c)) { midCol = c; break; }
        }
      }"""
    ),
    (
        "8) Kazanc aninda vfx_hit_burst + 3. sutun +$36.00 cakisma cozumu",
        """    renderWinSubset(wins, bet, wins.length === 1);
    // Tek çizgi kazancında rozet zaten tutarı gösterdiği için çift uçan metin üretme!
    if (wins.length > 1) {
      spawnFloatingWin(`+${RGS.formatMoney(winMoney)}`, STAGE_W / 2, STAGE_H / 2);
    }
    spawnBurst(STAGE_W / 2, STAGE_H / 2, 24, [0xfff1bf, 0xf6d379, 0xff7b29]);""",
        """    renderWinSubset(wins, bet, wins.length === 1);
    const hasCenterVs = state.activeVsColumns.some(v => v.col === 2);
    // Tek çizgi kazancında rozet zaten tutarı gösterdiği için çift uçan metin üretme!
    if (wins.length > 1) {
      const winTextY = hasCenterVs ? (BOARD_Y + 52) : (STAGE_H / 2);
      spawnFloatingWin(`+${RGS.formatMoney(winMoney)}`, STAGE_W / 2, winTextY);
    }
    const burstCells = [];
    const seenBurst = new Set();
    for (const w of wins) {
      const line = PAYLINES[w.line];
      for (let c = 0; c < w.count; c++) {
        const k = `${c}_${line[c]}`;
        if (!seenBurst.has(k)) {
          seenBurst.add(k);
          burstCells.push([c, line[c]]);
        }
      }
    }
    const step = Math.max(1, Math.floor(burstCells.length / 4));
    for (let i = 0, spawned = 0; i < burstCells.length && spawned < 4; i += step, spawned++) {
      const [c, r] = burstCells[i];
      spawnVfxSheet('burst', BOARD_X + c * CELL_W + CELL_W / 2, BOARD_Y + r * CELL_H + CELL_H / 2, {
        size: CELL_W * 1.65,
        fps: 32,
        alpha: 0.92
      });
    }
    spawnBurst(STAGE_W / 2, STAGE_H / 2, 14, [0xfff1bf, 0xf6d379, 0xff7b29]);"""
    ),
    (
        "9) Boot asamasinda 3 VFX sprite sheet yukleme",
        """      populateInitialReels();
      resizeStage();
      setLoad(100, 'READY');""",
        """      const vfxAssets = {
        clash: 'assets/vfx/vfx_vs_clash.png',
        burst: 'assets/vfx/vfx_hit_burst.png',
        frame: 'assets/vfx/vfx_win_frame.png'
      };
      for (const [vKey, vPath] of Object.entries(vfxAssets)) {
        try {
          const vTex = await PIXI.Assets.load(vPath);
          state.vfxFrames[vKey] = sliceVfxSheet(vTex, 4, 4);
        } catch (e) {
          console.warn(`[VFX] Yuklenemedi: ${vPath}`, e);
          state.vfxFrames[vKey] = [];
        }
      }

      populateInitialReels();
      resizeStage();
      setLoad(100, 'READY');"""
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

print(f"\n[TAMAMLANDI] Yedek alindi ({BACKUP}) ve {TARGET} guncellendi.")