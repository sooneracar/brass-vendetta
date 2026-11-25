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
  const LINE_COLORS = [
    0xf6d379, 0xff7b29, 0x49d6ff, 0xff4d6d, 0x7cff7c, 0xd88cff, 0xffd166,
    0x06d6a0, 0xef476f, 0x4cc9f0, 0xf77f00, 0xa8dadc, 0xe9c46a, 0xff9f1c
  ];

  // SEMBOL RENK HİYERARŞİSİ (Monokrom sorununu ortadan kaldırır)
  const SYMBOL_STYLE = {
    L1: { tint: 0xcbd6e6, aura: null,     alpha: 0 },
    L2: { tint: 0xcbd6e6, aura: null,     alpha: 0 },
    L3: { tint: 0xcbd6e6, aura: null,     alpha: 0 },
    L4: { tint: 0xd4dfee, aura: null,     alpha: 0 },
    H1: { tint: 0xffffff, aura: 0x26e69f, alpha: 0.22 }, // Zümrüt
    H2: { tint: 0xffffff, aura: 0xff5a45, alpha: 0.24 }, // Kızıl Bakır
    H3: { tint: 0xffffff, aura: 0x3ec8ff, alpha: 0.26 }, // Elektrik Mavisi
    H4: { tint: 0xffffff, aura: 0xffd24d, alpha: 0.30 }, // Saf Altın
    W:  { tint: 0xffffff, aura: 0xffb326, alpha: 0.34, pulse: true },
    SC: { tint: 0xffffff, aura: 0xff6218, alpha: 0.36, pulse: true },
    VS: { tint: 0xffffff, aura: 0x49d6ff, alpha: 0.36, pulse: true }
  };

  const RGS = window.BV_RGS;
  const AUDIO = window.BV_AUDIO;
  const { PAYLINES, PAYTABLE } = window.BV_CONST;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const state = {
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
    textures: {},
    particles: [],
    steamPuffs: [],
    coins: [],
    rings: [],
    floatingTexts: [],
    gears: [],
    vsEnergyRings: [],
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

  function currentBet() {
    return RGS.betLevels[state.betIndex] ?? 1.0;
  }

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // AKICI KAZANÇ SAYACI (ROLL-UP)
  function animateMoney(el, fromVal, toVal, durationMs = 420) {
    if (!el) return;
    const animId = (el._animId || 0) + 1;
    el._animId = animId;
    if (Math.abs(toVal - fromVal) < 0.01 || durationMs <= 20) {
      el.textContent = RGS.formatMoney(toVal);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      if (el._animId !== animId) return;
      const p = Math.min(1, (now - start) / durationMs);
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
    const locked = state.spinning || state.inBonus;

    $('ui-balance').textContent = RGS.formatMoney(state.balance);
    $('ui-bet').textContent = RGS.formatMoney(bet);
    $('buy-bonus-price').textContent = RGS.formatMoney(buyCost);

    // Buy Bonus Modal canlı bahis göstergesi
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

    // Buy Bonus düğmesi modalı açıp bahsi düşürebilmek için bakiye yetmese de açılır (sadece spin/bonus anında kilitli)
    $('btn-buy-bonus').disabled = locked;

    if (winVal !== null) {
      if (animateWin && winVal > state.displayedWin) {
        animateMoney($('ui-win'), state.displayedWin, winVal, state.turbo ? 240 : 480);
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
    const ptGrid = $('paytable-grid');
    ptGrid.innerHTML = REGULAR_KEYS.map(k => {
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

    const plGrid = $('paylines-grid');
    plGrid.innerHTML = PAYLINES.map((line, i) => {
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
  const app = new PIXI.Application();
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
    if (!wrap) return;
    const availW = Math.max(120, wrap.clientWidth - 8);
    const availH = Math.max(110, wrap.clientHeight - 4);
    const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    app.canvas.style.width = `${Math.floor(STAGE_W * scale)}px`;
    app.canvas.style.height = `${Math.floor(STAGE_H * scale)}px`;
  }
  resizeStage();
  window.addEventListener('resize', resizeStage);
  window.addEventListener('orientationchange', () => setTimeout(resizeStage, 140));
  if (window.ResizeObserver) {
    new ResizeObserver(resizeStage).observe($('stage-wrap'));
  }

  // Merkez pivotlu root (Kamera Zoom & Sarsıntı için)
  const root = new PIXI.Container();
  root.pivot.set(STAGE_W / 2, STAGE_H / 2);
  root.position.set(STAGE_W / 2, STAGE_H / 2);
  app.stage.addChild(root);

  // --- YAŞAYAN STEAMPUNK DİŞLİLERİ (TAHTA ARKASINDA DÖNEN PİRİNÇ ÇARKLAR) ---
  const gearLayer = new PIXI.Container();
  root.addChild(gearLayer);

  function createGear(outerR, innerR, teeth, fillColor, strokeColor) {
    const g = new PIXI.Graphics();
    const step = (Math.PI * 2) / teeth;
    const pts = [];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + step * 0.22;
      const a2 = a0 + step * 0.5;
      const a3 = a0 + step * 0.72;
      pts.push(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      pts.push(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
      pts.push(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      pts.push(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
    }
    g.poly(pts).fill({ color: fillColor, alpha: 0.9 }).stroke({ width: 2.5, color: strokeColor, alpha: 0.95 });
    g.circle(0, 0, innerR * 0.62).fill({ color: 0x0b0f18, alpha: 0.88 }).stroke({ width: 2, color: strokeColor });
    for (let s = 0; s < 4; s++) {
      const ang = (s * Math.PI) / 2;
      g.moveTo(Math.cos(ang) * -innerR * 0.6, Math.sin(ang) * -innerR * 0.6)
        .lineTo(Math.cos(ang) * innerR * 0.6, Math.sin(ang) * innerR * 0.6)
        .stroke({ width: 6, color: fillColor });
    }
    g.circle(0, 0, innerR * 0.22).fill({ color: strokeColor }).stroke({ width: 2, color: 0x2e1a05 });
    return g;
  }

  const gearSpecs = [
    { x: BOARD_X - 6,            y: BOARD_Y + 26,          r1: 58, r2: 46, teeth: 12, dir:  1, fill: 0x6e4a16, stroke: 0xdba442 },
    { x: BOARD_X + BOARD_W + 8,  y: BOARD_Y + 34,          r1: 62, r2: 49, teeth: 14, dir: -1, fill: 0x5c3c11, stroke: 0xc89336 },
    { x: BOARD_X - 8,            y: BOARD_Y + BOARD_H - 28, r1: 54, r2: 43, teeth: 11, dir: -1, fill: 0x4b3310, stroke: 0xb8822d },
    { x: BOARD_X + BOARD_W + 6,  y: BOARD_Y + BOARD_H - 22, r1: 56, r2: 44, teeth: 12, dir:  1, fill: 0x6e4a16, stroke: 0xdba442 }
  ];
  gearSpecs.forEach((gs) => {
    const g = createGear(gs.r1, gs.r2, gs.teeth, gs.fill, gs.stroke);
    g.position.set(gs.x, gs.y);
    gearLayer.addChild(g);
    state.gears.push({ gfx: g, dir: gs.dir });
  });

  // Buhar Katmanı (Tahta arkasından sızan ince buhar)
  const steamLayer = new PIXI.Container();
  root.addChild(steamLayer);

  const boardGlow = new PIXI.Graphics();
  root.addChild(boardGlow);

  // DÖVME DEMİR & PİRİNÇ TAHTA ÇERÇEVESİ
  function drawBoardFrame() {
    const frame = new PIXI.Container();

    const outer = new PIXI.Graphics();
    outer.roundRect(BOARD_X - 20, BOARD_Y - 20, BOARD_W + 40, BOARD_H + 40, 20)
      .fill({ color: 0x0a0f19, alpha: 0.97 })
      .stroke({ width: 5.5, color: 0x8f621b, alpha: 1 });
    outer.roundRect(BOARD_X - 16, BOARD_Y - 16, BOARD_W + 32, BOARD_H + 32, 16)
      .stroke({ width: 2, color: 0xf6d379, alpha: 0.9 });
    outer.roundRect(BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_H + 12, 10)
      .fill({ color: 0x070b13, alpha: 0.94 })
      .stroke({ width: 1.5, color: 0x5c3c11, alpha: 0.95 });
    frame.addChild(outer);

    const cells = new PIXI.Graphics();
    for (let c = 0; c < COLS; c++) {
      const colColor = c % 2 === 0 ? 0x101726 : 0x0b101b;
      cells.rect(BOARD_X + c * CELL_W, BOARD_Y, CELL_W, BOARD_H).fill({ color: colColor, alpha: 0.92 });
      for (let r = 0; r < ROWS; r++) {
        cells.roundRect(BOARD_X + c * CELL_W + 5, BOARD_Y + r * CELL_H + 5, CELL_W - 10, CELL_H - 10, 9)
          .stroke({ width: 1, color: 0xc89336, alpha: 0.11 });
      }
    }
    frame.addChild(cells);

    const dividers = new PIXI.Graphics();
    for (let c = 1; c < COLS; c++) {
      const x = BOARD_X + c * CELL_W;
      dividers.moveTo(x, BOARD_Y + 4).lineTo(x, BOARD_Y + BOARD_H - 4)
        .stroke({ width: 2, color: 0xc89336, alpha: 0.36 });
    }
    frame.addChild(dividers);

    const rivets = new PIXI.Graphics();
    const pts = [
      [BOARD_X - 10, BOARD_Y - 10], [BOARD_X + BOARD_W + 10, BOARD_Y - 10],
      [BOARD_X - 10, BOARD_Y + BOARD_H + 10], [BOARD_X + BOARD_W + 10, BOARD_Y + BOARD_H + 10],
      [BOARD_X + BOARD_W / 2, BOARD_Y - 12], [BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H + 12],
      [BOARD_X - 12, BOARD_Y + BOARD_H / 2], [BOARD_X + BOARD_W + 12, BOARD_Y + BOARD_H / 2]
    ];
    pts.forEach(([x, y]) => {
      rivets.circle(x, y, 5.5).fill({ color: 0xdba442 }).stroke({ width: 1.5, color: 0x4a2c08 });
      rivets.circle(x - 1.5, y - 1.5, 1.8).fill({ color: 0xfff3c4, alpha: 0.9 });
    });
    frame.addChild(rivets);

    root.addChild(frame);
  }
  drawBoardFrame();

  // Makara Maskesi
  const reelsClip = new PIXI.Container();
  reelsClip.position.set(BOARD_X, BOARD_Y);
  const clipMask = new PIXI.Graphics();
  clipMask.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H).fill({ color: 0xffffff });
  root.addChild(clipMask);
  reelsClip.mask = clipMask;
  root.addChild(reelsClip);

  // Katmanlar
  const teaseLayer = new PIXI.Container();
  teaseLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(teaseLayer);

  const vsLayer = new PIXI.Container();
  vsLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(vsLayer);

  const winFrameLayer = new PIXI.Container();
  winFrameLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(winFrameLayer);

  const lineLayer = new PIXI.Container();
  lineLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineLayer);

  const lineBadgeLayer = new PIXI.Container();
  lineBadgeLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineBadgeLayer);

  const fxLayer = new PIXI.Container();
  root.addChild(fxLayer);

  const flashOverlay = new PIXI.Graphics();
  flashOverlay.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0xffe8b0 });
  flashOverlay.alpha = 0;
  root.addChild(flashOverlay);

  // --- AKILLI SEMBOL HÜCRESİ (Aura + Sprite + Yüksek Kontrastlı VS Rozeti) ---
  function createSlot() {
    const box = new PIXI.Container();

    const aura = new PIXI.Graphics();
    box.addChild(aura);

    const sp = new PIXI.Sprite();
    sp.anchor.set(0.5);
    box.addChild(sp);

    // VS sembolü için dönen mavi-turuncu enerji halkası + parlak pirinç VS rozeti
    const vsGroup = new PIXI.Container();
    vsGroup.visible = false;

    const vsRing = new PIXI.Graphics();
    vsRing.arc(0, 0, 56, -Math.PI * 0.85, -Math.PI * 0.1)
      .stroke({ width: 4.5, color: 0x49d6ff, alpha: 0.92, cap: 'round' });
    vsRing.arc(0, 0, 56, Math.PI * 0.15, Math.PI * 0.9)
      .stroke({ width: 4.5, color: 0xff6a1a, alpha: 0.92, cap: 'round' });
    vsGroup.addChild(vsRing);

    const vsPlate = new PIXI.Graphics();
    vsPlate.roundRect(-34, 24, 68, 30, 8)
      .fill({ color: 0x160c05, alpha: 0.94 })
      .stroke({ width: 2.2, color: 0xfff0bc, alpha: 1 });
    vsGroup.addChild(vsPlate);

    const vsText = new PIXI.Text({
      text: 'VS',
      style: {
        fontFamily: 'Cinzel', fontSize: 22, fontWeight: '900',
        fill: 0xfff2c2, letterSpacing: 2,
        stroke: { color: 0x993506, width: 4 }
      }
    });
    vsText.anchor.set(0.5);
    vsText.position.set(0, 39);
    vsGroup.addChild(vsText);

    box.addChild(vsGroup);
    state.vsEnergyRings.push(vsRing);

    return { box, aura, sp, vsGroup, vsRing, symKey: 'L1', baseScale: 1 };
  }

  function fitSlot(slot, symKey) {
    slot.symKey = symKey;
    const style = SYMBOL_STYLE[symKey] || SYMBOL_STYLE.L1;
    const tex = state.textures[symKey];

    slot.sp.texture = tex || PIXI.Texture.EMPTY;
    const w = tex && tex.width ? tex.width : 512;
    const h = tex && tex.height ? tex.height : 512;
    const sizeFactor = symKey.startsWith('L') ? 0.78 : 0.88;
    const scale = Math.min((CELL_W * sizeFactor) / w, (CELL_H * sizeFactor) / h);
    slot.sp.scale.set(scale);
    slot.sp.tint = style.tint;
    slot.baseScale = scale;
    slot.box.alpha = 1;
    slot.box.scale.set(1);

    // Renkli arka aura çizimi
    slot.aura.clear();
    if (style.aura) {
      if (symKey === 'VS') {
        slot.aura.circle(-14, -8, 42).fill({ color: 0x49d6ff, alpha: 0.24 });
        slot.aura.circle(14, 8, 42).fill({ color: 0xff6a1a, alpha: 0.24 });
        slot.aura.roundRect(-66, -60, 132, 120, 14).stroke({ width: 2.5, color: 0xf6d379, alpha: 0.7 });
      } else {
        slot.aura.circle(0, 0, 52).fill({ color: style.aura, alpha: style.alpha });
        slot.aura.circle(0, 0, 34).fill({ color: 0xffffff, alpha: style.alpha * 0.35 });
      }
    }

    slot.vsGroup.visible = (symKey === 'VS');
  }

  // 5 Makara Sütunu
  const reels = [];
  for (let c = 0; c < COLS; c++) {
    const colContainer = new PIXI.Container();
    colContainer.x = c * CELL_W;
    reelsClip.addChild(colContainer);
    reels.push({ col: c, container: colContainer, slots: [], spinning: false, speed: 0 });
  }

  function populateInitialReels() {
    state.vsEnergyRings = [];
    reels.forEach((reel, c) => {
      reel.container.removeChildren();
      reel.slots = [];
      for (let r = -1; r <= ROWS; r++) {
        const sym = (r >= 0 && r < ROWS) ? state.currentGrid[r][c] : SYMBOL_KEYS[Math.floor(Math.random() * 8)];
        const slot = createSlot();
        slot.box.x = CELL_W / 2;
        slot.box.y = r * CELL_H + CELL_H / 2;
        fitSlot(slot, sym);
        reel.container.addChild(slot.box);
        reel.slots.push(slot);
      }
    });
  }

  // --- EFEKT SİSTEMLERİ ---
  function triggerShake(magnitude = 9, durationMs = 300) {
    state.shakeMag = Math.max(state.shakeMag, magnitude);
    state.shakeTime = Math.max(state.shakeTime, durationMs);
    state.shakeDuration = Math.max(state.shakeDuration, durationMs);
  }

  function triggerFlash(alpha = 0.5) {
    flashOverlay.alpha = Math.max(flashOverlay.alpha, alpha);
  }

  function spawnShockwave(x, y, color = 0xffae34, maxR = 165) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    fxLayer.addChild(g);
    state.rings.push({ gfx: g, r: 16, maxR, color, life: 1 });
  }

  function spawnSteamPuff(x, y, vx = 0, vy = -1.2) {
    const g = new PIXI.Graphics();
    g.circle(0, 0, 18).fill({ color: 0xdce8f8, alpha: 0.22 });
    g.position.set(x, y);
    steamLayer.addChild(g);
    state.steamPuffs.push({ gfx: g, vx, vy, scale: 0.6, life: 1 });
  }

  function spawnBurst(x, y, count = 28, colors = [0xfff0bc, 0xf6d379, 0xff7b29, 0xffffff]) {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      const size = 2.2 + Math.random() * 4.8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      if (Math.random() < 0.48) {
        g.rect(-size, -size * 0.42, size * 2, size * 0.84).fill({ color });
      } else {
        g.circle(0, 0, size).fill({ color });
      }
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

  // 3D TAKLA ATAN ALTIN SİKKE YAĞMURU (Big / Mega / Epic Win)
  function spawnCoinFountain(count = 14) {
    for (let i = 0; i < count; i++) {
      const c = new PIXI.Graphics();
      c.circle(0, 0, 13).fill({ color: 0xf6c445 }).stroke({ width: 3, color: 0xfff3b8 });
      c.circle(0, 0, 7).stroke({ width: 1.5, color: 0xb37412 });
      c.position.set(STAGE_W * (0.2 + Math.random() * 0.6), STAGE_H + 18);
      fxLayer.addChild(c);
      state.coins.push({
        gfx: c,
        vx: (Math.random() - 0.5) * 9,
        vy: -(11 + Math.random() * 8),
        spin: Math.random() * Math.PI * 2,
        spinSpd: 0.14 + Math.random() * 0.14,
        rot: (Math.random() - 0.5) * 0.1
      });
    }
  }

  function spawnFloatingWin(text, x, y) {
    const t = new PIXI.Text({
      text,
      style: {
        fontFamily: 'Cinzel', fontSize: 40, fontWeight: '900',
        fill: 0xfff4c8,
        stroke: { color: 0x3b1803, width: 7 },
        dropShadow: { color: 0xff6a1a, blur: 14, distance: 0, alpha: 0.95 }
      }
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.45);
    fxLayer.addChild(t);
    state.floatingTexts.push({ txt: t, life: 1, vy: -0.75 });
  }

  // --- ANA TICKER ---
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const ms = ticker.deltaMS;
    state.pulseTime += ms * 0.005;

    // 1. Dönen Steampunk Dişlileri
    const anySpinning = reels.some(r => r.spinning);
    const gearSpd = anySpinning
      ? (state.inBonus ? 0.048 : 0.032)
      : (state.inBonus ? 0.014 : 0.004);
    state.gears.forEach((g) => {
      g.gfx.rotation += g.dir * gearSpd * dt;
      g.gfx.tint = state.inBonus ? 0xffb67a : 0xffffff;
    });

    // 2. Periyodik İnce Buhar
    if (Math.random() < (state.inBonus ? 0.05 : 0.016)) {
      const leftSide = Math.random() < 0.5;
      const sx = leftSide ? BOARD_X - 18 : BOARD_X + BOARD_W + 18;
      const sy = BOARD_Y + 60 + Math.random() * (BOARD_H - 120);
      spawnSteamPuff(sx, sy, leftSide ? -0.9 : 0.9, -1.1);
    }

    // 3. VS Enerji Halkaları Dönüşü & Özel Sembol Nefesi
    state.vsEnergyRings.forEach((ring) => {
      if (ring && !ring.destroyed) ring.rotation += 0.055 * dt;
    });

    // 4. Çerçeve Ambiyans Işığı
    boardGlow.clear();
    const glowAlpha = state.inBonus
      ? 0.24 + Math.sin(state.pulseTime * 1.8) * 0.1
      : 0.08 + Math.sin(state.pulseTime * 0.9) * 0.03;
    boardGlow.roundRect(BOARD_X - 28, BOARD_Y - 28, BOARD_W + 56, BOARD_H + 56, 26)
      .fill({ color: state.inBonus ? 0xff6a1a : 0xc89336, alpha: glowAlpha });

    // 5. Makara Akışı + Motion Stretch
    reels.forEach((reel) => {
      if (!reel.spinning) return;
      const step = reel.speed * dt;
      reel.slots.forEach((slot) => {
        slot.box.y += step;
        if (slot.box.y > (ROWS + 0.5) * CELL_H) {
          slot.box.y -= (ROWS + 2) * CELL_H;
          const randKey = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
          fitSlot(slot, randKey);
          slot.sp.scale.y = slot.baseScale * 1.18;
          slot.box.alpha = 0.88;
        }
      });
    });

    // 6. Kazanan Hücre Nabzı
    if (state.winningSlots.length) {
      const p = 1.07 + Math.sin(state.pulseTime * 2.5) * 0.06;
      state.winningSlots.forEach((slot) => slot.box.scale.set(p));
    }

    // 7. Kamera Zoom & Sarsıntı
    state.zoom += (state.targetZoom - state.zoom) * 0.1 * dt;
    root.scale.set(state.zoom);

    let sx = 0, sy = 0;
    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - ms);
      const ratio = state.shakeTime / Math.max(1, state.shakeDuration);
      const mag = state.shakeMag * ratio;
      sx = (Math.random() - 0.5) * 2 * mag;
      sy = (Math.random() - 0.5) * 2 * mag;
      if (state.shakeTime === 0) state.shakeMag = 0;
    }
    root.position.set(STAGE_W / 2 + sx, STAGE_H / 2 + sy);

    // 8. Ekran Flash
    if (flashOverlay.alpha > 0.005) flashOverlay.alpha = Math.max(0, flashOverlay.alpha - 0.045 * dt);
    else flashOverlay.alpha = 0;

    // 9. Buhar Güncelleme
    for (let i = state.steamPuffs.length - 1; i >= 0; i--) {
      const st = state.steamPuffs[i];
      st.gfx.x += st.vx * dt;
      st.gfx.y += st.vy * dt;
      st.scale += 0.032 * dt;
      st.gfx.scale.set(st.scale);
      st.life -= 0.018 * dt;
      st.gfx.alpha = Math.max(0, st.life * 0.55);
      if (st.life <= 0) {
        steamLayer.removeChild(st.gfx);
        st.gfx.destroy();
        state.steamPuffs.splice(i, 1);
      }
    }

    // 10. Şok Dalgaları
    for (let i = state.rings.length - 1; i >= 0; i--) {
      const rg = state.rings[i];
      rg.r += (rg.maxR - rg.r) * 0.16 * dt;
      rg.life -= 0.045 * dt;
      rg.gfx.clear();
      if (rg.life > 0) {
        rg.gfx.circle(0, 0, rg.r).stroke({ width: 6 * rg.life, color: rg.color, alpha: rg.life });
      } else {
        fxLayer.removeChild(rg.gfx);
        rg.gfx.destroy();
        state.rings.splice(i, 1);
      }
    }

    // 11. Kıvılcım Parçacıkları
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.vx *= 0.982;
      p.vy += p.gravity * dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.gfx.rotation += (p.vr || 0) * dt;
      p.life -= p.decay * dt;
      p.gfx.alpha = Math.max(0, p.life);
      if (p.life <= 0) {
        fxLayer.removeChild(p.gfx);
        p.gfx.destroy();
        state.particles.splice(i, 1);
      }
    }

    // 12. 3D Altın Sikkeler
    for (let i = state.coins.length - 1; i >= 0; i--) {
      const cn = state.coins[i];
      cn.vy += 0.36 * dt;
      cn.gfx.x += cn.vx * dt;
      cn.gfx.y += cn.vy * dt;
      cn.spin += cn.spinSpd * dt;
      cn.gfx.scale.x = Math.cos(cn.spin);
      cn.gfx.rotation += cn.rot * dt;
      if (cn.gfx.y > STAGE_H + 50) {
        fxLayer.removeChild(cn.gfx);
        cn.gfx.destroy();
        state.coins.splice(i, 1);
      }
    }

    // 13. Uçan Kazanç Metinleri
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.txt.y += ft.vy * dt;
      const targetScale = ft.life > 0.78 ? 1.12 : 1.0;
      ft.txt.scale.x += (targetScale - ft.txt.scale.x) * 0.2 * dt;
      ft.txt.scale.y = ft.txt.scale.x;
      ft.life -= 0.017 * dt;
      ft.txt.alpha = Math.min(1, ft.life * 2.2);
      if (ft.life <= 0) {
        fxLayer.removeChild(ft.txt);
        ft.txt.destroy();
        state.floatingTexts.splice(i, 1);
      }
    }

    // 14. Bonus Kor Kıvılcımları
    if (state.inBonus && Math.random() < 0.3) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 1.8 + Math.random() * 2.6).fill({ color: Math.random() < 0.55 ? 0xff7b29 : 0xfff0bc });
      g.position.set(Math.random() * STAGE_W, STAGE_H + 6);
      fxLayer.addChild(g);
      state.particles.push({
        gfx: g, vx: (Math.random() - 0.5) * 1.4, vy: -(1.7 + Math.random() * 2.6),
        vr: 0, gravity: -0.012, life: 0.95, decay: 0.008
      });
    }
  });

  function clearRoundVisuals() {
    state.cycleToken++;
    teaseLayer.removeChildren();
    vsLayer.removeChildren();
    winFrameLayer.removeChildren();
    lineLayer.removeChildren();
    lineBadgeLayer.removeChildren();
    state.winningSlots = [];
    state.targetZoom = 1.0;
    $('win-banner').classList.add('hidden');
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
    spawnBurst(BOARD_X + col * CELL_W + CELL_W / 2, BOARD_Y + BOARD_H - 12, 18, [0xff6a1a, 0xfff0bc]);
  }

  async function animateColumnStop(col, grid, scCountSoFar) {
    const reel = reels[col];
    reel.spinning = false;
    reel.container.removeChildren();
    reel.slots = [];

    let colHasSC = false;
    let colHasVS = false;
    let scRow = 1;
    let vsRow = 1;

    for (let r = -1; r <= ROWS; r++) {
      const sym = (r >= 0 && r < ROWS) ? grid[r][col] : SYMBOL_KEYS[Math.floor(Math.random() * 8)];
      if (r >= 0 && r < ROWS && sym === 'SC') { colHasSC = true; scRow = r; }
      if (r >= 0 && r < ROWS && sym === 'VS') { colHasVS = true; vsRow = r; }
      const slot = createSlot();
      slot.box.x = CELL_W / 2;
      slot.box.y = r * CELL_H + CELL_H / 2 - 36;
      fitSlot(slot, sym);
      reel.container.addChild(slot.box);
      reel.slots.push(slot);
    }

    // Aktif VS halkalarını güncel tut
    state.vsEnergyRings = reels.flatMap(r => r.slots.map(s => s.vsRing));

    AUDIO.playSfx('stop', { volume: 0.85 });
    if (colHasSC) {
      const pitch = scCountSoFar === 0 ? 1.0 : scCountSoFar === 1 ? 1.15 : 1.32;
      AUDIO.playSfx('scatter_land', { volume: 0.95, rate: pitch });
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + scRow * CELL_H + CELL_H / 2;
      spawnShockwave(cx, cy, 0xffae34, 120);
      spawnBurst(cx, cy, 28, [0xfff0bc, 0xff7b29, 0x49d6ff]);
      triggerShake(6, 180);
    }
    if (colHasVS) {
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + vsRow * CELL_H + CELL_H / 2;
      spawnShockwave(cx, cy, 0x49d6ff, 115);
      spawnBurst(cx, cy, 24, [0x49d6ff, 0xff6a1a, 0xfff0bc]);
    }

    const frames = state.turbo ? 6 : 11;
    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const easeOutBack = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      const offset = -36 * (1 - easeOutBack);
      reel.slots.forEach((slot, idx) => {
        slot.box.y = (idx - 1) * CELL_H + CELL_H / 2 + offset;
      });
      await sleep(15);
    }
    reel.slots.forEach((slot, idx) => {
      slot.box.y = (idx - 1) * CELL_H + CELL_H / 2;
    });
    return colHasSC;
  }

  // --- AAA ZIRHLI VS DÜELLO AFİŞİ (Düz Kutu Yok!) ---
  function drawDuelGradientPanel(gfx, w, h, topPalette, botPalette, borderColor) {
    const halfH = h / 2;
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const yTop = 6 + (i / bands) * (halfH - 6);
      const bandH = (halfH - 6) / bands + 1;
      gfx.rect(6, yTop, w - 12, bandH).fill({ color: topPalette[i % topPalette.length], alpha: 0.96 });

      const yBot = halfH + (i / bands) * (halfH - 6);
      gfx.rect(6, yBot, w - 12, bandH).fill({ color: botPalette[i % botPalette.length], alpha: 0.96 });
    }
    // Çapraz fırçalanmış çelik dokusu
    for (let y = 16; y < h - 16; y += 22) {
      gfx.moveTo(10, y).lineTo(w - 10, y + 12).stroke({ width: 1, color: 0xffffff, alpha: 0.06 });
    }
    // Dövme pirinç dış ve iç çerçeve + köşe perçinleri
    gfx.roundRect(5, 5, w - 10, h - 10, 12).stroke({ width: 4.5, color: borderColor, alpha: 1 });
    gfx.roundRect(11, 11, w - 22, h - 22, 8).stroke({ width: 1.5, color: 0xfff0bc, alpha: 0.5 });
    [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([rx, ry]) => {
      gfx.circle(rx, ry, 4).fill({ color: 0xf6d379 }).stroke({ width: 1, color: 0x3b2206 });
    });
  }

  async function playVSDuels(vsReels) {
    const cols = Object.keys(vsReels).map(Number).sort((a, b) => a - b);
    if (!cols.length) return;

    AUDIO.duckMusic(true);
    state.targetZoom = 1.025;

    for (const col of cols) {
      const info = vsReels[String(col)];
      const colBox = new PIXI.Container();
      colBox.x = col * CELL_W;
      vsLayer.addChild(colBox);

      const centerX = BOARD_X + col * CELL_W + CELL_W / 2;
      const centerY = BOARD_Y + BOARD_H / 2;

      // 1. Mekanik Kasa Açılımı + Buhar
      AUDIO.playSfx('vs_expand', { volume: 0.95 });
      spawnSteamPuff(centerX - 30, centerY, -1.4, -0.6);
      spawnSteamPuff(centerX + 30, centerY, 1.4, -0.6);
      spawnBurst(centerX, centerY, 26, [0x49d6ff, 0xff7b29, 0xfff0bc]);

      const duelArena = new PIXI.Container();
      duelArena.pivot.set(CELL_W / 2, BOARD_H / 2);
      duelArena.position.set(CELL_W / 2, BOARD_H / 2);
      duelArena.scale.y = 0.05;
      colBox.addChild(duelArena);

      const arenaGfx = new PIXI.Graphics();
      const blueBands = [0x091c30, 0x0d2842, 0x113659, 0x16446e, 0x1b5485, 0x1e6094, 0x1b5485, 0x16446e, 0x12385c, 0x0e2c4a];
      const fireBands = [0x3d1205, 0x521907, 0x6b2209, 0x822c0c, 0x99370f, 0xa84112, 0x8f320d, 0x702409, 0x521907, 0x3b1104];
      drawDuelGradientPanel(arenaGfx, CELL_W, BOARD_H, blueBands, fireBands, 0xf6d379);

      // Orta enerji hattı
      arenaGfx.moveTo(8, BOARD_H / 2).lineTo(CELL_W - 8, BOARD_H / 2)
        .stroke({ width: 6, color: 0xfff0bc, alpha: 0.95 });
      duelArena.addChild(arenaGfx);

      for (let f = 1; f <= 9; f++) {
        const p = f / 9;
        duelArena.scale.y = 0.05 + 0.95 * (1 - Math.pow(1 - p, 3));
        await sleep(state.turbo ? 12 : 18);
      }
      duelArena.scale.y = 1;

      // Üst & Alt Çarpanlar
      const topTxt = new PIXI.Text({
        text: `${info.left}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 50, fontWeight: '900', fill: 0x8ef0ff,
          stroke: { color: 0x041526, width: 7 },
          dropShadow: { color: 0x49d6ff, blur: 14, distance: 0, alpha: 1 }
        }
      });
      topTxt.anchor.set(0.5);
      topTxt.position.set(CELL_W / 2, BOARD_H * 0.22);

      const botTxt = new PIXI.Text({
        text: `${info.right}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 50, fontWeight: '900', fill: 0xffc078,
          stroke: { color: 0x2b0a02, width: 7 },
          dropShadow: { color: 0xff6a1a, blur: 14, distance: 0, alpha: 1 }
        }
      });
      botTxt.anchor.set(0.5);
      botTxt.position.set(CELL_W / 2, BOARD_H * 0.78);

      const emblem = new PIXI.Sprite(state.textures.VS || PIXI.Texture.EMPTY);
      emblem.anchor.set(0.5);
      const es = Math.min(124 / (emblem.texture.width || 512), 124 / (emblem.texture.height || 512));
      emblem.scale.set(es);
      emblem.position.set(CELL_W / 2, BOARD_H / 2);

      const sparkArc = new PIXI.Graphics();
      duelArena.addChild(topTxt, botTxt, emblem, sparkArc);

      // Elektrik arkı ve düello çarpışma gerilimi
      const tensionSteps = state.turbo ? 6 : 13;
      for (let s = 0; s < tensionSteps; s++) {
        const j = (s / tensionSteps) * 6;
        emblem.x = CELL_W / 2 + (Math.random() - 0.5) * j * 2;
        emblem.rotation = (Math.random() - 0.5) * 0.14;
        topTxt.scale.set(1 + (s % 2 === 0 ? 0.1 : -0.04));
        botTxt.scale.set(1 + (s % 2 === 1 ? 0.1 : -0.04));

        sparkArc.clear();
        sparkArc.moveTo(14, BOARD_H / 2);
        for (let seg = 1; seg <= 5; seg++) {
          sparkArc.lineTo(14 + (CELL_W - 28) * (seg / 5), BOARD_H / 2 + (Math.random() - 0.5) * 26);
        }
        sparkArc.stroke({ width: 3, color: s % 2 === 0 ? 0x8ef0ff : 0xffb36b, alpha: 0.95 });
        await sleep(30);
      }

      // 2. ÇİFT ÇAPRAZ KILIÇ KESİĞİ + FLASH + ÇİFT ŞOK DALGASI + 64 KIVILCIM
      AUDIO.playSfx('vs_clash', { volume: 1.0 });
      triggerShake(15, 400);
      triggerFlash(0.46);
      spawnShockwave(centerX, centerY, 0xfff0bc, 210);
      spawnShockwave(centerX, centerY, 0xff6a1a, 145);
      spawnBurst(centerX, centerY, 64, [0xffffff, 0xfff0bc, 0xff7b29, 0x49d6ff]);

      const slash = new PIXI.Graphics();
      slash.moveTo(-12, BOARD_H * 0.72).lineTo(CELL_W + 12, BOARD_H * 0.28)
        .stroke({ width: 16, color: 0xffae34, alpha: 0.8, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.28).lineTo(CELL_W + 12, BOARD_H * 0.72)
        .stroke({ width: 14, color: 0x49d6ff, alpha: 0.75, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.72).lineTo(CELL_W + 12, BOARD_H * 0.28)
        .stroke({ width: 6, color: 0xffffff, alpha: 1, cap: 'round' });
      slash.moveTo(-12, BOARD_H * 0.28).lineTo(CELL_W + 12, BOARD_H * 0.72)
        .stroke({ width: 5, color: 0xffffff, alpha: 1, cap: 'round' });
      colBox.addChild(slash);

      for (let f = 1; f <= 7; f++) {
        slash.alpha = 1 - f / 7;
        await sleep(22);
      }
      colBox.removeChild(slash);
      slash.destroy();

      // 3. KAZANAN WILD REEL MÜHRÜ
      const isBlueWin = info.winMult === info.left && info.left !== info.right;
      const winPalette = isBlueWin
        ? [0x0b2238, 0x10304f, 0x154169, 0x1a5180, 0x154169, 0x10304f, 0x0b2238, 0x091b2e, 0x0c243b, 0x113352]
        : [0x2e1104, 0x471a06, 0x632509, 0x7d310c, 0x632509, 0x471a06, 0x361405, 0x260e03, 0x3d1706, 0x542008];
      const winAccent = isBlueWin ? 0x49d6ff : 0xff9f43;

      duelArena.removeChildren();
      const finalBg = new PIXI.Graphics();
      drawDuelGradientPanel(finalBg, CELL_W, BOARD_H, winPalette, winPalette, 0xfff0bc);
      // Merkez madalyon halesi
      finalBg.circle(CELL_W / 2, BOARD_H * 0.72, 54).fill({ color: winAccent, alpha: 0.22 });
      duelArena.addChild(finalBg);

      if (state.textures.VS && state.textures.VS !== PIXI.Texture.EMPTY) {
        const bgEmb = new PIXI.Sprite(state.textures.VS);
        bgEmb.anchor.set(0.5);
        const s2 = Math.min(132 / (bgEmb.texture.width || 512), 132 / (bgEmb.texture.height || 512));
        bgEmb.scale.set(s2);
        bgEmb.position.set(CELL_W / 2, BOARD_H * 0.25);
        duelArena.addChild(bgEmb);
      }

      const wildPlate = new PIXI.Graphics();
      wildPlate.roundRect(18, BOARD_H * 0.46, CELL_W - 36, 36, 8)
        .fill({ color: 0x0d0905, alpha: 0.9 })
        .stroke({ width: 2, color: 0xf6d379 });
      duelArena.addChild(wildPlate);

      const winLabel = new PIXI.Text({
        text: 'WILD REEL',
        style: { fontFamily: 'Cinzel', fontSize: 17, fontWeight: '900', fill: 0xf6d379, letterSpacing: 2 }
      });
      winLabel.anchor.set(0.5);
      winLabel.position.set(CELL_W / 2, BOARD_H * 0.46 + 18);

      const winMultTxt = new PIXI.Text({
        text: `${info.winMult}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 64, fontWeight: '900', fill: 0xffffff,
          stroke: { color: isBlueWin ? 0x062945 : 0x5e2204, width: 8 },
          dropShadow: { color: winAccent, blur: 18, distance: 0, alpha: 1 }
        }
      });
      winMultTxt.anchor.set(0.5);
      winMultTxt.position.set(CELL_W / 2, BOARD_H * 0.72);
      winMultTxt.scale.set(0.3);

      duelArena.addChild(winLabel, winMultTxt);

      for (let f = 1; f <= 8; f++) {
        const t = f / 8;
        const pop = 1 + 1.9 * Math.pow(t - 1, 3) + 0.95 * Math.pow(t - 1, 2);
        winMultTxt.scale.set(0.3 + 0.7 * pop);
        await sleep(16);
      }
      winMultTxt.scale.set(1);

      await sleep(state.turbo ? 180 : 360);
    }

    state.targetZoom = 1.0;
    AUDIO.duckMusic(false);
  }

  // --- ÖDEME ÇİZGİLERİ (ÖNCE TOPLU PARLAMA, ARDINDAN TEMİZ SIRALI DÖNGÜ) ---
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
      reel.slots.forEach((slot, idx) => {
        const row = idx - 1;
        if (row < 0 || row >= ROWS) return;
        const isHit = hitCells.has(`${c}_${row}`);
        slot.box.alpha = isHit ? 1.0 : 0.3;
        if (isHit) state.winningSlots.push(slot);
        else slot.box.scale.set(1);
      });
    });

    // Altın hücre çerçeveleri
    const framesGfx = new PIXI.Graphics();
    hitCells.forEach((key) => {
      const [c, r] = key.split('_').map(Number);
      const x = c * CELL_W + 6;
      const y = r * CELL_H + 6;
      framesGfx.roundRect(x, y, CELL_W - 12, CELL_H - 12, 12)
        .fill({ color: 0xf6d379, alpha: 0.11 })
        .stroke({ width: 5, color: 0xff8c24, alpha: 0.48 });
      framesGfx.roundRect(x + 2, y + 2, CELL_W - 16, CELL_H - 16, 10)
        .stroke({ width: 2.5, color: 0xfff0bc, alpha: 0.96 });
    });
    winFrameLayer.addChild(framesGfx);

    // Çizgiler (Toplu görünümde sade incelikte, tekil görünümde güçlü neon)
    const glowW = showSingleBadge ? 11 : 7;
    const coreW = showSingleBadge ? 3.8 : 2.2;
    const lineAlpha = showSingleBadge ? 0.55 : 0.3;

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
      g.stroke({ width: glowW, color, alpha: lineAlpha, join: 'round', cap: 'round' });
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: coreW, color: 0xfff8dc, alpha: showSingleBadge ? 0.96 : 0.72, join: 'round', cap: 'round' });

      if (showSingleBadge) {
        for (let c = 0; c < w.count; c++) {
          g.circle(c * CELL_W + CELL_W / 2, line[c] * CELL_H + CELL_H / 2, 5.5)
            .fill({ color: 0xffffff }).stroke({ width: 2, color });
        }
      }
      lineLayer.addChild(g);
    });

    // Tekil çizgi kazanç etiketi
    if (showSingleBadge && winList.length === 1) {
      const w = winList[0];
      const line = PAYLINES[w.line];
      const midCol = Math.min(2, Math.floor((w.count - 1) / 2));
      const bx = midCol * CELL_W + CELL_W / 2;
      const by = line[midCol] * CELL_H + CELL_H / 2;

      const labelTxt = new PIXI.Text({
        text: `LINE #${w.line + 1}  +${RGS.formatMoney(w.win * bet)}`,
        style: { fontFamily: 'Cinzel', fontSize: 18, fontWeight: '900', fill: 0xfff4c8 }
      });
      labelTxt.anchor.set(0.5);
      const pw = Math.max(150, labelTxt.width + 26);
      const pill = new PIXI.Graphics();
      pill.roundRect(-pw / 2, -17, pw, 34, 17)
        .fill({ color: 0x170d06, alpha: 0.94 })
        .stroke({ width: 2, color: 0xf6d379 });
      const badge = new PIXI.Container();
      badge.position.set(Math.max(pw / 2 + 8, Math.min(BOARD_W - pw / 2 - 8, bx)), Math.max(24, by));
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
      await sleep(1150);
    }
  }

  async function showWinLines(wins, winMoney, bet, allowIdleCycle = false) {
    if (!wins.length || winMoney <= 0) return;

    AUDIO.playSfx('win', { volume: 0.92 });
    $('win-banner-amount').textContent = RGS.formatMoney(winMoney);
    $('win-banner').classList.remove('hidden');

    // 1. Kısa toplu parlama + üst bölgede temiz uçan kazanç
    renderWinSubset(wins, bet, wins.length === 1);
    spawnFloatingWin(`+${RGS.formatMoney(winMoney)}`, STAGE_W / 2, BOARD_Y + 46);
    spawnBurst(STAGE_W / 2, BOARD_Y + 60, 26, [0xfff0bc, 0xf6d379, 0xff7b29]);

    state.skipWin = false;
    const waitTotal = state.turbo ? 420 : 880;
    const t0 = performance.now();
    while (!state.skipWin && performance.now() - t0 < waitTotal) {
      await sleep(35);
    }

    // 2. Temel oyunda boşta kalınca kazanan çizgileri tek tek sırayla döndür
    if (allowIdleCycle && wins.length > 1 && !state.skipWin) {
      const token = state.cycleToken;
      startIdleWinCycle(wins, bet, token);
    }
  }

  // --- AAA KADEMELİ BIG / MEGA / EPIC / MAX WIN + 3D ALTIN SİKKE YAĞMURU ---
  function getWinTier(mult) {
    if (mult >= 12500) return 'MAX WIN!';
    if (mult >= 60) return 'EPIC WIN';
    if (mult >= 30) return 'MEGA WIN';
    return 'BIG WIN';
  }

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
    AUDIO.playSfx('big_win', { volume: 0.95 });
    const counterSfx = AUDIO.playSfx('countup_loop', { volume: 0.72, loop: true });
    triggerShake(12, 420);
    triggerFlash(0.48);
    spawnCoinFountain(24);

    let skipped = false;
    const onSkip = () => { skipped = true; };
    const onKeySkip = (e) => { if (e.code === 'Space') skipped = true; };
    overlay.addEventListener('click', onSkip, { once: true });
    window.addEventListener('keydown', onKeySkip);

    const duration = Math.min(5400, 2100 + finalMult * 22);
    const start = performance.now();
    let lastCoinBurst = 0;

    while (!skipped) {
      const now = performance.now();
      const p = Math.min(1, (now - start) / duration);
      const val = totalWinMoney * (1 - Math.pow(1 - p, 2.1));
      const curMult = val / bet;

      amountEl.textContent = RGS.formatMoney(val);
      multEl.textContent = `${Math.floor(curMult)}×`;

      // Kademeli seviye patlaması (BIG -> MEGA -> EPIC -> MAX)
      const nextTier = getWinTier(curMult);
      if (nextTier !== shownTier) {
        shownTier = nextTier;
        tierEl.textContent = shownTier;
        tierEl.classList.remove('tier-pop');
        void tierEl.offsetWidth;
        tierEl.classList.add('tier-pop');
        AUDIO.playSfx('vs_clash', { volume: 0.85, rate: 1.15 });
        triggerShake(15, 360);
        triggerFlash(0.42);
        spawnCoinFountain(22);
        spawnShockwave(STAGE_W / 2, STAGE_H / 2, 0xfff0bc, 260);
      }

      if (now - lastCoinBurst > 240) {
        lastCoinBurst = now;
        spawnCoinFountain(8);
        spawnBurst(STAGE_W * (0.2 + Math.random() * 0.6), STAGE_H * 0.45, 10, [0xfff0bc, 0xf6d379, 0xff7b29]);
      }

      if (p >= 1) break;
      await sleep(30);
    }

    overlay.removeEventListener('click', onSkip);
    window.removeEventListener('keydown', onKeySkip);
    counterSfx.stop(60);
    AUDIO.playSfx('countup_end', { volume: 0.95 });

    tierEl.textContent = getWinTier(finalMult);
    amountEl.textContent = RGS.formatMoney(totalWinMoney);
    multEl.textContent = `${finalMult.toFixed(1)}×`;
    spawnCoinFountain(18);
    await sleep(skipped ? 620 : 1450);

    overlay.classList.add('hidden');
    AUDIO.duckMusic(false);
  }

  // --- TEK SPİN AKIŞI ---
  async function runSingleSpinVisual(ev, bet, allowIdleCycle = false) {
    clearRoundVisuals();
    state.quickStop = false;

    AUDIO.playSfx('spin', { volume: 0.82 });
    spawnSteamPuff(BOARD_X - 14, BOARD_Y + BOARD_H * 0.5, -1.2, -1.2);
    spawnSteamPuff(BOARD_X + BOARD_W + 14, BOARD_Y + BOARD_H * 0.5, 1.2, -1.2);

    if (!state.turbo) {
      reels.forEach(r => r.slots.forEach(s => { s.box.y -= 14; }));
      await sleep(50);
    }

    reels.forEach((r) => {
      r.spinning = true;
      r.speed = state.turbo ? 64 : 48;
      r.slots.forEach((s) => {
        s.sp.scale.y = s.baseScale * 1.18;
        s.box.alpha = 0.88;
      });
    });

    await sleep(state.turbo ? 140 : 340);

    let scLanded = 0;
    let teaseSfx = null;

    for (let c = 0; c < COLS; c++) {
      const shouldTease = !state.inBonus && !state.quickStop && !state.turbo && scLanded >= 2;
      if (shouldTease) {
        showTeaseColumn(c);
        if (!teaseSfx) teaseSfx = AUDIO.playSfx('anticipation', { volume: 0.88, loop: true });
        reels[c].speed = 70;
        await sleep(920);
      } else if (c > 0 && !state.quickStop) {
        await sleep(state.turbo ? 50 : 140);
      }

      const gotSC = await animateColumnStop(c, ev.grid, scLanded);
      if (gotSC) scLanded++;
    }

    if (teaseSfx) teaseSfx.stop(80);
    teaseLayer.removeChildren();
    state.targetZoom = 1.0;
    state.currentGrid = ev.grid;

    if (ev.vsReels && Object.keys(ev.vsReels).length > 0) {
      await playVSDuels(ev.vsReels);
    }

    const spinWinMoney = +(ev.spinWin * bet).toFixed(2);
    if (spinWinMoney > 0) {
      await showWinLines(ev.wins || [], spinWinMoney, bet, allowIdleCycle);
    }
    return spinWinMoney;
  }

  function waitForButton(modalId, btnId) {
    return new Promise((resolve) => {
      const modal = $(modalId);
      const btn = $(btnId);
      modal.classList.remove('hidden');
      const handler = () => {
        AUDIO.playSfx('ui_click', { volume: 0.85 });
        modal.classList.add('hidden');
        resolve();
      };
      btn.addEventListener('click', handler, { once: true });
    });
  }

  // --- TUR OYNATMA (NORMAL VEYA RGS KURTARMA) ---
  async function playRoundEvents(result, bet) {
    const events = result.events || [];
    let runningWin = 0;
    let bonusEvents = events;

    const hasBonus = events.length > 1 || (events.length === 1 && events[0].type === 'bonusSpin');

    if (events.length && events[0].type === 'spin') {
      const allowCycle = !hasBonus && state.autoLeft === 0;
      const baseWin = await runSingleSpinVisual(events[0], bet, allowCycle);
      runningWin = +(runningWin + baseWin).toFixed(2);
      syncMoneyUI(runningWin, true);
      bonusEvents = events.slice(1);
    }

    if (bonusEvents.length > 0) {
      state.autoLeft = 0;
      updateAutoUI();

      AUDIO.duckMusic(true);
      AUDIO.playSfx('bonus_trigger', { volume: 1.0 });
      triggerFlash(0.45);
      await sleep(450);
      await waitForButton('fs-intro-modal', 'btn-start-fs');
      AUDIO.duckMusic(false);

      setBonusTheme(true);
      state.displayedHudWin = runningWin;
      const totalFS = bonusEvents.length;

      for (let i = 0; i < totalFS; i++) {
        $('hud-spins').textContent = `${totalFS - i} / ${totalFS}`;
        $('hud-total-win').textContent = RGS.formatMoney(state.displayedHudWin);

        const fsWin = await runSingleSpinVisual(bonusEvents[i], bet, false);
        const prevWin = runningWin;
        runningWin = +(runningWin + fsWin).toFixed(2);
        animateMoney($('hud-total-win'), prevWin, runningWin, state.turbo ? 240 : 480);
        state.displayedHudWin = runningWin;
        syncMoneyUI(runningWin, true);

        if (fsWin >= bet * 15) {
          await showBigWinIfNeeded(fsWin, bet);
        }
        await sleep(state.turbo ? 160 : 380);
      }

      // Bonus Bitiş Ekranı + Sayaç
      const totalBonusMoney = +(result.payoutMultiplier * bet).toFixed(2);
      $('fs-outro-amount').textContent = RGS.formatMoney(0);
      $('fs-outro-mult').textContent = `${result.payoutMultiplier.toFixed(2)}× ${RGS.isSocial ? 'PLAY' : 'BET'}`;
      $('fs-outro-modal').classList.remove('hidden');

      const cSfx = AUDIO.playSfx('countup_loop', { volume: 0.7, loop: true });
      const t0 = performance.now();
      const dur = totalBonusMoney > 0 ? 1500 : 80;
      while (true) {
        const p = Math.min(1, (performance.now() - t0) / dur);
        $('fs-outro-amount').textContent = RGS.formatMoney(totalBonusMoney * p);
        if (p >= 1) break;
        await sleep(25);
      }
      cSfx.stop(60);
      if (totalBonusMoney > 0) AUDIO.playSfx('countup_end', { volume: 0.92 });

      await waitForButton('fs-outro-modal', 'btn-end-fs');
      setBonusTheme(false); // Tahta, VS ve WIN banner tamamen temizlenir
    } else if (runningWin >= bet * 15) {
      await showBigWinIfNeeded(runningWin, bet);
    }

    state.balance = result.balanceAfter;
    syncMoneyUI(+(result.payoutMultiplier * bet).toFixed(2), false);
    await RGS.endRound();
  }

  async function executeRound(mode = 'base') {
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
    state.balance = +(state.balance - cost).toFixed(2);
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
        setTimeout(() => executeRound('base'), state.turbo ? 240 : 560);
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
    if (state.spinning || state.inBonus) return;
    const next = state.betIndex + delta;
    if (next >= 0 && next < RGS.betLevels.length) {
      state.betIndex = next;
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      syncMoneyUI();
    }
  }

  function bindEvents() {
    $('btn-spin').addEventListener('click', () => {
      if (!state.spinning) AUDIO.playSfx('ui_click', { volume: 0.7 });
      executeRound('base');
    });

    // Sahneye dokunarak makara veya kazanç animasyonunu hızla atlama
    $('pixi-container').addEventListener('click', () => {
      if (state.spinning) {
        state.quickStop = true;
        state.skipWin = true;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && $('splash-screen').classList.contains('hidden')) {
        if (!$('bigwin-overlay').classList.contains('hidden')) return;
        if (!$('buy-modal').classList.contains('hidden')) return;
        if (!$('info-modal').classList.contains('hidden')) return;
        e.preventDefault();
        executeRound('base');
      }
    });

    $('btn-bet-down').addEventListener('click', () => changeBet(-1));
    $('btn-bet-up').addEventListener('click', () => changeBet(1));
    $('btn-modal-bet-down').addEventListener('click', () => changeBet(-1));
    $('btn-modal-bet-up').addEventListener('click', () => changeBet(1));

    $('btn-turbo').addEventListener('click', () => {
      state.turbo = !state.turbo;
      $('btn-turbo').classList.toggle('active', state.turbo);
      AUDIO.playSfx('ui_click', { volume: 0.8 });
    });

    $('btn-sound').addEventListener('click', () => {
      const muted = AUDIO.toggleMute();
      $('btn-sound').classList.toggle('active', !muted);
      $('ico-sound-on').classList.toggle('hidden', muted);
      $('ico-sound-off').classList.toggle('hidden', !muted);
    });

    $('btn-info').addEventListener('click', () => {
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      $('info-modal').classList.remove('hidden');
    });

    $('btn-buy-bonus').addEventListener('click', () => {
      if (state.spinning || state.inBonus) return;
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      syncMoneyUI();
      $('buy-modal').classList.remove('hidden');
    });

    $('btn-confirm-buy').addEventListener('click', () => {
      if (state.balance < currentBet() * 100) return;
      $('buy-modal').classList.add('hidden');
      AUDIO.playSfx('buy_bonus', { volume: 0.95 });
      executeRound('bonus');
    });

    $('btn-auto').addEventListener('click', () => {
      AUDIO.playSfx('ui_click', { volume: 0.8 });
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
        AUDIO.playSfx('ui_click', { volume: 0.8 });
        state.autoLeft = count - 1;
        updateAutoUI();
        executeRound('base');
      });
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        AUDIO.playSfx('ui_click', { volume: 0.7 });
        $(btn.dataset.close).classList.add('hidden');
      });
    });
  }

  async function boot() {
    buildPaytableAndLines();
    applySocialModeLabels();
    bindEvents();

    const setLoad = (pct, label) => {
      $('load-fill').style.width = `${Math.round(pct)}%`;
      $('load-text').textContent = `${label} ${Math.round(pct)}%`;
    };

    try {
      const auth = await RGS.authenticate();
      state.balance = auth.balance;
      state.pendingRound = auth.pendingRound || null;
      // Canlı (LIVE) modda DEMO rozetini tamamen gizle
      $('mode-badge').classList.toggle('hidden', auth.mode !== 'DEMO');
      const defIdx = RGS.betLevels.findIndex(v => v >= 1.0);
      state.betIndex = defIdx >= 0 ? defIdx : 0;
      syncMoneyUI(0, false);
    } catch (err) {
      $('mode-badge').classList.remove('hidden');
      showToast('RGS AUTH FAILED — DEMO FALLBACK');
    }

    for (let i = 0; i < SYMBOL_KEYS.length; i++) {
      const key = SYMBOL_KEYS[i];
      try {
        state.textures[key] = await PIXI.Assets.load(`assets/img/${key}.png`);
      } catch (e) {
        console.warn(`[Img] Eksik: assets/img/${key}.png`);
        state.textures[key] = PIXI.Texture.EMPTY;
      }
      setLoad(((i + 1) / SYMBOL_KEYS.length) * 85, 'LOADING ASSETS');
    }

    populateInitialReels();
    resizeStage();

    setLoad(100, 'READY');
    $('load-wrap').classList.add('hidden');
    $('btn-splash-play').classList.remove('hidden');

    $('btn-splash-play').addEventListener('click', async () => {
      $('btn-splash-play').disabled = true;
      $('btn-splash-play').textContent = 'STARTING...';
      AUDIO.ensureContext();
      AUDIO.playMusic('base');
      await AUDIO.preload();
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      $('splash-screen').classList.add('hidden');
      resizeStage();

      // Bağlantı kopması sonrası yarım kalmış RGS turu varsa otomatik kurtar
      if (state.pendingRound) {
        const pr = state.pendingRound;
        state.pendingRound = null;
        state.spinning = true;
        setSpinVisual(true);
        try {
          await playRoundEvents(pr, pr.betAmount || currentBet());
        } finally {
          state.spinning = false;
          setSpinVisual(false);
          syncMoneyUI();
        }
      }
    }, { once: true });
  }

  boot();
})();
