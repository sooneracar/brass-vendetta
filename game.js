(async () => {
  const COLS = 5;
  const ROWS = 4;
  const CELL_W = 164;
  const CELL_H = 148;
  const BOARD_W = COLS * CELL_W; // 820
  const BOARD_H = ROWS * CELL_H; // 592
  const STAGE_W = 920;
  const STAGE_H = 680;
  const BOARD_X = (STAGE_W - BOARD_W) / 2;
  const BOARD_Y = (STAGE_H - BOARD_H) / 2;

  const SYMBOL_KEYS = ['L1', 'L2', 'L3', 'L4', 'H1', 'H2', 'H3', 'H4', 'W', 'VS', 'SC'];
  const REGULAR_KEYS = ['H4', 'H3', 'H2', 'H1', 'L4', 'L3', 'L2', 'L1'];
  const LINE_COLORS = [
    0xf6d379, 0xff7b29, 0x49d6ff, 0xff4d6d, 0x7cff7c, 0xd88cff, 0xffd166,
    0x06d6a0, 0xef476f, 0x4cc9f0, 0xf77f00, 0xa8dadc, 0xe9c46a, 0xff9f1c
  ];

  const RGS = window.BV_RGS;
  const AUDIO = window.BV_AUDIO;
  const { PAYLINES, PAYTABLE } = window.BV_CONST;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const state = {
    betIndex: 3, // $1.00 default
    balance: 1000,
    turbo: false,
    spinning: false,
    quickStop: false,
    inBonus: false,
    autoLeft: 0,
    textures: {},
    particles: [],
    shakeTime: 0,
    shakeMag: 0,
    activeTweens: [],
    currentGrid: [
      ['H4', 'L1', 'VS', 'L2', 'H3'],
      ['L3', 'H2', 'W',  'H1', 'L4'],
      ['H1', 'SC', 'H4', 'SC', 'H2'],
      ['L2', 'L4', 'L1', 'L3', 'W']
    ]
  };

  // --- YARDIMCI UI FONKSİYONLARI ---
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

  function syncMoneyUI(winVal = null) {
    const bet = currentBet();
    $('ui-balance').textContent = RGS.formatMoney(state.balance);
    $('ui-bet').textContent = RGS.formatMoney(bet);
    const buyCost = bet * 100;
    $('buy-bonus-price').textContent = RGS.formatMoney(buyCost);
    $('buy-modal-cost').textContent = RGS.formatMoney(buyCost);
    if (winVal !== null) {
      $('ui-win').textContent = RGS.formatMoney(winVal);
    }
    const locked = state.spinning || state.inBonus;
    $('btn-bet-down').disabled = locked || state.betIndex <= 0;
    $('btn-bet-up').disabled = locked || state.betIndex >= RGS.betLevels.length - 1;
    $('btn-buy-bonus').disabled = locked || state.balance < buyCost;
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
    $('bg-base').classList.toggle('active', !active);
    $('bg-bonus').classList.toggle('active', active);
    $('bonus-hud').classList.toggle('hidden', !active);
    AUDIO.playMusic(active ? 'bonus' : 'base');
  }

  function buildPaytableAndLines() {
    const ptGrid = $('paytable-grid');
    ptGrid.innerHTML = REGULAR_KEYS.map(k => {
      const p = PAYTABLE[k];
      return `
        <div class="pt-card">
          <img src="assets/img/${k}.png" alt="${k}" />
          <div class="pt-lines">
            <div>5× <b>${p[5]}x</b></div>
            <div>4× <b>${p[4]}x</b></div>
            <div>3× <b>${p[3]}x</b></div>
          </div>
        </div>`;
    }).join('');

    const plGrid = $('paylines-grid');
    plGrid.innerHTML = PAYLINES.map((line, i) => {
      let dots = '';
      let pts = [];
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
  app.canvas.style.aspectRatio = `${STAGE_W} / ${STAGE_H}`;

  const root = new PIXI.Container();
  app.stage.addChild(root);

  // Dövme Demir & Pirinç Ana Çerçeve
  function drawBoardFrame() {
    const frame = new PIXI.Container();

    const outer = new PIXI.Graphics();
    outer.roundRect(BOARD_X - 18, BOARD_Y - 18, BOARD_W + 36, BOARD_H + 36, 18)
      .fill({ color: 0x0b0f18, alpha: 0.94 })
      .stroke({ width: 4, color: 0xc89336, alpha: 0.95 });
    outer.roundRect(BOARD_X - 10, BOARD_Y - 10, BOARD_W + 20, BOARD_H + 20, 12)
      .fill({ color: 0x070a11, alpha: 0.88 })
      .stroke({ width: 1.5, color: 0xf6d379, alpha: 0.45 });
    frame.addChild(outer);

    const dividers = new PIXI.Graphics();
    for (let c = 1; c < COLS; c++) {
      const x = BOARD_X + c * CELL_W;
      dividers.moveTo(x, BOARD_Y + 6).lineTo(x, BOARD_Y + BOARD_H - 6)
        .stroke({ width: 1.5, color: 0xc89336, alpha: 0.25 });
    }
    frame.addChild(dividers);

    const rivets = new PIXI.Graphics();
    const corners = [
      [BOARD_X - 9, BOARD_Y - 9], [BOARD_X + BOARD_W + 9, BOARD_Y - 9],
      [BOARD_X - 9, BOARD_Y + BOARD_H + 9], [BOARD_X + BOARD_W + 9, BOARD_Y + BOARD_H + 9]
    ];
    corners.forEach(([x, y]) => {
      rivets.circle(x, y, 5).fill({ color: 0xf6d379 }).stroke({ width: 1.5, color: 0x5c3a0d });
    });
    frame.addChild(rivets);

    root.addChild(frame);
  }
  drawBoardFrame();

  // Makara Maskeli Konteyner
  const reelsClip = new PIXI.Container();
  reelsClip.position.set(BOARD_X, BOARD_Y);
  const clipMask = new PIXI.Graphics();
  clipMask.rect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H).fill({ color: 0xffffff });
  root.addChild(clipMask);
  reelsClip.mask = clipMask;
  root.addChild(reelsClip);

  // Katmanlar: Gerilim Işığı, VS Düello, Ödeme Çizgileri, Parçacıklar
  const teaseLayer = new PIXI.Container();
  teaseLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(teaseLayer);

  const vsLayer = new PIXI.Container();
  vsLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(vsLayer);

  const lineLayer = new PIXI.Container();
  lineLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineLayer);

  const particleLayer = new PIXI.Container();
  root.addChild(particleLayer);

  // 5 Makara Sütunu
  const reels = [];
  for (let c = 0; c < COLS; c++) {
    const colContainer = new PIXI.Container();
    colContainer.x = c * CELL_W;
    reelsClip.addChild(colContainer);
    reels.push({
      col: c,
      container: colContainer,
      sprites: [],
      spinning: false,
      speed: 0,
      targetGridCol: null
    });
  }

  function fitSprite(sp, symKey) {
    sp.texture = state.textures[symKey] || PIXI.Texture.WHITE;
    const tex = sp.texture;
    const maxW = CELL_W * 0.84;
    const maxH = CELL_H * 0.84;
    const scale = Math.min(maxW / (tex.width || 512), maxH / (tex.height || 512));
    sp.scale.set(scale);
    sp._baseScale = scale;
    sp.alpha = 1;
  }

  function populateInitialReels() {
    reels.forEach((reel, c) => {
      reel.container.removeChildren();
      reel.sprites = [];
      for (let r = -1; r <= ROWS; r++) {
        const sym = (r >= 0 && r < ROWS) ? state.currentGrid[r][c] : SYMBOL_KEYS[Math.floor(Math.random() * 8)];
        const sp = new PIXI.Sprite();
        sp.anchor.set(0.5);
        sp.x = CELL_W / 2;
        sp.y = r * CELL_H + CELL_H / 2;
        fitSprite(sp, sym);
        reel.container.addChild(sp);
        reel.sprites.push(sp);
      }
    });
  }

  // --- PARÇACIK & EKRAN SARSINTISI SİSTEMİ ---
  function triggerShake(magnitude = 8, durationMs = 280) {
    state.shakeMag = magnitude;
    state.shakeTime = durationMs;
  }

  function spawnBurst(x, y, count = 26, colors = [0xf6d379, 0xff7b29, 0xffffff]) {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      const size = 2.5 + Math.random() * 4.5;
      const color = colors[Math.floor(Math.random() * colors.length)];
      g.circle(0, 0, size).fill({ color });
      g.x = x;
      g.y = y;
      particleLayer.addChild(g);
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.5 + Math.random() * 8.5;
      state.particles.push({
        gfx: g,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 2,
        gravity: 0.24,
        life: 1,
        decay: 0.02 + Math.random() * 0.025
      });
    }
  }

  // Ana Ticker (Makara Akışı + Parçacıklar + Sarsıntı + Bonus Kıvılcımları)
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const ms = ticker.deltaMS;

    reels.forEach((reel) => {
      if (!reel.spinning) return;
      const step = reel.speed * dt;
      reel.sprites.forEach((sp) => {
        sp.y += step;
        if (sp.y > (ROWS + 0.5) * CELL_H) {
          sp.y -= (ROWS + 2) * CELL_H;
          const randKey = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
          fitSprite(sp, randKey);
        }
      });
    });

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.vx *= 0.985;
      p.vy += p.gravity * dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.life -= p.decay * dt;
      p.gfx.alpha = Math.max(0, p.life);
      if (p.life <= 0) {
        particleLayer.removeChild(p.gfx);
        p.gfx.destroy();
        state.particles.splice(i, 1);
      }
    }

    if (state.inBonus && Math.random() < 0.22) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 1.8 + Math.random() * 2.2).fill({ color: Math.random() < 0.5 ? 0xff7b29 : 0xf6d379 });
      g.x = Math.random() * STAGE_W;
      g.y = STAGE_H + 5;
      particleLayer.addChild(g);
      state.particles.push({
        gfx: g, vx: (Math.random() - 0.5) * 1.1, vy: -(1.4 + Math.random() * 2.2),
        gravity: -0.01, life: 0.9, decay: 0.008
      });
    }

    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - ms);
      const ratio = state.shakeTime / 280;
      const mag = state.shakeMag * ratio;
      root.x = (Math.random() - 0.5) * 2 * mag;
      root.y = (Math.random() - 0.5) * 2 * mag;
      if (state.shakeTime === 0) { root.x = 0; root.y = 0; }
    }
  });

  function clearRoundVisuals() {
    teaseLayer.removeChildren();
    vsLayer.removeChildren();
    lineLayer.removeChildren();
    $('win-banner').classList.add('hidden');
    reels.forEach(r => r.sprites.forEach(sp => {
      sp.alpha = 1;
      if (sp._baseScale) sp.scale.set(sp._baseScale);
    }));
  }

  function showTeaseColumn(col) {
    teaseLayer.removeChildren();
    const g = new PIXI.Graphics();
    g.roundRect(col * CELL_W + 4, 4, CELL_W - 8, BOARD_H - 8, 10)
      .fill({ color: 0xff6a1a, alpha: 0.14 })
      .stroke({ width: 4, color: 0xffae34, alpha: 0.95 });
    teaseLayer.addChild(g);
  }

  async function animateColumnStop(col, grid, scCountSoFar) {
    const reel = reels[col];
    reel.spinning = false;
    reel.container.removeChildren();
    reel.sprites = [];

    let colHasSC = false;
    for (let r = -1; r <= ROWS; r++) {
      const sym = (r >= 0 && r < ROWS) ? grid[r][col] : SYMBOL_KEYS[Math.floor(Math.random() * 8)];
      if (r >= 0 && r < ROWS && sym === 'SC') colHasSC = true;
      const sp = new PIXI.Sprite();
      sp.anchor.set(0.5);
      sp.x = CELL_W / 2;
      sp.y = r * CELL_H + CELL_H / 2 - 28;
      fitSprite(sp, sym);
      reel.container.addChild(sp);
      reel.sprites.push(sp);
    }

    AUDIO.playSfx('stop', { volume: 0.85 });
    if (colHasSC) {
      const pitch = scCountSoFar === 0 ? 1.0 : scCountSoFar === 1 ? 1.15 : 1.32;
      AUDIO.playSfx('scatter_land', { volume: 0.95, rate: pitch });
      spawnBurst(BOARD_X + col * CELL_W + CELL_W / 2, BOARD_Y + BOARD_H / 2, 16, [0x49d6ff, 0xf6d379]);
    }

    const frames = state.turbo ? 6 : 10;
    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const easeOutBack = 1 + 2.1 * Math.pow(t - 1, 3) + 1.1 * Math.pow(t - 1, 2);
      const offset = -28 * (1 - easeOutBack);
      reel.sprites.forEach((sp, idx) => {
        sp.y = (idx - 1) * CELL_H + CELL_H / 2 + offset;
      });
      await sleep(16);
    }
    reel.sprites.forEach((sp, idx) => {
      sp.y = (idx - 1) * CELL_H + CELL_H / 2;
    });
    return colHasSC;
  }

  // --- VS DÜELLO GENİŞLEME VE KILIÇ ÇARPIŞMASI ---
  async function playVSDuels(vsReels) {
    const cols = Object.keys(vsReels).map(Number).sort((a, b) => a - b);
    if (!cols.length) return;

    AUDIO.duckMusic(true);
    for (const col of cols) {
      const info = vsReels[String(col)];
      const colBox = new PIXI.Container();
      colBox.x = col * CELL_W;
      vsLayer.addChild(colBox);

      AUDIO.playSfx('vs_expand', { volume: 0.9 });
      const bg = new PIXI.Graphics();
      bg.roundRect(6, 6, CELL_W - 12, BOARD_H - 12, 10)
        .fill({ color: 0x101724, alpha: 0.96 })
        .stroke({ width: 3.5, color: 0xf6d379, alpha: 1 });
      bg.pivot.set(CELL_W / 2, BOARD_H / 2);
      bg.position.set(CELL_W / 2, BOARD_H / 2);
      bg.scale.y = 0.08;
      colBox.addChild(bg);

      for (let f = 1; f <= 10; f++) {
        bg.scale.y = 0.08 + 0.92 * (f / 10);
        await sleep(state.turbo ? 12 : 20);
      }

      const topTxt = new PIXI.Text({
        text: `${info.left}x`,
        style: { fontFamily: 'Cinzel', fontSize: 42, fontWeight: '900', fill: 0x49d6ff, stroke: { color: 0x050911, width: 5 } }
      });
      topTxt.anchor.set(0.5);
      topTxt.position.set(CELL_W / 2, BOARD_H * 0.24);

      const botTxt = new PIXI.Text({
        text: `${info.right}x`,
        style: { fontFamily: 'Cinzel', fontSize: 42, fontWeight: '900', fill: 0xff7b29, stroke: { color: 0x050911, width: 5 } }
      });
      botTxt.anchor.set(0.5);
      botTxt.position.set(CELL_W / 2, BOARD_H * 0.76);

      const emblem = new PIXI.Sprite(state.textures.VS);
      emblem.anchor.set(0.5);
      const es = Math.min(118 / (emblem.texture.width || 512), 118 / (emblem.texture.height || 512));
      emblem.scale.set(es);
      emblem.position.set(CELL_W / 2, BOARD_H / 2);

      colBox.addChild(topTxt, botTxt, emblem);
      await sleep(state.turbo ? 240 : 480);

      AUDIO.playSfx('vs_clash', { volume: 1.0 });
      triggerShake(11, 320);
      spawnBurst(BOARD_X + col * CELL_W + CELL_W / 2, BOARD_Y + BOARD_H / 2, 42, [0xffe49c, 0xff6a1a, 0x49d6ff, 0xffffff]);

      colBox.removeChild(topTxt, botTxt);
      bg.clear();
      bg.roundRect(6, 6, CELL_W - 12, BOARD_H - 12, 10)
        .fill({ color: 0x261508, alpha: 0.94 })
        .stroke({ width: 4, color: 0xffae34, alpha: 1 });
      emblem.alpha = 0.25;

      const winLabel = new PIXI.Text({
        text: 'WILD',
        style: { fontFamily: 'Cinzel', fontSize: 24, fontWeight: '900', fill: 0xf6d379, letterSpacing: 4 }
      });
      winLabel.anchor.set(0.5);
      winLabel.position.set(CELL_W / 2, BOARD_H * 0.36);

      const winMultTxt = new PIXI.Text({
        text: `${info.winMult}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 56, fontWeight: '900', fill: 0xffffff,
          stroke: { color: 0x8a3b08, width: 6 }, dropShadow: { color: 0xff6a1a, blur: 12, distance: 0 }
        }
      });
      winMultTxt.anchor.set(0.5);
      winMultTxt.position.set(CELL_W / 2, BOARD_H * 0.54);

      colBox.addChild(winLabel, winMultTxt);
      await sleep(state.turbo ? 180 : 380);
    }
    AUDIO.duckMusic(false);
  }

  // --- ÖDEME ÇİZGİLERİ VE KAZANÇ VURGUSU ---
  async function showWinLines(wins, winMoney) {
    if (!wins.length || winMoney <= 0) return;

    AUDIO.playSfx('win', { volume: 0.9 });
    $('win-banner-amount').textContent = RGS.formatMoney(winMoney);
    $('win-banner').classList.remove('hidden');

    const hitCells = new Set();
    wins.forEach((w) => {
      const line = PAYLINES[w.line];
      for (let c = 0; c < w.count; c++) hitCells.add(`${c}_${line[c]}`);
    });

    reels.forEach((reel, c) => {
      reel.sprites.forEach((sp, idx) => {
        const row = idx - 1;
        if (row < 0 || row >= ROWS) return;
        const isHit = hitCells.has(`${c}_${row}`);
        sp.alpha = isHit ? 1.0 : 0.38;
        if (isHit && sp._baseScale) sp.scale.set(sp._baseScale * 1.09);
      });
    });

    lineLayer.removeChildren();
    wins.forEach((w) => {
      const line = PAYLINES[w.line];
      const color = LINE_COLORS[w.line % LINE_COLORS.length];
      const g = new PIXI.Graphics();
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 7, color, alpha: 0.32, join: 'round', cap: 'round' });
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 3, color: 0xffffff, alpha: 0.92, join: 'round', cap: 'round' });
      lineLayer.addChild(g);
    });

    await sleep(state.turbo ? 550 : 1050);
  }

  // --- BIG WIN / MEGA WIN / EPIC WIN / MAX WIN SAYACI ---
  async function showBigWinIfNeeded(totalWinMoney, bet) {
    const mult = totalWinMoney / bet;
    if (mult < 15) return;

    let tier = 'BIG WIN';
    if (mult >= 12500) tier = 'MAX WIN!';
    else if (mult >= 60) tier = 'EPIC WIN';
    else if (mult >= 30) tier = 'MEGA WIN';

    const overlay = $('bigwin-overlay');
    $('bigwin-tier').textContent = tier;
    $('bigwin-amount').textContent = RGS.formatMoney(0);
    overlay.classList.remove('hidden');

    AUDIO.duckMusic(true);
    AUDIO.playSfx('big_win', { volume: 0.95 });
    const counterSfx = AUDIO.playSfx('countup_loop', { volume: 0.72, loop: true });
    triggerShake(10, 400);

    let skipped = false;
    const onSkip = () => { skipped = true; };
    overlay.addEventListener('click', onSkip, { once: true });

    const duration = Math.min(4800, 1800 + mult * 18);
    const start = performance.now();
    while (!skipped) {
      const p = Math.min(1, (performance.now() - start) / duration);
      const val = totalWinMoney * (1 - Math.pow(1 - p, 2.2));
      $('bigwin-amount').textContent = RGS.formatMoney(val);
      if (Math.random() < 0.35) {
        spawnBurst(Math.random() * STAGE_W, Math.random() * STAGE_H * 0.6, 8, [0xf6d379, 0xff7b29, 0xffffff]);
      }
      if (p >= 1) break;
      await sleep(30);
    }

    overlay.removeEventListener('click', onSkip);
    counterSfx.stop(60);
    AUDIO.playSfx('countup_end', { volume: 0.95 });
    $('bigwin-amount').textContent = RGS.formatMoney(totalWinMoney);
    await sleep(skipped ? 650 : 1300);

    overlay.classList.add('hidden');
    AUDIO.duckMusic(false);
  }

  // --- TEK SPİN ANİMASYON AKIŞI ---
  async function runSingleSpinVisual(ev, bet) {
    clearRoundVisuals();
    state.quickStop = false;

    AUDIO.playSfx('spin', { volume: 0.8 });
    reels.forEach((r) => {
      r.spinning = true;
      r.speed = state.turbo ? 58 : 42;
    });

    await sleep(state.turbo ? 160 : 380);

    let scLanded = 0;
    let teaseSfx = null;

    for (let c = 0; c < COLS; c++) {
      const shouldTease = !state.inBonus && !state.quickStop && !state.turbo && scLanded >= 2;
      if (shouldTease) {
        showTeaseColumn(c);
        if (!teaseSfx) teaseSfx = AUDIO.playSfx('anticipation', { volume: 0.85, loop: true });
        reels[c].speed = 64;
        await sleep(950);
      } else if (c > 0 && !state.quickStop) {
        await sleep(state.turbo ? 55 : 150);
      }

      const gotSC = await animateColumnStop(c, ev.grid, scLanded);
      if (gotSC) scLanded++;
    }

    if (teaseSfx) teaseSfx.stop(80);
    teaseLayer.removeChildren();
    state.currentGrid = ev.grid;

    if (ev.vsReels && Object.keys(ev.vsReels).length > 0) {
      await playVSDuels(ev.vsReels);
    }

    const spinWinMoney = +(ev.spinWin * bet).toFixed(2);
    if (spinWinMoney > 0) {
      await showWinLines(ev.wins || [], spinWinMoney);
    }
    return spinWinMoney;
  }

  // --- MODAL BEKLEYİCİ ---
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

  // --- ANA OYUN DÖNGÜSÜ (BASE / BONUS / BUY BONUS) ---
  async function executeRound(mode = 'base') {
    if (state.spinning) {
      state.quickStop = true;
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
    syncMoneyUI(0);

    try {
      const result = await RGS.play(bet, mode);
      const events = result.events || [];
      let runningWin = 0;

      let bonusEvents = events;
      if (events.length && events[0].type === 'spin') {
        const baseWin = await runSingleSpinVisual(events[0], bet);
        runningWin = +(runningWin + baseWin).toFixed(2);
        syncMoneyUI(runningWin);
        bonusEvents = events.slice(1);
      }

      if (bonusEvents.length > 0) {
        state.autoLeft = 0;
        updateAutoUI();

        AUDIO.duckMusic(true);
        AUDIO.playSfx('bonus_trigger', { volume: 1.0 });
        await sleep(500);
        await waitForButton('fs-intro-modal', 'btn-start-fs');
        AUDIO.duckMusic(false);

        setBonusTheme(true);
        const totalFS = bonusEvents.length;

        for (let i = 0; i < totalFS; i++) {
          $('hud-spins').textContent = `${totalFS - i} / ${totalFS}`;
          $('hud-total-win').textContent = RGS.formatMoney(runningWin);

          const fsWin = await runSingleSpinVisual(bonusEvents[i], bet);
          runningWin = +(runningWin + fsWin).toFixed(2);
          $('hud-total-win').textContent = RGS.formatMoney(runningWin);
          syncMoneyUI(runningWin);

          if (fsWin >= bet * 15) {
            await showBigWinIfNeeded(fsWin, bet);
          }
          await sleep(state.turbo ? 180 : 420);
        }

        const totalBonusMoney = +(result.payoutMultiplier * bet).toFixed(2);
        $('fs-outro-amount').textContent = RGS.formatMoney(0);
        $('fs-outro-mult').textContent = `${result.payoutMultiplier.toFixed(2)}× BET`;
        $('fs-outro-modal').classList.remove('hidden');

        const cSfx = AUDIO.playSfx('countup_loop', { volume: 0.7, loop: true });
        const t0 = performance.now();
        const dur = totalBonusMoney > 0 ? 1500 : 100;
        while (true) {
          const p = Math.min(1, (performance.now() - t0) / dur);
          $('fs-outro-amount').textContent = RGS.formatMoney(totalBonusMoney * p);
          if (p >= 1) break;
          await sleep(25);
        }
        cSfx.stop(60);
        if (totalBonusMoney > 0) AUDIO.playSfx('countup_end', { volume: 0.9 });

        await waitForButton('fs-outro-modal', 'btn-end-fs');
        setBonusTheme(false);
      } else if (runningWin >= bet * 15) {
        await showBigWinIfNeeded(runningWin, bet);
      }

      state.balance = result.balanceAfter;
      syncMoneyUI(+(result.payoutMultiplier * bet).toFixed(2));
      await RGS.endRound();
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
        setTimeout(() => executeRound('base'), state.turbo ? 260 : 620);
      }
    }
  }

  function updateAutoUI() {
    const active = state.autoLeft > 0;
    $('btn-auto').classList.toggle('active', active);
    $('auto-count').classList.toggle('hidden', !active);
    $('auto-count').textContent = String(state.autoLeft);
  }

  // --- OLAY DİNLEYİCİLERİ ---
  function bindEvents() {
    $('btn-spin').addEventListener('click', () => {
      if (!state.spinning) AUDIO.playSfx('ui_click', { volume: 0.7 });
      executeRound('base');
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && $('splash-screen').classList.contains('hidden')) {
        e.preventDefault();
        executeRound('base');
      }
    });

    $('btn-bet-down').addEventListener('click', () => {
      if (state.betIndex > 0) {
        state.betIndex--;
        AUDIO.playSfx('ui_click', { volume: 0.8 });
        syncMoneyUI();
      }
    });

    $('btn-bet-up').addEventListener('click', () => {
      if (state.betIndex < RGS.betLevels.length - 1) {
        state.betIndex++;
        AUDIO.playSfx('ui_click', { volume: 0.8 });
        syncMoneyUI();
      }
    });

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

  // --- BAŞLANGIÇ YÜKLEMESİ ---
  async function boot() {
    buildPaytableAndLines();
    bindEvents();

    const setLoad = (pct, label) => {
      $('load-fill').style.width = `${Math.round(pct)}%`;
      $('load-text').textContent = `${label} ${Math.round(pct)}%`;
    };

    try {
      const auth = await RGS.authenticate();
      state.balance = auth.balance;
      $('mode-badge').textContent = auth.mode;
      const defIdx = RGS.betLevels.findIndex(v => v >= 1.0);
      state.betIndex = defIdx >= 0 ? defIdx : 0;
      syncMoneyUI(0);
    } catch (err) {
      showToast('RGS AUTH FAILED — DEMO FALLBACK');
    }

    for (let i = 0; i < SYMBOL_KEYS.length; i++) {
      const key = SYMBOL_KEYS[i];
      try {
        state.textures[key] = await PIXI.Assets.load(`assets/img/${key}.png`);
      } catch (e) {
        console.warn(`[Img] Eksik: assets/img/${key}.png`);
        state.textures[key] = PIXI.Texture.WHITE;
      }
      setLoad(((i + 1) / SYMBOL_KEYS.length) * 65, 'LOADING ASSETS');
    }

    populateInitialReels();

    setLoad(100, 'READY');
    $('load-wrap').classList.add('hidden');
    $('btn-splash-play').classList.remove('hidden');

    $('btn-splash-play').addEventListener('click', async () => {
      $('btn-splash-play').disabled = true;
      $('btn-splash-play').textContent = 'STARTING...';
      AUDIO.ensureContext();
      await AUDIO.preload();
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      $('splash-screen').classList.add('hidden');
      AUDIO.playMusic('base');
    }, { once: true });
  }

  boot();
})();
