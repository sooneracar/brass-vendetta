(async () => {
  const COLS = 5;
  const ROWS = 4;
  const CELL_W = 164;
  const CELL_H = 148;
  const BOARD_W = COLS * CELL_W; // 820
  const BOARD_H = ROWS * CELL_H; // 592
  const STAGE_W = 940;
  const STAGE_H = 700;
  const BOARD_X = (STAGE_W - BOARD_W) / 2;
  const BOARD_Y = (STAGE_H - BOARD_H) / 2;

  const SYMBOL_KEYS = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W', 'VS', 'SC'];
  const REGULAR_KEYS = ['H4', 'H3', 'H2', 'H1', 'L4', 'L3', 'L2', 'L1'];
  const EXTRA_TEXTURES = ['tile_bg', 'vs_banner'];
  const LINE_COLORS = [
    0xf6d379, 0xff7b29, 0x49d6ff, 0xff4d6d, 0x7cff7c, 0xd88cff, 0xffd166,
    0x06d6a0, 0xef476f, 0x4cc9f0, 0xf77f00, 0xa8dadc, 0xe9c46a, 0xff9f1c
  ];

  const SYMBOL_STYLE = {
    L1: { aura: 0x26e69f, alpha: 0.14 },
    L2: { aura: 0xb95cff, alpha: 0.14 },
    L3: { aura: 0x3ec8ff, alpha: 0.14 },
    L4: { aura: 0xff4e4e, alpha: 0.14 },
    H1: { aura: 0x26e69f, alpha: 0.24 },
    H2: { aura: 0xff5a45, alpha: 0.26 },
    H3: { aura: 0x3ec8ff, alpha: 0.28 },
    H4: { aura: 0xffd24d, alpha: 0.34 },
    W:  { aura: 0xffb326, alpha: 0.36 },
    SC: { aura: 0xff6218, alpha: 0.38 },
    VS: { aura: 0x49d6ff, alpha: 0.38 }
  };

  const RGS = window.BV_RGS;
  const AUDIO = window.BV_AUDIO;
  const { PAYLINES, PAYTABLE } = window.BV_CONST;
  const $ = (id) => document.getElementById(id);

  let app = null;

  const state = {
    paused: false,
    betIndex: 3,
    balance: 1000,
    displayedWin: 0,
    displayedHudWin: 0,
    turbo: false,
    spinning: false,
    quickStop: false,
    skipWin: false,
    inBonus: false,
    autoLeft: 0,
    cycleToken: 0,
    pendingRound: null,
    replayData: null,
    textures: {},
    particles: [],
    steamPuffs: [],
    rings: [],
    floatingTexts: [],
    gears: [],
    vsEnergyRings: [],
    activeVsColumns: [],
    winningSlots: [],
    shakeTime: 0,
    shakeDuration: 280,
    shakeMag: 0,
    zoom: 1,
    targetZoom: 1,
    pulseTime: 0,
    currentGrid: [
      ['H4', 'L1', 'VS', 'L2', 'H3'],
      ['L3', 'H2', 'W',  'H1', 'L4'],
      ['H1', 'SC', 'H4', 'SC', 'H2'],
      ['L2', 'L4', 'L1', 'L3', 'W']
    ]
  };

  // --- GLOBAL PAUSE GATE ---
  function gameSleep(ms) {
    return new Promise((resolve) => {
      if (ms <= 0) return resolve();
      let elapsed = 0;
      let last = performance.now();
      function step(now) {
        if (!state.paused) elapsed += Math.min(80, now - last);
        last = now;
        if (elapsed >= ms) return resolve();
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function applyGlobalPause(shouldPause) {
    if (state.paused === shouldPause) return;
    state.paused = shouldPause;
    const vid = $('studio-video');
    if (shouldPause) {
      if (app && app.ticker) app.ticker.stop();
      AUDIO.pauseAll();
      if (vid && !vid.paused && !$('studio-intro').classList.contains('hidden')) vid.pause();
    } else {
      if (app && app.ticker) app.ticker.start();
      AUDIO.resumeAll();
      if (vid && vid.paused && !$('studio-intro').classList.contains('hidden')) vid.play().catch(() => {});
    }
  }

  document.addEventListener('visibilitychange', () => applyGlobalPause(document.hidden));
  window.addEventListener('pagehide', () => applyGlobalPause(true));
  window.addEventListener('pageshow', () => applyGlobalPause(false));

  function currentBet() {
    if (RGS.isReplay && state.replayData?.betAmount) return state.replayData.betAmount;
    return RGS.betLevels[state.betIndex] ?? 1.0;
  }

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function animateMoney(el, fromVal, toVal, durationMs = 420) {
    if (!el) return;
    const animId = (el._animId || 0) + 1;
    el._animId = animId;
    if (Math.abs(toVal - fromVal) < 0.00001 || durationMs <= 20) {
      el.textContent = RGS.formatMoney(toVal);
      return;
    }
    let elapsed = 0;
    let last = performance.now();
    const tick = (now) => {
      if (el._animId !== animId) return;
      if (!state.paused) elapsed += Math.min(80, now - last);
      last = now;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 2.5);
      el.textContent = RGS.formatMoney(fromVal + (toVal - fromVal) * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = RGS.formatMoney(toVal);
    };
    requestAnimationFrame(tick);
  }

  function syncMoneyUI(winVal = null, animateWin = false) {
    const bet = currentBet();
    const buyCost = bet * 100;
    const canAffordBuy = state.balance >= buyCost;
    const locked = state.spinning || state.inBonus || RGS.isReplay;

    $('ui-balance').textContent = RGS.formatMoney(state.balance);
    $('ui-bet').textContent = RGS.formatMoney(bet);
    $('buy-bonus-price').textContent = RGS.formatMoney(buyCost);

    $('modal-bet-val').textContent = RGS.formatMoney(bet);
    $('buy-modal-cost').textContent = RGS.formatMoney(buyCost);
    $('buy-insufficient').classList.toggle('hidden', canAffordBuy);
    $('btn-confirm-buy').disabled = locked || !canAffordBuy;

    const atMin = locked || state.betIndex <= 0;
    const atMax = locked || state.betIndex >= RGS.betLevels.length - 1;
    $('btn-bet-down').disabled = atMin;
    $('btn-bet-up').disabled = atMax;
    $('btn-modal-bet-down').disabled = atMin;
    $('btn-modal-bet-up').disabled = atMax;
    $('btn-buy-bonus').disabled = locked;

    if (winVal !== null) {
      if (animateWin && winVal > state.displayedWin) {
        animateMoney($('ui-win'), state.displayedWin, winVal, state.turbo ? 220 : 460);
      } else {
        $('ui-win').textContent = RGS.formatMoney(winVal);
      }
      state.displayedWin = winVal;
    }
  }

  function applySocialModeLabels() {
    if (!RGS.isSocial) return;
    $('lbl-bet').textContent = 'PLAY';
    $('lbl-modal-bet').textContent = 'PLAY AMOUNT';
    $('buy-bonus-title').textContent = 'PLAY FEATURE';
    $('buy-modal-title').textContent = 'PLAY FURNACE FREE SPINS';
    $('buy-modal-cost-label').textContent = 'FEATURE PLAY (100×)';
    $('btn-confirm-buy').textContent = 'PLAY FEATURE';
  }

  function setSpinVisual(isSpinning) {
    const btn = $('btn-spin');
    btn.classList.toggle('spinning', isSpinning);
    $('spin-arrow').classList.toggle('hidden', isSpinning);
    $('spin-arrow-head').classList.toggle('hidden', isSpinning);
    $('spin-stop-icon').classList.toggle('hidden', !isSpinning);
  }

  function setBonusTheme(active) {
    state.inBonus = active;
    document.body.classList.toggle('bonus-active', active);
    $('bg-base').classList.toggle('active', !active);
    $('bg-bonus').classList.toggle('active', active);
    $('bonus-hud').classList.toggle('hidden', !active);
    if (!active) {
      clearRoundVisuals();
      state.displayedHudWin = 0;
    }
    AUDIO.playMusic(active ? 'bonus' : 'base');
    resizeStage();
  }

  function buildPaytableAndLines() {
    $('paytable-grid').innerHTML = REGULAR_KEYS.map(k => {
      const p = PAYTABLE[k];
      return `
        <div class="pt-card">
          <img src="assets/img/${k}.png" alt="${k}" />
          <div class="pt-lines">
            <div>5× <b>${p[5]}×</b></div>
            <div>4× <b>${p[4]}×</b></div>
            <div>3× <b>${p[3]}×</b></div>
          </div>
        </div>`;
    }).join('');

    $('paylines-grid').innerHTML = PAYLINES.map((line, i) => {
      let dots = '';
      const pts = [];
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 4; r++) {
          const x = 6 + c * 12;
          const y = 6 + r * 10;
          const hit = line[c] === r;
          if (hit) pts.push(`${x},${y}`);
          dots += `<rect x="${x-3}" y="${y-3}" width="6" height="6" rx="1.2" fill="${hit ? '#f6d379' : '#1e283b'}"/>`;
        }
      }
      return `
        <div class="pl-box">
          <span>#${i + 1}</span>
          <svg viewBox="0 0 60 42">
            <polyline points="${pts.join(' ')}" fill="none" stroke="#ff7b29" stroke-width="1.8" stroke-linejoin="round"/>
            ${dots}
          </svg>
        </div>`;
    }).join('');
  }

  // --- PIXIJS V8 KURULUMU ---
  app = new PIXI.Application();
  await app.init({
    width: STAGE_W,
    height: STAGE_H,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true
  });
  $('pixi-container').appendChild(app.canvas);

  function resizeStage() {
    const wrap = $('stage-wrap');
    if (!wrap || !app) return;
    const availW = Math.max(120, wrap.clientWidth - 8);
    const availH = Math.max(110, wrap.clientHeight - 4);
    const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    app.canvas.style.width = `${Math.floor(STAGE_W * scale)}px`;
    app.canvas.style.height = `${Math.floor(STAGE_H * scale)}px`;
  }
  resizeStage();
  window.addEventListener('resize', resizeStage);
  window.addEventListener('orientationchange', () => setTimeout(resizeStage, 140));
  if (window.ResizeObserver) new ResizeObserver(resizeStage).observe($('stage-wrap'));

  const root = new PIXI.Container();
  root.pivot.set(STAGE_W / 2, STAGE_H / 2);
  root.position.set(STAGE_W / 2, STAGE_H / 2);
  app.stage.addChild(root);

  const gearLayer = new PIXI.Container();
  root.addChild(gearLayer);

  function createGear(outerR, innerR, teeth, fillColor, strokeColor) {
    const g = new PIXI.Graphics();
    const step = (Math.PI * 2) / teeth;
    const pts = [];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      pts.push(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      pts.push(Math.cos(a0 + step * 0.22) * outerR, Math.sin(a0 + step * 0.22) * outerR);
      pts.push(Math.cos(a0 + step * 0.5) * outerR, Math.sin(a0 + step * 0.5) * outerR);
      pts.push(Math.cos(a0 + step * 0.72) * innerR, Math.sin(a0 + step * 0.72) * innerR);
    }
    g.poly(pts).fill({ color: fillColor, alpha: 0.9 }).stroke({ width: 2.5, color: strokeColor });
    g.circle(0, 0, innerR * 0.62).fill({ color: 0x0b0f18, alpha: 0.85 }).stroke({ width: 2, color: strokeColor });
    for (let s = 0; s < 4; s++) {
      const ang = (s * Math.PI) / 2;
      g.moveTo(Math.cos(ang) * -innerR * 0.6, Math.sin(ang) * -innerR * 0.6)
        .lineTo(Math.cos(ang) * innerR * 0.6, Math.sin(ang) * innerR * 0.6)
        .stroke({ width: 6, color: fillColor });
    }
    g.circle(0, 0, innerR * 0.22).fill({ color: strokeColor }).stroke({ width: 2, color: 0x2e1a05 });
    return g;
  }

  [
    { x: BOARD_X - 6,           y: BOARD_Y + 26,          r1: 58, r2: 46, teeth: 12, dir:  1, fill: 0x6e4a16, stroke: 0xdba442 },
    { x: BOARD_X + BOARD_W + 8, y: BOARD_Y + 34,          r1: 62, r2: 49, teeth: 14, dir: -1, fill: 0x5c3c11, stroke: 0xc89336 },
    { x: BOARD_X - 8,           y: BOARD_Y + BOARD_H - 28, r1: 54, r2: 43, teeth: 11, dir: -1, fill: 0x4b3310, stroke: 0xb8822d },
    { x: BOARD_X + BOARD_W + 6, y: BOARD_Y + BOARD_H - 22, r1: 56, r2: 44, teeth: 12, dir:  1, fill: 0x6e4a16, stroke: 0xdba442 }
  ].forEach((gs) => {
    const g = createGear(gs.r1, gs.r2, gs.teeth, gs.fill, gs.stroke);
    g.position.set(gs.x, gs.y);
    gearLayer.addChild(g);
    state.gears.push({ gfx: g, dir: gs.dir });
  });

  const steamLayer = new PIXI.Container();
  root.addChild(steamLayer);

  const boardGlow = new PIXI.Graphics();
  root.addChild(boardGlow);

  function drawBoardFrame() {
    const frame = new PIXI.Container();
    const outer = new PIXI.Graphics();
    outer.roundRect(BOARD_X - 18, BOARD_Y - 18, BOARD_W + 36, BOARD_H + 36, 20)
      .fill({ color: 0x090e17, alpha: 0.62 })
      .stroke({ width: 5.5, color: 0x8f621b, alpha: 1 });
    outer.roundRect(BOARD_X - 14, BOARD_Y - 14, BOARD_W + 28, BOARD_H + 28, 16)
      .stroke({ width: 2, color: 0xf6d379, alpha: 0.92 });
    outer.roundRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8, 10)
      .fill({ color: 0x050912, alpha: 0.42 })
      .stroke({ width: 1.5, color: 0x5c3c11, alpha: 0.95 });
    frame.addChild(outer);

    const dividers = new PIXI.Graphics();
    for (let c = 1; c < COLS; c++) {
      const x = BOARD_X + c * CELL_W;
      dividers.moveTo(x, BOARD_Y + 4).lineTo(x, BOARD_Y + BOARD_H - 4)
        .stroke({ width: 2, color: 0xc89336, alpha: 0.3 });
    }
    frame.addChild(dividers);

    const rivets = new PIXI.Graphics();
    [
      [BOARD_X - 9, BOARD_Y - 9], [BOARD_X + BOARD_W + 9, BOARD_Y - 9],
      [BOARD_X - 9, BOARD_Y + BOARD_H + 9], [BOARD_X + BOARD_W + 9, BOARD_Y + BOARD_H + 9],
      [BOARD_X + BOARD_W / 2, BOARD_Y - 11], [BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H + 11],
      [BOARD_X - 11, BOARD_Y + BOARD_H / 2], [BOARD_X + BOARD_W + 11, BOARD_Y + BOARD_H / 2]
    ].forEach(([x, y]) => {
      rivets.circle(x, y, 5.5).fill({ color: 0xdba442 }).stroke({ width: 1.5, color: 0x4a2c08 });
      rivets.circle(x - 1.5, y - 1.5, 1.8).fill({ color: 0xfff3c4, alpha: 0.9 });
    });
    frame.addChild(rivets);
    root.addChild(frame);
  }
  drawBoardFrame();

  // KATMAN SIRALAMASI (Ödeme çizgileri VS çarpanının ARKASINDAN geçer!)
  const reelsClip = new PIXI.Container();
  reelsClip.position.set(BOARD_X, BOARD_Y);
  const clipMask = new PIXI.Graphics();
  clipMask.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H).fill({ color: 0xffffff });
  root.addChild(clipMask);
  reelsClip.mask = clipMask;
  root.addChild(reelsClip);

  const teaseLayer = new PIXI.Container();
  teaseLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(teaseLayer);

  const vsBannerLayer = new PIXI.Container();
  vsBannerLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(vsBannerLayer);

  const winFrameLayer = new PIXI.Container();
  winFrameLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(winFrameLayer);

  const lineLayer = new PIXI.Container();
  lineLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineLayer);

  const vsForegroundLayer = new PIXI.Container();
  vsForegroundLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(vsForegroundLayer);

  const lineBadgeLayer = new PIXI.Container();
  lineBadgeLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineBadgeLayer);

  const fxLayer = new PIXI.Container();
  root.addChild(fxLayer);

  const flashOverlay = new PIXI.Graphics();
  flashOverlay.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0xffe8b0 });
  flashOverlay.alpha = 0;
  root.addChild(flashOverlay);

  // --- OYMALI TAŞ KARO + SEMBOL HÜCRESİ ---
  function createSlot() {
    const box = new PIXI.Container();

    const tile = new PIXI.Sprite(state.textures.tile_bg || PIXI.Texture.EMPTY);
    tile.anchor.set(0.5);
    tile.width = CELL_W - 8;
    tile.height = CELL_H - 8;
    tile.alpha = 0.94;
    box.addChild(tile);

    const aura = new PIXI.Graphics();
    box.addChild(aura);

    const sp = new PIXI.Sprite();
    sp.anchor.set(0.5);
    box.addChild(sp);

    const vsGroup = new PIXI.Container();
    vsGroup.visible = false;

    const vsRing = new PIXI.Graphics();
    vsRing.arc(0, 0, 52, -Math.PI * 0.85, -Math.PI * 0.1)
      .stroke({ width: 4, color: 0x49d6ff, alpha: 0.94, cap: 'round' });
    vsRing.arc(0, 0, 52, Math.PI * 0.15, Math.PI * 0.9)
      .stroke({ width: 4, color: 0xff6a1a, alpha: 0.94, cap: 'round' });
    vsGroup.addChild(vsRing);

    const vsPlate = new PIXI.Graphics();
    vsPlate.roundRect(-32, 22, 64, 28, 7)
      .fill({ color: 0x160c05, alpha: 0.92 })
      .stroke({ width: 2, color: 0xfff1bf, alpha: 1 });
    vsGroup.addChild(vsPlate);

    const vsText = new PIXI.Text({
      text: 'VS',
      style: { fontFamily: 'Cinzel', fontSize: 20, fontWeight: '900', fill: 0xfff2c2, letterSpacing: 2, stroke: { color: 0x993506, width: 4 } }
    });
    vsText.anchor.set(0.5);
    vsText.position.set(0, 36);
    vsGroup.addChild(vsText);

    box.addChild(vsGroup);
    return { box, tile, aura, sp, vsGroup, vsRing, symKey: 'L1', baseScale: 1 };
  }

  function fitSlot(slot, symKey) {
    slot.symKey = symKey;
    const style = SYMBOL_STYLE[symKey] || SYMBOL_STYLE.L1;
    const tex = state.textures[symKey];

    if (state.textures.tile_bg) {
      slot.tile.texture = state.textures.tile_bg;
      slot.tile.width = CELL_W - 8;
      slot.tile.height = CELL_H - 8;
    }

    slot.sp.texture = tex || PIXI.Texture.EMPTY;
    const w = tex && tex.width ? tex.width : 512;
    const h = tex && tex.height ? tex.height : 512;
    const factor = symKey.startsWith('L') ? 0.72 : 0.78;
    const scale = Math.min((CELL_W * factor) / w, (CELL_H * factor) / h);
    slot.sp.scale.set(scale);
    slot.baseScale = scale;
    slot.box.alpha = 1;
    slot.box.scale.set(1);

    slot.aura.clear();
    if (style.aura) {
      if (symKey === 'VS') {
        slot.aura.circle(-12, -6, 38).fill({ color: 0x49d6ff, alpha: 0.25 });
        slot.aura.circle(12, 6, 38).fill({ color: 0xff6a1a, alpha: 0.25 });
      } else {
        slot.aura.circle(0, 0, 46).fill({ color: style.aura, alpha: style.alpha });
      }
    }
    slot.vsGroup.visible = (symKey === 'VS');
  }

  const reels = [];
  for (let c = 0; c < COLS; c++) {
    const colContainer = new PIXI.Container();
    colContainer.x = c * CELL_W;
    reelsClip.addChild(colContainer);
    reels.push({ col: c, container: colContainer, slots: [], dropping: false });
  }

  function refreshVSRings() {
    state.vsEnergyRings = reels.flatMap(r => r.slots.map(s => s.vsRing));
  }

  function populateInitialReels() {
    reels.forEach((reel, c) => {
      reel.container.removeChildren();
      reel.slots = [];
      for (let r = 0; r < ROWS; r++) {
        const slot = createSlot();
        slot.box.x = CELL_W / 2;
        slot.box.y = r * CELL_H + CELL_H / 2;
        fitSlot(slot, state.currentGrid[r][c]);
        reel.container.addChild(slot.box);
        reel.slots.push(slot);
      }
    });
    refreshVSRings();
  }

  // --- EFEKT SİSTEMLERİ ---
  function triggerShake(magnitude = 9, durationMs = 300) {
    state.shakeMag = Math.max(state.shakeMag, magnitude);
    state.shakeTime = Math.max(state.shakeTime, durationMs);
    state.shakeDuration = Math.max(state.shakeDuration, durationMs);
  }

  function triggerFlash(alpha = 0.45) {
    flashOverlay.alpha = Math.max(flashOverlay.alpha, alpha);
  }

  function spawnShockwave(x, y, color = 0xffae34, maxR = 165) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    fxLayer.addChild(g);
    state.rings.push({ gfx: g, r: 16, maxR, color, life: 1 });
  }

  function spawnSteamPuff(x, y, vx = 0, vy = -1.1) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, 18).fill({ color: 0xdce8f8, alpha: 0.2 });
    g.position.set(x, y);
    steamLayer.addChild(g);
    state.steamPuffs.push({ gfx: g, vx, vy, scale: 0.6, life: 1 });
  }

  function spawnBurst(x, y, count = 28, colors = [0xfff1bf, 0xf6d379, 0xff7b29, 0xffffff]) {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      const size = 2.2 + Math.random() * 4.8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      if (Math.random() < 0.48) g.rect(-size, -size * 0.42, size * 2, size * 0.84).fill({ color });
      else g.circle(0, 0, size).fill({ color });
      g.position.set(x, y);
      g.rotation = Math.random() * Math.PI * 2;
      fxLayer.addChild(g);
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.8 + Math.random() * 10;
      state.particles.push({
        gfx: g, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 2.6,
        vr: (Math.random() - 0.5) * 0.25, gravity: 0.24, life: 1, decay: 0.017 + Math.random() * 0.02
      });
    }
  }

  function spawnFloatingWin(text, x, y) {
    const t = new PIXI.Text({
      text,
      style: {
        fontFamily: 'Cinzel', fontSize: 38, fontWeight: '900',
        fill: 0xfff4c8, stroke: { color: 0x3b1803, width: 7 },
        dropShadow: { color: 0xff6a1a, blur: 14, distance: 0, alpha: 0.95 }
      }
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.45);
    fxLayer.addChild(t);
    state.floatingTexts.push({ txt: t, life: 1, vy: -0.7 });
  }

  // --- ANA PIXI TICKER ---
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const ms = ticker.deltaMS;
    state.pulseTime += ms * 0.005;

    const anyActive = reels.some(r => r.dropping);
    const gearSpd = anyActive ? (state.inBonus ? 0.048 : 0.034) : (state.inBonus ? 0.013 : 0.004);
    state.gears.forEach((g) => {
      g.gfx.rotation += g.dir * gearSpd * dt;
      g.gfx.tint = state.inBonus ? 0xffb67a : 0xffffff;
    });

    if (Math.random() < (state.inBonus ? 0.045 : 0.015)) {
      const leftSide = Math.random() < 0.5;
      spawnSteamPuff(leftSide ? BOARD_X - 18 : BOARD_X + BOARD_W + 18, BOARD_Y + 60 + Math.random() * (BOARD_H - 120), leftSide ? -0.9 : 0.9, -1.1);
    }

    state.vsEnergyRings.forEach((ring) => {
      if (ring && !ring.destroyed) ring.rotation += 0.055 * dt;
    });

    // Aktif VS sütunlarında sürekli akan kenar enerjisi & yaşayan çarpan nabzı
    state.activeVsColumns.forEach((vs) => {
      if (vs.ringGfx && !vs.ringGfx.destroyed) vs.ringGfx.rotation += 0.025 * dt;
      if (vs.multTxt && !vs.multTxt.destroyed) {
        const s = 1.0 + Math.sin(state.pulseTime * 2.2) * 0.055;
        vs.multTxt.scale.set(s);
      }
      if (vs.edgeGfx && !vs.edgeGfx.destroyed && Math.random() < 0.35) {
        vs.edgeGfx.clear();
        const edgeX = Math.random() < 0.5 ? 8 : CELL_W - 8;
        const y0 = 24 + Math.random() * (BOARD_H - 120);
        vs.edgeGfx.moveTo(edgeX, y0);
        for (let k = 1; k <= 4; k++) {
          vs.edgeGfx.lineTo(edgeX + (Math.random() - 0.5) * 14, y0 + k * 20);
        }
        vs.edgeGfx.stroke({ width: 2.5, color: vs.accent, alpha: 0.85 });
      }
    });

    boardGlow.clear();
    const glowAlpha = state.inBonus ? 0.24 + Math.sin(state.pulseTime * 1.8) * 0.1 : 0.08 + Math.sin(state.pulseTime * 0.9) * 0.03;
    boardGlow.roundRect(BOARD_X - 26, BOARD_Y - 26, BOARD_W + 52, BOARD_H + 52, 24)
      .fill({ color: state.inBonus ? 0xff6a1a : 0xc89336, alpha: glowAlpha });

    if (state.winningSlots.length) {
      const p = 1.06 + Math.sin(state.pulseTime * 2.4) * 0.05;
      state.winningSlots.forEach((slot) => slot.box.scale.set(p));
    }

    state.zoom += (state.targetZoom - state.zoom) * 0.1 * dt;
    root.scale.set(state.zoom);

    let sx = 0, sy = 0;
    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - ms);
      const ratio = state.shakeTime / Math.max(1, state.shakeDuration);
      sx = (Math.random() - 0.5) * 2 * state.shakeMag * ratio;
      sy = (Math.random() - 0.5) * 2 * state.shakeMag * ratio;
      if (state.shakeTime === 0) state.shakeMag = 0;
    }
    root.position.set(STAGE_W / 2 + sx, STAGE_H / 2 + sy);

    if (flashOverlay.alpha > 0.005) flashOverlay.alpha = Math.max(0, flashOverlay.alpha - 0.045 * dt);
    else flashOverlay.alpha = 0;

    for (let i = state.steamPuffs.length - 1; i >= 0; i--) {
      const st = state.steamPuffs[i];
      st.gfx.x += st.vx * dt;
      st.gfx.y += st.vy * dt;
      st.scale += 0.03 * dt;
      st.gfx.scale.set(st.scale);
      st.life -= 0.018 * dt;
      st.gfx.alpha = Math.max(0, st.life * 0.5);
      if (st.life <= 0) { steamLayer.removeChild(st.gfx); st.gfx.destroy(); state.steamPuffs.splice(i, 1); }
    }

    for (let i = state.rings.length - 1; i >= 0; i--) {
      const rg = state.rings[i];
      rg.r += (rg.maxR - rg.r) * 0.16 * dt;
      rg.life -= 0.045 * dt;
      rg.gfx.clear();
      if (rg.life > 0) rg.gfx.circle(0, 0, rg.r).stroke({ width: 6 * rg.life, color: rg.color, alpha: rg.life });
      else { fxLayer.removeChild(rg.gfx); rg.gfx.destroy(); state.rings.splice(i, 1); }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.vx *= 0.982;
      p.vy += p.gravity * dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.gfx.rotation += (p.vr || 0) * dt;
      p.life -= p.decay * dt;
      p.gfx.alpha = Math.max(0, p.life);
      if (p.life <= 0) { fxLayer.removeChild(p.gfx); p.gfx.destroy(); state.particles.splice(i, 1); }
    }

    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.txt.y += ft.vy * dt;
      const targetScale = ft.life > 0.78 ? 1.1 : 1.0;
      ft.txt.scale.x += (targetScale - ft.txt.scale.x) * 0.2 * dt;
      ft.txt.scale.y = ft.txt.scale.x;
      ft.life -= 0.016 * dt;
      ft.txt.alpha = Math.min(1, ft.life * 2.2);
      if (ft.life <= 0) { fxLayer.removeChild(ft.txt); ft.txt.destroy(); state.floatingTexts.splice(i, 1); }
    }

    if (state.inBonus && Math.random() < 0.28) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 1.8 + Math.random() * 2.5).fill({ color: Math.random() < 0.55 ? 0xff7b29 : 0xfff1bf });
      g.position.set(Math.random() * STAGE_W, STAGE_H + 6);
      fxLayer.addChild(g);
      state.particles.push({ gfx: g, vx: (Math.random() - 0.5) * 1.4, vy: -(1.7 + Math.random() * 2.5), vr: 0, gravity: -0.012, life: 0.95, decay: 0.008 });
    }
  });

  function clearRoundVisuals() {
    state.cycleToken++;
    teaseLayer.removeChildren();
    vsBannerLayer.removeChildren();
    vsForegroundLayer.removeChildren();
    winFrameLayer.removeChildren();
    lineLayer.removeChildren();
    lineBadgeLayer.removeChildren();
    state.activeVsColumns = [];
    state.winningSlots = [];
    state.targetZoom = 1.0;
    $('win-banner').classList.add('hidden');
    $('vs-total-banner').classList.add('hidden');
    $('retrigger-banner').classList.add('hidden');
    reels.forEach(r => r.slots.forEach((slot) => {
      slot.box.alpha = 1;
      slot.box.scale.set(1);
    }));
  }

  function showTeaseColumn(col) {
    teaseLayer.removeChildren();
    const g = new PIXI.Graphics();
    g.roundRect(col * CELL_W + 2, 2, CELL_W - 4, BOARD_H - 4, 12)
      .fill({ color: 0xff5a12, alpha: 0.22 })
      .stroke({ width: 6, color: 0xff9a2e, alpha: 0.95 });
    g.roundRect(col * CELL_W + 8, 8, CELL_W - 16, BOARD_H - 16, 8)
      .stroke({ width: 2.5, color: 0xfff2c2, alpha: 0.85 });
    teaseLayer.addChild(g);
    state.targetZoom = 1.036;
    spawnBurst(BOARD_X + col * CELL_W + CELL_W / 2, BOARD_Y + BOARD_H - 14, 18, [0xff6a1a, 0xfff1bf]);
  }

  // --- FORMÜL A: SIKI DALGA DÜŞÜŞÜ (TAHTA ASLA BOŞ KALMAZ, ~0.85 SN TOK RİTİM) ---
  async function animateColumnWave(col, grid, scBefore, teaseHoldMs = 0) {
    const reel = reels[col];
    reel.dropping = true;

    const oldSlots = [...reel.slots];
    const oldStartYs = oldSlots.map(s => s.box.y);

    // 1. Eski semboller aşağı akarken, yeni semboller hemen peşinden iner
    const exitDur = state.turbo || state.quickStop ? 110 : 175;
    const exitPromise = new Promise((resolve) => {
      if (!oldSlots.length) return resolve();
      let elapsed = 0;
      let last = performance.now();
      function tick(now) {
        if (!state.paused) elapsed += Math.min(80, now - last);
        last = now;
        const p = Math.min(1, elapsed / exitDur);
        const easeIn = p * p * 1.12;
        oldSlots.forEach((slot, r) => {
          slot.box.y = oldStartYs[r] + easeIn * (BOARD_H + CELL_H * 0.9);
          slot.box.alpha = Math.max(0.15, 1 - p * 0.85);
        });
        if (p >= 1) {
          oldSlots.forEach(s => {
            if (s.box.parent) s.box.parent.removeChild(s.box);
            s.box.destroy({ children: true });
          });
          return resolve();
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    if (teaseHoldMs > 0) {
      await exitPromise;
      let waited = 0;
      while (!state.quickStop && waited < teaseHoldMs) {
        await gameSleep(35);
        waited += 35;
      }
    } else {
      // Sıkı örtüşme: eski sütun daha yarısına gelmeden yeni sütun üstten girer
      await gameSleep(state.turbo || state.quickStop ? 28 : 52);
    }

    let colHasSC = false;
    let colHasVS = false;
    let scRow = 1;
    let vsRow = 1;
    const newSlots = [];
    const targetYs = [];
    const startYs = [];

    for (let r = 0; r < ROWS; r++) {
      const sym = grid[r][col];
      if (sym === 'SC') { colHasSC = true; scRow = r; }
      if (sym === 'VS') { colHasVS = true; vsRow = r; }
      const slot = createSlot();
      const targetY = r * CELL_H + CELL_H / 2;
      const startY = targetY - (BOARD_H + 56);
      slot.box.x = CELL_W / 2;
      slot.box.y = startY;
      fitSlot(slot, sym);
      reel.container.addChild(slot.box);
      newSlots.push(slot);
      targetYs.push(targetY);
      startYs.push(startY);
    }
    reel.slots = newSlots;
    refreshVSRings();

    const dropDur = state.turbo || state.quickStop ? 150 : 255;
    let elapsed = 0;
    let last = performance.now();
    let landedSfx = false;

    await new Promise((resolve) => {
      function tick(now) {
        if (!state.paused) elapsed += Math.min(80, now - last);
        last = now;
        const p = Math.min(1, elapsed / dropDur);
        const c1 = 1.15;
        const c3 = c1 + 1;
        const eased = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);

        newSlots.forEach((slot, r) => {
          slot.box.y = startYs[r] + (targetYs[r] - startYs[r]) * eased;
        });

        if (!landedSfx && p >= 0.78) {
          landedSfx = true;
          AUDIO.playSfx('stop', { volume: 1.0, rate: 0.94 + col * 0.032 });
        }
        if (p >= 1) return resolve();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    newSlots.forEach((slot, r) => { slot.box.y = targetYs[r]; });
    await exitPromise;
    reel.dropping = false;

    if (colHasSC) {
      const pitch = scBefore === 0 ? 1.0 : scBefore === 1 ? 1.16 : 1.34;
      AUDIO.playSfx('scatter_land', { volume: 1.0, rate: pitch });
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + scRow * CELL_H + CELL_H / 2;
      spawnShockwave(cx, cy, 0xffae34, 125);
      spawnBurst(cx, cy, 28, [0xfff1bf, 0xff7b29, 0x49d6ff]);
      triggerShake(6, 180);
    }
    if (colHasVS) {
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + vsRow * CELL_H + CELL_H / 2;
      spawnShockwave(cx, cy, 0x49d6ff, 120);
      spawnBurst(cx, cy, 24, [0x49d6ff, 0xff6a1a, 0xfff1bf]);
    }
    return colHasSC;
  }

  // --- YENİ SİNEMATİK VS DÜELLO (SİYAH KUTU YOK, KAYAN KAZANAN, CANLI ENERJİ) ---
  async function playVSDuels(vsReels) {
    const cols = Object.keys(vsReels).map(Number).sort((a, b) => a - b);
    if (!cols.length) return;

    AUDIO.duckMusic(true);
    state.targetZoom = 1.028;

    for (const col of cols) {
      const info = vsReels[String(col)];
      const isBlueWin = (info.left !== info.right) ? (info.winMult === info.left) : (col % 2 === 0);
      const winAccent = isBlueWin ? 0x49d6ff : 0xff9436;

      // Arka katman (Banner) & Ön katman (Çarpan + WILD REEL, çizgilerin ÜSTÜNDE)
      const bgColBox = new PIXI.Container();
      bgColBox.x = col * CELL_W;
      vsBannerLayer.addChild(bgColBox);

      const fgColBox = new PIXI.Container();
      fgColBox.x = col * CELL_W;
      vsForegroundLayer.addChild(fgColBox);

      const centerX = BOARD_X + col * CELL_W + CELL_W / 2;
      const centerY = BOARD_Y + BOARD_H / 2;

      // 1. Afiş açılışı
      AUDIO.playSfx('vs_expand', { volume: 1.0 });
      spawnSteamPuff(centerX - 30, centerY, -1.4, -0.6);
      spawnSteamPuff(centerX + 30, centerY, 1.4, -0.6);
      spawnBurst(centerX, centerY, 26, [0x49d6ff, 0xff7b29, 0xfff1bf]);

      const bannerWrap = new PIXI.Container();
      bannerWrap.pivot.set(CELL_W / 2, BOARD_H / 2);
      bannerWrap.position.set(CELL_W / 2, BOARD_H / 2);
      bannerWrap.scale.y = 0.06;
      bgColBox.addChild(bannerWrap);

      if (state.textures.vs_banner) {
        const bannerSp = new PIXI.Sprite(state.textures.vs_banner);
        bannerSp.position.set(5, 5);
        bannerSp.width = CELL_W - 10;
        bannerSp.height = BOARD_H - 10;
        bannerWrap.addChild(bannerSp);
      } else {
        const fb = new PIXI.Graphics();
        fb.roundRect(5, 5, CELL_W - 10, BOARD_H - 10, 10).fill({ color: 0x1a1410, alpha: 0.96 });
        bannerWrap.addChild(fb);
      }

      const borderGfx = new PIXI.Graphics();
      borderGfx.roundRect(5, 5, CELL_W - 10, BOARD_H - 10, 10).stroke({ width: 4.5, color: 0xf6d379 });
      bannerWrap.addChild(borderGfx);

      const unrollSteps = state.turbo ? 6 : 10;
      for (let f = 1; f <= unrollSteps; f++) {
        const p = f / unrollSteps;
        bannerWrap.scale.y = 0.06 + 0.94 * (1 - Math.pow(1 - p, 3));
        await gameSleep(18);
      }
      bannerWrap.scale.y = 1;

      // 2. İki Savaşçı Çarpanı
      const topTxt = new PIXI.Text({
        text: `${info.left}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 54, fontWeight: '900', fill: 0xa6f4ff,
          stroke: { color: 0x031528, width: 8 },
          dropShadow: { color: 0x49d6ff, blur: 18, distance: 0, alpha: 1 }
        }
      });
      topTxt.anchor.set(0.5);
      topTxt.position.set(CELL_W / 2, BOARD_H * 0.22);

      const botTxt = new PIXI.Text({
        text: `${info.right}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 54, fontWeight: '900', fill: 0xffcc85,
          stroke: { color: 0x2e0b02, width: 8 },
          dropShadow: { color: 0xff6a1a, blur: 18, distance: 0, alpha: 1 }
        }
      });
      botTxt.anchor.set(0.5);
      botTxt.position.set(CELL_W / 2, BOARD_H * 0.78);

      const emblem = new PIXI.Sprite(state.textures.VS || PIXI.Texture.EMPTY);
      emblem.anchor.set(0.5);
      const es = Math.min(114 / (emblem.texture.width || 512), 114 / (emblem.texture.height || 512));
      emblem.scale.set(es);
      emblem.position.set(CELL_W / 2, BOARD_H / 2);

      const sparkArc = new PIXI.Graphics();
      fgColBox.addChild(topTxt, botTxt, emblem, sparkArc);

      const tensionSteps = state.turbo ? 6 : 14;
      for (let s = 0; s < tensionSteps; s++) {
        const j = (s / tensionSteps) * 6;
        emblem.x = CELL_W / 2 + (Math.random() - 0.5) * j * 2;
        emblem.rotation = (Math.random() - 0.5) * 0.14;
        topTxt.scale.set(1 + (s % 2 === 0 ? 0.1 : -0.04));
        botTxt.scale.set(1 + (s % 2 === 1 ? 0.1 : -0.04));

        sparkArc.clear();
        sparkArc.moveTo(12, BOARD_H / 2);
        for (let seg = 1; seg <= 5; seg++) {
          sparkArc.lineTo(12 + (CELL_W - 24) * (seg / 5), BOARD_H / 2 + (Math.random() - 0.5) * 28);
        }
        sparkArc.stroke({ width: 3.2, color: s % 2 === 0 ? 0x9cf3ff : 0xffb36b, alpha: 0.95 });
        await gameSleep(30);
      }

      // 3. Çapraz Kılıç Kesiği + Flash + Şok Dalgası
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
      fgColBox.addChild(slash);

      // 4. KAYBEDEN PARÇALANIP SÖNERKEN KAZANAN ÇARPAN MERKEZE KAYAR
      const winnerTxt = isBlueWin ? topTxt : botTxt;
      const loserTxt = isBlueWin ? botTxt : topTxt;
      const loserY = BOARD_Y + loserTxt.y;
      spawnBurst(centerX, loserY, 30, [0x99aacc, 0x556677, 0xfff1bf]);

      const winStartY = winnerTxt.y;
      const winTargetY = BOARD_H * 0.50;
      const glideFrames = state.turbo ? 8 : 13;

      for (let f = 1; f <= glideFrames; f++) {
        const t = f / glideFrames;
        const ease = 1 - Math.pow(1 - t, 3);
        slash.alpha = Math.max(0, 1 - t * 1.4);
        emblem.alpha = Math.max(0, 1 - t * 1.8);
        sparkArc.alpha = Math.max(0, 1 - t * 2);

        loserTxt.alpha = Math.max(0, 1 - t * 1.6);
        loserTxt.scale.set(1 - t * 0.55);
        loserTxt.x = CELL_W / 2 + (Math.random() - 0.5) * 14 * (1 - t);

        winnerTxt.y = winStartY + (winTargetY - winStartY) * ease;
        const popScale = t < 0.7 ? (1 + 0.52 * (t / 0.7)) : (1.52 - 0.30 * ((t - 0.7) / 0.3));
        winnerTxt.scale.set(popScale);
        await gameSleep(18);
      }

      fgColBox.removeChild(loserTxt, emblem, sparkArc, slash);
      loserTxt.destroy(); emblem.destroy(); sparkArc.destroy(); slash.destroy();

      // Kazanan tarafın şeffaf enerji halesi (SİYAH DAİRE / KUTU YOK!)
      const wash = new PIXI.Graphics();
      wash.roundRect(6, 6, CELL_W - 12, BOARD_H - 12, 10)
        .fill({ color: isBlueWin ? 0x052440 : 0x3b1202, alpha: 0.34 })
        .stroke({ width: 3.5, color: winAccent, alpha: 0.9 });
      bannerWrap.addChild(wash);

      // Dönen saf enerji halkaları (şeffaf, arkasından vs_banner görünür)
      const energyRings = new PIXI.Graphics();
      energyRings.position.set(CELL_W / 2, winTargetY);
      energyRings.circle(0, 0, 56).fill({ color: winAccent, alpha: 0.16 });
      energyRings.arc(0, 0, 58, -Math.PI * 0.75, -Math.PI * 0.1).stroke({ width: 3.5, color: 0xfff1bf, alpha: 0.92, cap: 'round' });
      energyRings.arc(0, 0, 58, Math.PI * 0.25, Math.PI * 0.9).stroke({ width: 3.5, color: winAccent, alpha: 0.95, cap: 'round' });
      energyRings.circle(0, 0, 48).stroke({ width: 1.5, color: 0xf6d379, alpha: 0.65 });
      fgColBox.addChildAt(energyRings, 0);

      // Çarpan stili altın/parlak netliğe oturur
      winnerTxt.style = new PIXI.TextStyle({
        fontFamily: 'Cinzel', fontSize: 64, fontWeight: '900', fill: 0xffffff,
        stroke: { color: isBlueWin ? 0x052745 : 0x5c1d02, width: 9 },
        dropShadow: { color: winAccent, blur: 22, distance: 0, alpha: 1 }
      });
      winnerTxt.position.set(CELL_W / 2, winTargetY);
      winnerTxt.scale.set(1);

      // Kutusuz, yüksek kontrastlı dövme altın WILD REEL yazısı
      const wildTxt = new PIXI.Text({
        text: 'WILD REEL',
        style: {
          fontFamily: 'Cinzel', fontSize: 19, fontWeight: '900', fill: 0xfff1bf, letterSpacing: 2.5,
          stroke: { color: 0x1a0b03, width: 6 },
          dropShadow: { color: winAccent, blur: 12, distance: 0, alpha: 0.95 }
        }
      });
      wildTxt.anchor.set(0.5);
      wildTxt.position.set(CELL_W / 2, winTargetY - 68);
      fgColBox.addChild(wildTxt);

      const edgeGfx = new PIXI.Graphics();
      fgColBox.addChild(edgeGfx);
      state.activeVsColumns.push({ ringGfx: energyRings, multTxt: winnerTxt, edgeGfx, accent: winAccent });

      spawnShockwave(centerX, centerY, winAccent, 140);
      await gameSleep(state.turbo ? 180 : 380);
    }

    // 2+ VS aynı turda açıldıysa toplam çarpan vurgusu (ör: 4× + 10× = 14×)
    if (cols.length >= 2) {
      const mults = cols.map(c => vsReels[String(c)].winMult);
      const totalM = mults.reduce((a, b) => a + b, 0);
      $('vs-total-text').textContent = `${mults.map(m => `${m}×`).join(' + ')} = ${totalM}×`;
      $('vs-total-banner').classList.remove('hidden');
      AUDIO.playSfx('bonus_trigger', { volume: 0.85, rate: 1.12 });
      spawnBurst(STAGE_W / 2, STAGE_H / 2, 42, [0xfff1bf, 0xff7b29, 0x49d6ff]);
      await gameSleep(state.turbo ? 420 : 880);
      $('vs-total-banner').classList.add('hidden');
    }

    state.targetZoom = 1.0;
    AUDIO.duckMusic(false);
  }

  // --- ÖDEME ÇİZGİLERİ (ÇİFT METİN ÇAKIŞMASI KALDIRILDI) ---
  function renderWinSubset(winList, bet, showSingleBadge = false) {
    winFrameLayer.removeChildren();
    lineLayer.removeChildren();
    lineBadgeLayer.removeChildren();

    const hitCells = new Set();
    winList.forEach((w) => {
      const line = PAYLINES[w.line];
      for (let c = 0; c < w.count; c++) hitCells.add(`${c}_${line[c]}`);
    });

    state.winningSlots = [];
    reels.forEach((reel, c) => {
      reel.slots.forEach((slot, r) => {
        const isHit = hitCells.has(`${c}_${r}`);
        slot.box.alpha = isHit ? 1.0 : 0.34;
        if (isHit) state.winningSlots.push(slot);
        else slot.box.scale.set(1);
      });
    });

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

    const glowW = showSingleBadge ? 10 : 6;
    const coreW = showSingleBadge ? 3.5 : 2.1;

    winList.forEach((w) => {
      const line = PAYLINES[w.line];
      const color = LINE_COLORS[w.line % LINE_COLORS.length];
      const g = new PIXI.Graphics();
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: glowW, color, alpha: showSingleBadge ? 0.55 : 0.28, join: 'round', cap: 'round' });
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: coreW, color: 0xfff8dc, alpha: showSingleBadge ? 0.96 : 0.7, join: 'round', cap: 'round' });
      if (showSingleBadge) {
        for (let c = 0; c < w.count; c++) {
          g.circle(c * CELL_W + CELL_W / 2, line[c] * CELL_H + CELL_H / 2, 5)
            .fill({ color: 0xffffff }).stroke({ width: 2, color });
        }
      }
      lineLayer.addChild(g);
    });

    if (showSingleBadge && winList.length === 1) {
      const w = winList[0];
      const line = PAYLINES[w.line];
      const midCol = Math.min(2, Math.floor((w.count - 1) / 2));
      const bx = midCol * CELL_W + CELL_W / 2;
      const by = line[midCol] * CELL_H + CELL_H / 2;

      const labelTxt = new PIXI.Text({
        text: `+${RGS.formatMoney(w.win * bet)}`,
        style: {
          fontFamily: 'Cinzel', fontSize: 22, fontWeight: '900',
          fill: 0xfff4c8, stroke: { color: 0x3b1803, width: 5 },
          dropShadow: { color: 0xff6a1a, blur: 10, distance: 0 }
        }
      });
      labelTxt.anchor.set(0.5);
      const pw = Math.max(96, labelTxt.width + 28);
      const pill = new PIXI.Graphics();
      pill.roundRect(-pw / 2, -18, pw, 36, 18)
        .fill({ color: 0x1c0f05, alpha: 0.92 })
        .stroke({ width: 2.2, color: 0xf6d379 });
      const badge = new PIXI.Container();
      badge.position.set(Math.max(pw / 2 + 8, Math.min(BOARD_W - pw / 2 - 8, bx)), Math.max(26, by));
      badge.addChild(pill, labelTxt);
      lineBadgeLayer.addChild(badge);
    }
  }

  async function startIdleWinCycle(wins, bet, token) {
    if (wins.length <= 1) return;
    let idx = 0;
    while (state.cycleToken === token && !state.spinning) {
      renderWinSubset([wins[idx]], bet, true);
      idx = (idx + 1) % wins.length;
      await gameSleep(1200);
    }
  }

  async function showWinLines(wins, winMoney, bet, allowIdleCycle = false) {
    if (!wins.length || winMoney <= 0) return;

    AUDIO.playSfx('win', { volume: 1.0 });
    $('win-banner-amount').textContent = RGS.formatMoney(winMoney);
    $('win-banner').classList.remove('hidden');

    renderWinSubset(wins, bet, wins.length === 1);
    // Tek çizgi kazancında rozet zaten tutarı gösterdiği için çift uçan metin üretme!
    if (wins.length > 1) {
      spawnFloatingWin(`+${RGS.formatMoney(winMoney)}`, STAGE_W / 2, STAGE_H / 2);
    }
    spawnBurst(STAGE_W / 2, STAGE_H / 2, 24, [0xfff1bf, 0xf6d379, 0xff7b29]);

    state.skipWin = false;
    const waitTotal = state.turbo ? 420 : 960;
    let waited = 0;
    while (!state.skipWin && waited < waitTotal) {
      await gameSleep(40);
      waited += 40;
    }

    if (allowIdleCycle && wins.length > 1 && !state.skipWin) {
      startIdleWinCycle(wins, bet, state.cycleToken);
    }
  }

  // --- ÖN KATMAN 3D ALTIN SİKKE YAĞMURU ---
  function getWinTier(mult) {
    if (mult >= 12500) return 'MAX WIN!';
    if (mult >= 60) return 'EPIC WIN';
    if (mult >= 30) return 'MEGA WIN';
    return 'BIG WIN';
  }

  function createCoinRainController() {
    const canvas = $('bigwin-fx-canvas');
    const ctx = canvas.getContext('2d');
    const coins = [];
    const sparks = [];
    let running = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(count = 16) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (let i = 0; i < count; i++) {
        coins.push({
          x: w * (0.15 + Math.random() * 0.7),
          y: h + 20 + Math.random() * 40,
          vx: (Math.random() - 0.5) * 9,
          vy: -(11 + Math.random() * 9.5),
          r: 12 + Math.random() * 7,
          spin: Math.random() * Math.PI * 2,
          spinSpd: 0.14 + Math.random() * 0.16,
          rot: (Math.random() - 0.5) * 0.08,
          angle: Math.random() * Math.PI
        });
      }
      for (let j = 0; j < count; j++) {
        sparks.push({
          x: w * 0.5 + (Math.random() - 0.5) * 260,
          y: h * 0.5 + (Math.random() - 0.5) * 140,
          vx: (Math.random() - 0.5) * 11,
          vy: (Math.random() - 0.5) * 11 - 2,
          life: 1,
          size: 2.5 + Math.random() * 3.5
        });
      }
    }

    function loop() {
      if (!running) return;
      requestAnimationFrame(loop);
      if (state.paused) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.vy += 0.34;
        c.x += c.vx;
        c.y += c.vy;
        c.spin += c.spinSpd;
        c.angle += c.rot;

        const sx = Math.cos(c.spin);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);
        ctx.scale(Math.max(0.14, Math.abs(sx)), 1);

        const grad = ctx.createRadialGradient(-c.r * 0.3, -c.r * 0.3, 1, 0, 0, c.r);
        grad.addColorStop(0, '#fff7cf');
        grad.addColorStop(0.55, '#f2b738');
        grad.addColorStop(1, '#9e5c0c');
        ctx.beginPath();
        ctx.arc(0, 0, c.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff0b3';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, c.r * 0.62, 0, Math.PI * 2);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(120, 62, 6, 0.75)';
        ctx.stroke();
        ctx.restore();

        if (c.y > h + 60) coins.splice(i, 1);
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.96;
        s.vy += 0.16;
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.024;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.life > 0.5 ? '#fff3c4' : '#ff7b29';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    return {
      start() { resize(); coins.length = 0; sparks.length = 0; running = true; spawn(28); requestAnimationFrame(loop); },
      burst(n = 14) { spawn(n); },
      stop() { running = false; coins.length = 0; sparks.length = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    };
  }
  const coinRain = createCoinRainController();

  async function showBigWinIfNeeded(totalWinMoney, bet) {
    const finalMult = totalWinMoney / bet;
    if (finalMult < 15) return;

    const overlay = $('bigwin-overlay');
    const tierEl = $('bigwin-tier');
    const amountEl = $('bigwin-amount');
    const multEl = $('bigwin-mult');

    let shownTier = 'BIG WIN';
    tierEl.textContent = shownTier;
    amountEl.textContent = RGS.formatMoney(0);
    multEl.textContent = '0×';
    overlay.classList.remove('hidden');

    AUDIO.duckMusic(true);
    AUDIO.playSfx('big_win', { volume: 1.0 });
    const counterSfx = AUDIO.playSfx('countup_loop', { volume: 1.0, loop: true });
    coinRain.start();

    let skipped = false;
    const onSkip = () => { skipped = true; };
    const onKeySkip = (e) => { if (e.code === 'Space') skipped = true; };
    overlay.addEventListener('click', onSkip, { once: true });
    window.addEventListener('keydown', onKeySkip);

    const duration = Math.min(5400, 2200 + finalMult * 22);
    let elapsed = 0;
    let lastBurst = 0;

    while (!skipped && elapsed < duration) {
      await gameSleep(32);
      elapsed += 32;
      const p = Math.min(1, elapsed / duration);
      const val = totalWinMoney * (1 - Math.pow(1 - p, 2.1));
      const curMult = val / bet;

      amountEl.textContent = RGS.formatMoney(val);
      multEl.textContent = `${Math.floor(curMult)}×`;

      const nextTier = getWinTier(curMult);
      if (nextTier !== shownTier) {
        shownTier = nextTier;
        tierEl.textContent = shownTier;
        tierEl.classList.remove('tier-pop');
        void tierEl.offsetWidth;
        tierEl.classList.add('tier-pop');
        AUDIO.playSfx('vs_clash', { volume: 0.9, rate: 1.15 });
        coinRain.burst(28);
      }

      if (elapsed - lastBurst >= 260) {
        lastBurst = elapsed;
        coinRain.burst(10);
      }
    }

    overlay.removeEventListener('click', onSkip);
    window.removeEventListener('keydown', onKeySkip);
    counterSfx.stop(60);
    AUDIO.playSfx('countup_end', { volume: 1.0 });

    tierEl.textContent = getWinTier(finalMult);
    amountEl.textContent = RGS.formatMoney(totalWinMoney);
    multEl.textContent = `${finalMult.toFixed(1)}×`;
    coinRain.burst(22);
    await gameSleep(skipped ? 640 : 1480);

    coinRain.stop();
    overlay.classList.add('hidden');
    AUDIO.duckMusic(false);
  }

  // --- TEK SPİN AKIŞI (FORMÜL A SIKI DALGA + GERİLİM + VS + RETRIGGER) ---
  async function runSingleSpinVisual(ev, bet, allowIdleCycle = false) {
    clearRoundVisuals();
    state.quickStop = false;

    AUDIO.playSfx('spin', { volume: 1.0 });
    spawnSteamPuff(BOARD_X - 14, BOARD_Y + BOARD_H * 0.5, -1.2, -1.2);
    spawnSteamPuff(BOARD_X + BOARD_W + 14, BOARD_Y + BOARD_H * 0.5, 1.2, -1.2);

    // Hangi sütunların 2-Scatter gerilimine gireceğini önceden hesapla
    const scBeforeCol = [];
    let scRun = 0;
    for (let c = 0; c < COLS; c++) {
      scBeforeCol.push(scRun);
      for (let r = 0; r < ROWS; r++) {
        if (ev.grid[r][c] === 'SC') { scRun++; break; }
      }
    }

    const firstTeaseCol = (!state.turbo && !state.quickStop)
      ? scBeforeCol.findIndex(cnt => cnt >= 2)
      : -1;
    const waveEndCol = firstTeaseCol >= 0 ? firstTeaseCol : COLS;
    const staggerMs = state.turbo ? 34 : 82;

    // 1. Örtüşen Sıkı Dalga (0 .. waveEndCol - 1)
    const wavePromises = [];
    for (let c = 0; c < waveEndCol; c++) {
      wavePromises.push(
        (async () => {
          if (c > 0 && !state.quickStop) await gameSleep(staggerMs * c);
          await animateColumnWave(c, ev.grid, scBeforeCol[c], 0);
        })()
      );
    }
    await Promise.all(wavePromises);

    // 2. 2 Scatter sonrası kalan sütunlar dramatik gerilimle tek tek iner
    let teaseSfx = null;
    if (firstTeaseCol >= 0) {
      for (let c = firstTeaseCol; c < COLS; c++) {
        if (!state.quickStop && !state.turbo) {
          showTeaseColumn(c);
          if (!teaseSfx) teaseSfx = AUDIO.playSfx('anticipation', { volume: 1.0, loop: true });
          await animateColumnWave(c, ev.grid, scBeforeCol[c], 680);
        } else {
          await animateColumnWave(c, ev.grid, scBeforeCol[c], 0);
        }
      }
    }

    if (teaseSfx) teaseSfx.stop(80);
    teaseLayer.removeChildren();
    state.targetZoom = 1.0;
    state.currentGrid = ev.grid;

    if (ev.vsReels && Object.keys(ev.vsReels).length > 0) {
      await gameSleep(state.turbo ? 100 : 220);
      await playVSDuels(ev.vsReels);
    }

    const spinWinMoney = +(ev.spinWin * bet).toFixed(8);
    if (spinWinMoney > 0) {
      await showWinLines(ev.wins || [], spinWinMoney, bet, allowIdleCycle);
    }

    if (ev.retriggerSpins && ev.retriggerSpins > 0) {
      AUDIO.playSfx('bonus_trigger', { volume: 1.0 });
      triggerFlash(0.42);
      triggerShake(10, 320);
      spawnBurst(STAGE_W / 2, STAGE_H / 2, 48, [0xfff1bf, 0xff7b29, 0x49d6ff]);
      $('retrigger-text').textContent = `+${ev.retriggerSpins} FREE SPINS`;
      $('retrigger-banner').classList.remove('hidden');
      await gameSleep(state.turbo ? 850 : 1550);
      $('retrigger-banner').classList.add('hidden');
    }

    return spinWinMoney;
  }

  function waitForButton(modalId, btnId) {
    return new Promise((resolve) => {
      const modal = $(modalId);
      const btn = $(btnId);
      modal.classList.remove('hidden');
      const handler = () => {
        AUDIO.playSfx('ui_click', { volume: 1.0 });
        modal.classList.add('hidden');
        resolve();
      };
      btn.addEventListener('click', handler, { once: true });
    });
  }

  async function playRoundEvents(result, bet) {
    const events = result.events || [];
    let runningWin = 0;
    let bonusEvents = events;

    const firstType = events[0]?.type;
    const hasBonus = events.length > 1 || firstType === 'buyTrigger' || firstType === 'bonusSpin';

    if (events.length && (firstType === 'spin' || firstType === 'buyTrigger')) {
      const allowCycle = !hasBonus && state.autoLeft === 0 && !RGS.isReplay;
      const baseWin = await runSingleSpinVisual(events[0], bet, allowCycle);
      runningWin = +(runningWin + baseWin).toFixed(8);
      syncMoneyUI(runningWin, true);
      bonusEvents = events.slice(1);
    }

    if (bonusEvents.length > 0) {
      state.autoLeft = 0;
      updateAutoUI();

      AUDIO.duckMusic(true);
      AUDIO.playSfx('bonus_trigger', { volume: 1.0 });
      triggerFlash(0.45);
      await gameSleep(550);
      await waitForButton('fs-intro-modal', 'btn-start-fs');
      AUDIO.duckMusic(false);

      setBonusTheme(true);
      state.displayedHudWin = runningWin;

      for (let i = 0; i < bonusEvents.length; i++) {
        const ev = bonusEvents[i];
        const totalDisplay = ev.totalSpins || bonusEvents.length;
        const leftDisplay = typeof ev.spinsLeft === 'number'
          ? (ev.spinsLeft + 1 - (ev.retriggerSpins || 0))
          : (bonusEvents.length - i);

        $('hud-spins').textContent = `${Math.max(1, leftDisplay)} / ${totalDisplay}`;
        $('hud-total-win').textContent = RGS.formatMoney(state.displayedHudWin);

        const fsWin = await runSingleSpinVisual(ev, bet, false);
        const prevWin = runningWin;
        runningWin = +(runningWin + fsWin).toFixed(8);
        animateMoney($('hud-total-win'), prevWin, runningWin, state.turbo ? 240 : 480);
        state.displayedHudWin = runningWin;

        if (ev.retriggerSpins > 0) {
          $('hud-spins').textContent = `${ev.spinsLeft} / ${ev.totalSpins}`;
        }
        syncMoneyUI(runningWin, true);

        if (fsWin >= bet * 15) {
          await showBigWinIfNeeded(fsWin, bet);
        }
        await gameSleep(state.turbo ? 190 : 460);
      }

      const totalBonusMoney = +(result.payoutMultiplier * bet).toFixed(8);
      $('fs-outro-amount').textContent = RGS.formatMoney(0);
      $('fs-outro-mult').textContent = `${result.payoutMultiplier.toFixed(2)}× ${RGS.isSocial ? 'PLAY' : 'BET'}`;
      $('fs-outro-modal').classList.remove('hidden');

      const cSfx = AUDIO.playSfx('countup_loop', { volume: 1.0, loop: true });
      const dur = totalBonusMoney > 0 ? 1550 : 80;
      let el = 0;
      while (el < dur) {
        await gameSleep(28);
        el += 28;
        $('fs-outro-amount').textContent = RGS.formatMoney(totalBonusMoney * Math.min(1, el / dur));
      }
      $('fs-outro-amount').textContent = RGS.formatMoney(totalBonusMoney);
      cSfx.stop(60);
      if (totalBonusMoney > 0) AUDIO.playSfx('countup_end', { volume: 1.0 });

      await waitForButton('fs-outro-modal', 'btn-end-fs');
      setBonusTheme(false);
    } else if (runningWin >= bet * 15) {
      await showBigWinIfNeeded(runningWin, bet);
    }

    if (!RGS.isReplay) {
      state.balance = result.balanceAfter;
      syncMoneyUI(+(result.payoutMultiplier * bet).toFixed(8), false);
      await RGS.endRound(result.payoutMultiplier);
    } else {
      syncMoneyUI(+(result.payoutMultiplier * bet).toFixed(8), false);
    }
  }

  async function runReplayRound() {
    if (!state.replayData || state.spinning) return;
    $('replay-again-bar').classList.add('hidden');
    state.spinning = true;
    syncMoneyUI(0, false);
    try {
      await playRoundEvents(state.replayData, state.replayData.betAmount || 1.0);
    } finally {
      state.spinning = false;
      $('replay-again-bar').classList.remove('hidden');
    }
  }

  async function executeRound(mode = 'base') {
    if (RGS.isReplay) return;
    if (state.spinning) {
      state.quickStop = true;
      state.skipWin = true;
      return;
    }

    const bet = currentBet();
    const cost = mode === 'bonus' ? bet * 100 : bet;
    if (state.balance < cost) {
      state.autoLeft = 0;
      updateAutoUI();
      showToast('INSUFFICIENT BALANCE');
      return;
    }

    state.spinning = true;
    setSpinVisual(true);
    state.balance = +(state.balance - cost).toFixed(8);
    syncMoneyUI(0, false);

    try {
      const result = await RGS.play(bet, mode);
      await playRoundEvents(result, bet);
    } catch (err) {
      showToast(err.message || 'CONNECTION ERROR');
      state.autoLeft = 0;
      updateAutoUI();
    } finally {
      state.spinning = false;
      setSpinVisual(false);
      syncMoneyUI();

      if (state.autoLeft > 0 && !state.inBonus) {
        state.autoLeft--;
        updateAutoUI();
        gameSleep(state.turbo ? 240 : 600).then(() => {
          if (!state.spinning && !state.inBonus) executeRound('base');
        });
      }
    }
  }

  function updateAutoUI() {
    const active = state.autoLeft > 0;
    $('btn-auto').classList.toggle('active', active);
    $('auto-count').classList.toggle('hidden', !active);
    $('auto-count').textContent = String(state.autoLeft);
  }

  function changeBet(delta) {
    if (state.spinning || state.inBonus || RGS.isReplay) return;
    const next = state.betIndex + delta;
    if (next >= 0 && next < RGS.betLevels.length) {
      state.betIndex = next;
      AUDIO.playSfx('ui_click', { volume: 1.0 });
      syncMoneyUI();
    }
  }

  function bindEvents() {
    $('btn-spin').addEventListener('click', () => {
      if (!state.spinning) AUDIO.playSfx('ui_click', { volume: 0.85 });
      executeRound('base');
    });

    $('btn-replay-again').addEventListener('click', () => {
      AUDIO.playSfx('ui_click', { volume: 1.0 });
      runReplayRound();
    });

    $('pixi-container').addEventListener('click', () => {
      if (state.spinning) {
        state.quickStop = true;
        state.skipWin = true;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && $('splash-screen').classList.contains('hidden') && $('studio-intro').classList.contains('hidden')) {
        if (!$('bigwin-overlay').classList.contains('hidden')) return;
        if (!$('buy-modal').classList.contains('hidden')) return;
        if (!$('info-modal').classList.contains('hidden')) return;
        e.preventDefault();
        if (RGS.isReplay) {
          if (state.spinning) { state.quickStop = true; state.skipWin = true; }
          else if (!$('replay-again-bar').classList.contains('hidden')) runReplayRound();
        } else {
          executeRound('base');
        }
      }
    });

    $('btn-bet-down').addEventListener('click', () => changeBet(-1));
    $('btn-bet-up').addEventListener('click', () => changeBet(1));
    $('btn-modal-bet-down').addEventListener('click', () => changeBet(-1));
    $('btn-modal-bet-up').addEventListener('click', () => changeBet(1));

    $('btn-turbo').addEventListener('click', () => {
      state.turbo = !state.turbo;
      $('btn-turbo').classList.toggle('active', state.turbo);
      AUDIO.playSfx('ui_click', { volume: 1.0 });
    });

    $('btn-sound').addEventListener('click', () => {
      const muted = AUDIO.toggleMute();
      $('btn-sound').classList.toggle('active', !muted);
      $('ico-sound-on').classList.toggle('hidden', muted);
      $('ico-sound-off').classList.toggle('hidden', !muted);
    });

    $('btn-info').addEventListener('click', () => {
      AUDIO.playSfx('ui_click', { volume: 1.0 });
      $('info-modal').classList.remove('hidden');
    });

    $('btn-buy-bonus').addEventListener('click', () => {
      if (state.spinning || state.inBonus || RGS.isReplay) return;
      AUDIO.playSfx('ui_click', { volume: 1.0 });
      syncMoneyUI();
      $('buy-modal').classList.remove('hidden');
    });

    $('btn-confirm-buy').addEventListener('click', () => {
      if (state.balance < currentBet() * 100) return;
      $('buy-modal').classList.add('hidden');
      AUDIO.playSfx('buy_bonus', { volume: 1.0 });
      executeRound('bonus');
    });

    $('btn-auto').addEventListener('click', () => {
      if (RGS.isReplay) return;
      AUDIO.playSfx('ui_click', { volume: 1.0 });
      if (state.autoLeft > 0) {
        state.autoLeft = 0;
        updateAutoUI();
        return;
      }
      $('auto-popover').classList.toggle('hidden');
    });

    document.querySelectorAll('.auto-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const count = Number(btn.dataset.spins);
        $('auto-popover').classList.add('hidden');
        AUDIO.playSfx('ui_click', { volume: 1.0 });
        state.autoLeft = count - 1;
        updateAutoUI();
        executeRound('base');
      });
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        AUDIO.playSfx('ui_click', { volume: 0.9 });
        $(btn.dataset.close).classList.add('hidden');
      });
    });
  }

  // --- KESİNTİSİZ STÜDYO JENERİĞİ (BITMEDEN KESİLMEZ, ALTTAKİ SPLASH HAZIR BEKLER) ---
  function playStudioIntro() {
    return new Promise((resolve) => {
      const wrap = $('studio-intro');
      const vid = $('studio-video');
      const fb = $('studio-fallback');
      let finished = false;
      let started = false;
      let endGuard = null;

      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(stallGuard);
        clearTimeout(endGuard);
        wrap.classList.add('fade-out');
        setTimeout(() => {
          try { vid.pause(); } catch (_) {}
          wrap.classList.add('hidden');
          resolve();
        }, 600);
      };

      const showFallback = () => {
        if (finished || started) return;
        vid.classList.add('hidden');
        fb.classList.remove('hidden');
        endGuard = setTimeout(done, 1900);
      };

      wrap.addEventListener('click', done, { once: true });
      vid.addEventListener('ended', done, { once: true });
      vid.addEventListener('error', showFallback, { once: true });
      vid.addEventListener('playing', () => {
        started = true;
        clearTimeout(stallGuard);
        const durMs = (Number.isFinite(vid.duration) && vid.duration > 1)
          ? Math.min(11000, vid.duration * 1000 + 800)
          : 9500;
        endGuard = setTimeout(done, durMs);
      }, { once: true });

      const stallGuard = setTimeout(showFallback, 3400);

      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(showFallback);
      }
    });
  }

  async function boot() {
    buildPaytableAndLines();
    bindEvents();

    if (RGS.isReplay) {
      document.body.classList.add('replay-mode');
      $('replay-badge').classList.remove('hidden');
    }

    const setLoad = (pct, label) => {
      $('load-fill').style.width = `${Math.round(pct)}%`;
      $('load-text').textContent = `${label} ${Math.round(pct)}%`;
    };

    const introDone = playStudioIntro();

    const loadAssets = (async () => {
      try {
        const auth = await RGS.authenticate();
        applySocialModeLabels();
        state.balance = auth.balance;
        state.pendingRound = auth.pendingRound || null;

        $('mode-badge').classList.toggle('hidden', auth.mode !== 'DEMO');
        const targetDef = auth.defaultBetLevel ?? 1.0;
        let defIdx = RGS.betLevels.findIndex(v => Math.abs(v - targetDef) < 0.00001);
        if (defIdx < 0) defIdx = RGS.betLevels.findIndex(v => v >= targetDef);
        state.betIndex = defIdx >= 0 ? defIdx : 0;

        if (RGS.isReplay) {
          state.replayData = await RGS.fetchReplayRound();
        }
        syncMoneyUI(0, false);
      } catch (err) {
        if (!RGS.isReplay) $('mode-badge').classList.remove('hidden');
        showToast(RGS.isReplay ? 'REPLAY LOAD ERROR' : 'RGS AUTH FAILED — DEMO FALLBACK');
      }

      const allTexKeys = [...SYMBOL_KEYS, ...EXTRA_TEXTURES];
      for (let i = 0; i < allTexKeys.length; i++) {
        const key = allTexKeys[i];
        try {
          state.textures[key] = await PIXI.Assets.load(`assets/img/${key}.png`);
        } catch (e) {
          console.warn(`[Img] Eksik: assets/img/${key}.png`);
          state.textures[key] = PIXI.Texture.EMPTY;
        }
        setLoad(((i + 1) / allTexKeys.length) * 90, 'LOADING FORGE');
      }

      populateInitialReels();
      resizeStage();
      setLoad(100, 'READY');
    })();

    await introDone;
    await loadAssets;

    $('load-wrap').classList.add('hidden');
    $('btn-splash-play').textContent = RGS.isReplay ? 'PRESS TO WATCH REPLAY!' : 'PRESS TO CONTINUE!';
    $('btn-splash-play').classList.remove('hidden');

    let entered = false;
    const enterGame = async () => {
      if (entered) return;
      entered = true;
      $('btn-splash-play').textContent = 'ENTERING...';
      AUDIO.ensureContext();
      AUDIO.playMusic('base');
      await AUDIO.preload();
      AUDIO.playSfx('ui_click', { volume: 1.0 });

      $('splash-screen').classList.add('fade-out');
      setTimeout(() => $('splash-screen').classList.add('hidden'), 520);
      resizeStage();

      if (RGS.isReplay) {
        await runReplayRound();
        return;
      }

      if (state.pendingRound) {
        const pr = state.pendingRound;
        state.pendingRound = null;
        const betIdx = RGS.betLevels.findIndex(v => Math.abs(v - pr.betAmount) < 0.00001);
        if (betIdx >= 0) state.betIndex = betIdx;
        showToast('RESUMING UNFINISHED BONUS...');
        state.spinning = true;
        setSpinVisual(true);
        syncMoneyUI(0, false);
        try {
          await playRoundEvents(pr, pr.betAmount || currentBet());
        } finally {
          state.spinning = false;
          setSpinVisual(false);
          syncMoneyUI();
        }
      }
    };

    $('splash-screen').addEventListener('click', enterGame, { once: true });
    $('btn-splash-play').addEventListener('click', enterGame, { once: true });
  }

  boot();
})();