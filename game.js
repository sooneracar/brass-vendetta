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
    betIndex: 3,
    balance: 1000,
    turbo: false,
    spinning: false,
    quickStop: false,
    inBonus: false,
    autoLeft: 0,
    textures: {},
    particles: [],
    rings: [],
    floatingTexts: [],
    shakeTime: 0,
    shakeDuration: 280,
    shakeMag: 0,
    pulseTime: 0,
    winningSprites: [],
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
    document.body.classList.toggle('bonus-active', active);
    $('bg-base').classList.toggle('active', !active);
    $('bg-bonus').classList.toggle('active', active);
    $('bonus-hud').classList.toggle('hidden', !active);
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
            <div>5× <b>${p[5]}x</b></div>
            <div>4× <b>${p[4]}x</b></div>
            <div>3× <b>${p[3]}x</b></div>
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

  // YATAY & DİKEY KUSURSUZ EN-BOY ORANI KİLİDİ
  function resizeStage() {
    const wrap = $('stage-wrap');
    if (!wrap) return;
    const availW = Math.max(120, wrap.clientWidth - 12);
    const availH = Math.max(120, wrap.clientHeight - 8);
    const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    app.canvas.style.width = `${Math.floor(STAGE_W * scale)}px`;
    app.canvas.style.height = `${Math.floor(STAGE_H * scale)}px`;
  }
  resizeStage();
  window.addEventListener('resize', resizeStage);
  window.addEventListener('orientationchange', () => setTimeout(resizeStage, 120));
  if (window.ResizeObserver) {
    new ResizeObserver(resizeStage).observe($('stage-wrap'));
  }

  const root = new PIXI.Container();
  app.stage.addChild(root);

  // DÖVME DEMİR & PİRİNÇ AAA TAHTA ÇERÇEVESİ
  const boardGlow = new PIXI.Graphics();
  root.addChild(boardGlow);

  function drawBoardFrame() {
    const frame = new PIXI.Container();

    // Dış gölge ve pirinç kasa
    const outer = new PIXI.Graphics();
    outer.roundRect(BOARD_X - 20, BOARD_Y - 20, BOARD_W + 40, BOARD_H + 40, 20)
      .fill({ color: 0x0b101a, alpha: 0.96 })
      .stroke({ width: 5, color: 0x8f621b, alpha: 1 });
    outer.roundRect(BOARD_X - 16, BOARD_Y - 16, BOARD_W + 32, BOARD_H + 32, 16)
      .stroke({ width: 2, color: 0xf6d379, alpha: 0.85 });
    outer.roundRect(BOARD_X - 6, BOARD_Y - 6, BOARD_W + 12, BOARD_H + 12, 10)
      .fill({ color: 0x080c14, alpha: 0.92 })
      .stroke({ width: 1.5, color: 0x4f3510, alpha: 0.9 });
    frame.addChild(outer);

    // Sütun iç metalik tonlama (düz siyah yerine derinlikli kabin)
    const cells = new PIXI.Graphics();
    for (let c = 0; c < COLS; c++) {
      const colColor = c % 2 === 0 ? 0x0e1421 : 0x0a0f19;
      cells.rect(BOARD_X + c * CELL_W, BOARD_Y, CELL_W, BOARD_H).fill({ color: colColor, alpha: 0.92 });
      for (let r = 0; r < ROWS; r++) {
        cells.roundRect(BOARD_X + c * CELL_W + 5, BOARD_Y + r * CELL_H + 5, CELL_W - 10, CELL_H - 10, 8)
          .stroke({ width: 1, color: 0xc89336, alpha: 0.1 });
      }
    }
    frame.addChild(cells);

    // Dikey pirinç raylar
    const dividers = new PIXI.Graphics();
    for (let c = 1; c < COLS; c++) {
      const x = BOARD_X + c * CELL_W;
      dividers.moveTo(x, BOARD_Y + 4).lineTo(x, BOARD_Y + BOARD_H - 4)
        .stroke({ width: 2, color: 0xc89336, alpha: 0.35 });
    }
    frame.addChild(dividers);

    // Köşe ve kenar perçinleri
    const rivets = new PIXI.Graphics();
    const pts = [
      [BOARD_X - 10, BOARD_Y - 10], [BOARD_X + BOARD_W + 10, BOARD_Y - 10],
      [BOARD_X - 10, BOARD_Y + BOARD_H + 10], [BOARD_X + BOARD_W + 10, BOARD_Y + BOARD_H + 10],
      [BOARD_X + BOARD_W / 2, BOARD_Y - 12], [BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H + 12]
    ];
    pts.forEach(([x, y]) => {
      rivets.circle(x, y, 5.5).fill({ color: 0xdba442 }).stroke({ width: 1.5, color: 0x4a2c08 });
      rivets.circle(x - 1.5, y - 1.5, 1.8).fill({ color: 0xfff3c4, alpha: 0.9 });
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

  // Katmanlar
  const teaseLayer = new PIXI.Container();
  teaseLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(teaseLayer);

  const vsLayer = new PIXI.Container();
  vsLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(vsLayer);

  const lineLayer = new PIXI.Container();
  lineLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(lineLayer);

  const winFrameLayer = new PIXI.Container();
  winFrameLayer.position.set(BOARD_X, BOARD_Y);
  root.addChild(winFrameLayer);

  const fxLayer = new PIXI.Container();
  root.addChild(fxLayer);

  const flashOverlay = new PIXI.Graphics();
  flashOverlay.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0xffe8b0 });
  flashOverlay.alpha = 0;
  root.addChild(flashOverlay);

  // 5 Makara Sütunu
  const reels = [];
  for (let c = 0; c < COLS; c++) {
    const colContainer = new PIXI.Container();
    colContainer.x = c * CELL_W;
    reelsClip.addChild(colContainer);
    reels.push({ col: c, container: colContainer, sprites: [], spinning: false, speed: 0 });
  }

  function fitSprite(sp, symKey) {
    const tex = state.textures[symKey];
    sp.texture = tex || PIXI.Texture.EMPTY;
    const w = tex && tex.width ? tex.width : 512;
    const h = tex && tex.height ? tex.height : 512;
    const maxW = CELL_W * 0.86;
    const maxH = CELL_H * 0.86;
    const scale = Math.min(maxW / w, maxH / h);
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

  // --- EFEKT SİSTEMLERİ (SARSINTI, FLASH, ŞOK DALGASI, PARÇACIK, UÇAN KAZANÇ) ---
  function triggerShake(magnitude = 9, durationMs = 300) {
    state.shakeMag = magnitude;
    state.shakeTime = durationMs;
    state.shakeDuration = durationMs;
  }

  function triggerFlash(alpha = 0.55) {
    flashOverlay.alpha = alpha;
  }

  function spawnShockwave(x, y, color = 0xffae34, maxR = 160) {
    const g = new PIXI.Graphics();
    g.x = x;
    g.y = y;
    fxLayer.addChild(g);
    state.rings.push({ gfx: g, r: 16, maxR, color, life: 1 });
  }

  function spawnBurst(x, y, count = 28, colors = [0xfff0bc, 0xf6d379, 0xff7b29, 0xffffff]) {
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      const size = 2.2 + Math.random() * 4.8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      if (Math.random() < 0.45) {
        g.rect(-size, -size * 0.45, size * 2, size * 0.9).fill({ color });
      } else {
        g.circle(0, 0, size).fill({ color });
      }
      g.x = x;
      g.y = y;
      g.rotation = Math.random() * Math.PI * 2;
      fxLayer.addChild(g);
      const angle = Math.random() * Math.PI * 2;
      const spd = 2.8 + Math.random() * 9.5;
      state.particles.push({
        gfx: g,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 2.4,
        vr: (Math.random() - 0.5) * 0.25,
        gravity: 0.24,
        life: 1,
        decay: 0.018 + Math.random() * 0.022
      });
    }
  }

  function spawnFloatingWin(text, x, y) {
    const t = new PIXI.Text({
      text,
      style: {
        fontFamily: 'Cinzel', fontSize: 44, fontWeight: '900',
        fill: 0xfff2c2,
        stroke: { color: 0x3b1904, width: 7 },
        dropShadow: { color: 0xff6a1a, blur: 14, distance: 0, alpha: 0.95 }
      }
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.scale.set(0.5);
    fxLayer.addChild(t);
    state.floatingTexts.push({ txt: t, life: 1, vy: -0.95 });
  }

  // --- ANA TICKER ---
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime;
    const ms = ticker.deltaMS;
    state.pulseTime += ms * 0.005;

    // Çerçeve ambiyans ışığı
    boardGlow.clear();
    const glowAlpha = state.inBonus
      ? 0.22 + Math.sin(state.pulseTime * 1.6) * 0.1
      : 0.08 + Math.sin(state.pulseTime * 0.8) * 0.03;
    const glowColor = state.inBonus ? 0xff6a1a : 0xc89336;
    boardGlow.roundRect(BOARD_X - 28, BOARD_Y - 28, BOARD_W + 56, BOARD_H + 56, 26)
      .fill({ color: glowColor, alpha: glowAlpha });

    // Makara dönüşü + hareket uzaması (motion blur hissi)
    reels.forEach((reel) => {
      if (!reel.spinning) return;
      const step = reel.speed * dt;
      reel.sprites.forEach((sp) => {
        sp.y += step;
        if (sp.y > (ROWS + 0.5) * CELL_H) {
          sp.y -= (ROWS + 2) * CELL_H;
          const randKey = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
          fitSprite(sp, randKey);
          sp.scale.y = sp._baseScale * 1.18;
          sp.alpha = 0.88;
        }
      });
    });

    // Kazanan sembollerin nabız animasyonu
    if (state.winningSprites.length) {
      const p = 1.07 + Math.sin(state.pulseTime * 2.4) * 0.06;
      state.winningSprites.forEach((sp) => {
        if (sp._baseScale) sp.scale.set(sp._baseScale * p);
      });
    }

    // Ekran flash sönümü
    if (flashOverlay.alpha > 0.005) {
      flashOverlay.alpha = Math.max(0, flashOverlay.alpha - 0.045 * dt);
    } else {
      flashOverlay.alpha = 0;
    }

    // Şok dalgaları
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

    // Parçacıklar
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

    // Uçan kazanç metinleri
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.txt.y += ft.vy * dt;
      const targetScale = ft.life > 0.8 ? 1.15 : 1.0;
      ft.txt.scale.x += (targetScale - ft.txt.scale.x) * 0.2 * dt;
      ft.txt.scale.y = ft.txt.scale.x;
      ft.life -= 0.018 * dt;
      ft.txt.alpha = Math.min(1, ft.life * 2.2);
      if (ft.life <= 0) {
        fxLayer.removeChild(ft.txt);
        ft.txt.destroy();
        state.floatingTexts.splice(i, 1);
      }
    }

    // Bonus kor kıvılcımları
    if (state.inBonus && Math.random() < 0.28) {
      const g = new PIXI.Graphics();
      g.circle(0, 0, 1.8 + Math.random() * 2.6).fill({ color: Math.random() < 0.55 ? 0xff7b29 : 0xfff0bc });
      g.x = Math.random() * STAGE_W;
      g.y = STAGE_H + 6;
      fxLayer.addChild(g);
      state.particles.push({
        gfx: g, vx: (Math.random() - 0.5) * 1.3, vy: -(1.6 + Math.random() * 2.4),
        vr: 0, gravity: -0.012, life: 0.95, decay: 0.008
      });
    }

    // Kamera sarsıntısı
    if (state.shakeTime > 0) {
      state.shakeTime = Math.max(0, state.shakeTime - ms);
      const ratio = state.shakeTime / Math.max(1, state.shakeDuration);
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
    winFrameLayer.removeChildren();
    state.winningSprites = [];
    $('win-banner').classList.add('hidden');
    reels.forEach(r => r.sprites.forEach(sp => {
      sp.alpha = 1;
      if (sp._baseScale) sp.scale.set(sp._baseScale);
    }));
  }

  function showTeaseColumn(col) {
    teaseLayer.removeChildren();
    const g = new PIXI.Graphics();
    g.roundRect(col * CELL_W + 3, 3, CELL_W - 6, BOARD_H - 6, 10)
      .fill({ color: 0xff6a1a, alpha: 0.18 })
      .stroke({ width: 5, color: 0xffbe42, alpha: 0.95 });
    g.roundRect(col * CELL_W + 8, 8, CELL_W - 16, BOARD_H - 16, 7)
      .stroke({ width: 2, color: 0xfff2c2, alpha: 0.7 });
    teaseLayer.addChild(g);
  }

  async function animateColumnStop(col, grid, scCountSoFar) {
    const reel = reels[col];
    reel.spinning = false;
    reel.container.removeChildren();
    reel.sprites = [];

    let colHasSC = false;
    let colHasVS = false;
    let scRow = 1;
    for (let r = -1; r <= ROWS; r++) {
      const sym = (r >= 0 && r < ROWS) ? grid[r][col] : SYMBOL_KEYS[Math.floor(Math.random() * 8)];
      if (r >= 0 && r < ROWS && sym === 'SC') { colHasSC = true; scRow = r; }
      if (r >= 0 && r < ROWS && sym === 'VS') colHasVS = true;
      const sp = new PIXI.Sprite();
      sp.anchor.set(0.5);
      sp.x = CELL_W / 2;
      sp.y = r * CELL_H + CELL_H / 2 - 34;
      fitSprite(sp, sym);
      reel.container.addChild(sp);
      reel.sprites.push(sp);
    }

    AUDIO.playSfx('stop', { volume: 0.85 });
    if (colHasSC) {
      const pitch = scCountSoFar === 0 ? 1.0 : scCountSoFar === 1 ? 1.15 : 1.32;
      AUDIO.playSfx('scatter_land', { volume: 0.95, rate: pitch });
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + scRow * CELL_H + CELL_H / 2;
      spawnShockwave(cx, cy, 0xffae34, 110);
      spawnBurst(cx, cy, 24, [0xfff0bc, 0xff7b29, 0x49d6ff]);
      triggerShake(5, 160);
    } else if (colHasVS) {
      const cx = BOARD_X + col * CELL_W + CELL_W / 2;
      const cy = BOARD_Y + BOARD_H / 2;
      spawnBurst(cx, cy, 16, [0x49d6ff, 0xff7b29]);
    }

    const frames = state.turbo ? 6 : 11;
    for (let f = 1; f <= frames; f++) {
      const t = f / frames;
      const easeOutBack = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      const offset = -34 * (1 - easeOutBack);
      reel.sprites.forEach((sp, idx) => {
        sp.y = (idx - 1) * CELL_H + CELL_H / 2 + offset;
      });
      await sleep(15);
    }
    reel.sprites.forEach((sp, idx) => {
      sp.y = (idx - 1) * CELL_H + CELL_H / 2;
    });
    return colHasSC;
  }

  // --- AAA SİNEMATİK VS DÜELLO & ÇARPAN PATLAMASI ---
  async function playVSDuels(vsReels) {
    const cols = Object.keys(vsReels).map(Number).sort((a, b) => a - b);
    if (!cols.length) return;

    AUDIO.duckMusic(true);
    for (const col of cols) {
      const info = vsReels[String(col)];
      const colBox = new PIXI.Container();
      colBox.x = col * CELL_W;
      vsLayer.addChild(colBox);

      const centerX = BOARD_X + col * CELL_W + CELL_W / 2;
      const centerY = BOARD_Y + BOARD_H / 2;

      // 1. Zırhlı Sütun Genişleme
      AUDIO.playSfx('vs_expand', { volume: 0.95 });
      spawnBurst(centerX, centerY, 22, [0x49d6ff, 0xff7b29, 0xfff0bc]);

      const duelArena = new PIXI.Container();
      duelArena.pivot.set(CELL_W / 2, BOARD_H / 2);
      duelArena.position.set(CELL_W / 2, BOARD_H / 2);
      duelArena.scale.y = 0.06;
      colBox.addChild(duelArena);

      // Üst Buz Mavisi / Alt Kor Turuncu Düello Zemini
      const arenaGfx = new PIXI.Graphics();
      arenaGfx.roundRect(5, 5, CELL_W - 10, BOARD_H / 2 - 5, 10)
        .fill({ color: 0x0f2d47, alpha: 0.96 });
      arenaGfx.roundRect(5, BOARD_H / 2, CELL_W - 10, BOARD_H / 2 - 5, 10)
        .fill({ color: 0x4d1906, alpha: 0.96 });
      // Çarpışma orta enerji hattı
      arenaGfx.moveTo(8, BOARD_H / 2).lineTo(CELL_W - 8, BOARD_H / 2)
        .stroke({ width: 5, color: 0xfff0bc, alpha: 0.9 });
      arenaGfx.roundRect(5, 5, CELL_W - 10, BOARD_H - 10, 10)
        .stroke({ width: 4, color: 0xf6d379, alpha: 1 });
      duelArena.addChild(arenaGfx);

      for (let f = 1; f <= 10; f++) {
        const p = f / 10;
        duelArena.scale.y = 0.06 + 0.94 * (1 - Math.pow(1 - p, 3));
        await sleep(state.turbo ? 12 : 18);
      }

      // Üst & Alt Savaşçı Çarpanları
      const topTxt = new PIXI.Text({
        text: `${info.left}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 48, fontWeight: '900', fill: 0x7ce6ff,
          stroke: { color: 0x041322, width: 6 },
          dropShadow: { color: 0x49d6ff, blur: 12, distance: 0, alpha: 0.9 }
        }
      });
      topTxt.anchor.set(0.5);
      topTxt.position.set(CELL_W / 2, BOARD_H * 0.23);

      const botTxt = new PIXI.Text({
        text: `${info.right}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 48, fontWeight: '900', fill: 0xffb36b,
          stroke: { color: 0x290a02, width: 6 },
          dropShadow: { color: 0xff6a1a, blur: 12, distance: 0, alpha: 0.9 }
        }
      });
      botTxt.anchor.set(0.5);
      botTxt.position.set(CELL_W / 2, BOARD_H * 0.77);

      // Merkez VS Amblemi (VS.png varsa görseli, yoksa metalik rozet)
      let emblem;
      if (state.textures.VS && state.textures.VS !== PIXI.Texture.EMPTY) {
        emblem = new PIXI.Sprite(state.textures.VS);
        emblem.anchor.set(0.5);
        const es = Math.min(126 / (emblem.texture.width || 512), 126 / (emblem.texture.height || 512));
        emblem.scale.set(es);
      } else {
        emblem = new PIXI.Text({
          text: 'VS',
          style: { fontFamily: 'Cinzel', fontSize: 46, fontWeight: '900', fill: 0xf6d379, stroke: { color: 0x261204, width: 6 } }
        });
        emblem.anchor.set(0.5);
      }
      emblem.position.set(CELL_W / 2, BOARD_H / 2);

      duelArena.addChild(topTxt, botTxt, emblem);

      // Düello gerilim titreşimi
      const tensionSteps = state.turbo ? 6 : 14;
      for (let s = 0; s < tensionSteps; s++) {
        const j = (s / tensionSteps) * 5;
        emblem.x = CELL_W / 2 + (Math.random() - 0.5) * j * 2;
        topTxt.scale.set(1 + (s % 2 === 0 ? 0.08 : -0.04));
        botTxt.scale.set(1 + (s % 2 === 1 ? 0.08 : -0.04));
        await sleep(32);
      }

      // 2. KILIÇ ÇARPIŞMASI — ÇAPRAZ IŞIK KESİĞİ + FLASH + ŞOK DALGASI + KIVILCIM
      AUDIO.playSfx('vs_clash', { volume: 1.0 });
      triggerShake(14, 380);
      triggerFlash(0.42);
      spawnShockwave(centerX, centerY, 0xfff0bc, 190);
      spawnShockwave(centerX, centerY, 0xff6a1a, 130);
      spawnBurst(centerX, centerY, 56, [0xffffff, 0xfff0bc, 0xff7b29, 0x49d6ff]);

      // Çapraz Kılıç Kesiği Işığı (Slash Flare)
      const slash = new PIXI.Graphics();
      slash.moveTo(-10, BOARD_H * 0.72).lineTo(CELL_W + 10, BOARD_H * 0.28)
        .stroke({ width: 16, color: 0xffae34, alpha: 0.75, cap: 'round' });
      slash.moveTo(-10, BOARD_H * 0.72).lineTo(CELL_W + 10, BOARD_H * 0.28)
        .stroke({ width: 6, color: 0xffffff, alpha: 1, cap: 'round' });
      colBox.addChild(slash);

      for (let f = 1; f <= 6; f++) {
        slash.alpha = 1 - f / 6;
        await sleep(22);
      }
      colBox.removeChild(slash);
      slash.destroy();

      // 3. KAZANAN ÇARPAN MÜHRÜ (Tam Sütun WILD)
      const isTopWinner = info.winMult === info.left && info.left !== info.right;
      const winBgColor = isTopWinner ? 0x133554 : 0x3b1807;
      const winAccent = isTopWinner ? 0x49d6ff : 0xff9f43;

      duelArena.removeChildren();
      const finalBg = new PIXI.Graphics();
      finalBg.roundRect(5, 5, CELL_W - 10, BOARD_H - 10, 10)
        .fill({ color: winBgColor, alpha: 0.94 })
        .stroke({ width: 4.5, color: 0xf6d379, alpha: 1 });
      finalBg.roundRect(11, 11, CELL_W - 22, BOARD_H - 22, 7)
        .stroke({ width: 2, color: winAccent, alpha: 0.75 });
      duelArena.addChild(finalBg);

      if (state.textures.VS && state.textures.VS !== PIXI.Texture.EMPTY) {
        const bgEmb = new PIXI.Sprite(state.textures.VS);
        bgEmb.anchor.set(0.5);
        const es = Math.min(138 / (bgEmb.texture.width || 512), 138 / (bgEmb.texture.height || 512));
        bgEmb.scale.set(es);
        bgEmb.position.set(CELL_W / 2, BOARD_H * 0.28);
        bgEmb.alpha = 0.85;
        duelArena.addChild(bgEmb);
      }

      const winLabel = new PIXI.Text({
        text: 'WILD REEL',
        style: {
          fontFamily: 'Cinzel', fontSize: 19, fontWeight: '900',
          fill: 0xf6d379, letterSpacing: 2.5,
          stroke: { color: 0x090603, width: 4 }
        }
      });
      winLabel.anchor.set(0.5);
      winLabel.position.set(CELL_W / 2, BOARD_H * 0.56);

      const winMultTxt = new PIXI.Text({
        text: `${info.winMult}×`,
        style: {
          fontFamily: 'Cinzel', fontSize: 60, fontWeight: '900', fill: 0xffffff,
          stroke: { color: 0x6b2c06, width: 7 },
          dropShadow: { color: winAccent, blur: 16, distance: 0, alpha: 1 }
        }
      });
      winMultTxt.anchor.set(0.5);
      winMultTxt.position.set(CELL_W / 2, BOARD_H * 0.74);
      winMultTxt.scale.set(0.35);

      duelArena.addChild(winLabel, winMultTxt);

      // Çarpan elastik büyüme (punch-in)
      for (let f = 1; f <= 8; f++) {
        const t = f / 8;
        const pop = 1 + 1.8 * Math.pow(t - 1, 3) + 0.9 * Math.pow(t - 1, 2);
        winMultTxt.scale.set(0.35 + 0.65 * pop);
        await sleep(16);
      }
      winMultTxt.scale.set(1);

      await sleep(state.turbo ? 200 : 420);
    }
    AUDIO.duckMusic(false);
  }

  // --- ÖDEME ÇİZGİLERİ, ALTIN HÜCRE ÇERÇEVELERİ VE UÇAN KAZANÇ ---
  async function showWinLines(wins, winMoney) {
    if (!wins.length || winMoney <= 0) return;

    AUDIO.playSfx('win', { volume: 0.92 });
    $('win-banner-amount').textContent = RGS.formatMoney(winMoney);
    $('win-banner').classList.remove('hidden');

    const hitCells = new Set();
    wins.forEach((w) => {
      const line = PAYLINES[w.line];
      for (let c = 0; c < w.count; c++) hitCells.add(`${c}_${line[c]}`);
    });

    state.winningSprites = [];
    reels.forEach((reel, c) => {
      reel.sprites.forEach((sp, idx) => {
        const row = idx - 1;
        if (row < 0 || row >= ROWS) return;
        const isHit = hitCells.has(`${c}_${row}`);
        sp.alpha = isHit ? 1.0 : 0.34;
        if (isHit) state.winningSprites.push(sp);
      });
    });

    // Kazanan her hücrenin etrafına parlayan altın çerçeve çiz
    winFrameLayer.removeChildren();
    const framesGfx = new PIXI.Graphics();
    hitCells.forEach((key) => {
      const [c, r] = key.split('_').map(Number);
      const x = c * CELL_W + 6;
      const y = r * CELL_H + 6;
      framesGfx.roundRect(x, y, CELL_W - 12, CELL_H - 12, 12)
        .fill({ color: 0xf6d379, alpha: 0.1 })
        .stroke({ width: 5, color: 0xff8c24, alpha: 0.45 });
      framesGfx.roundRect(x + 2, y + 2, CELL_W - 16, CELL_H - 16, 10)
        .stroke({ width: 2.5, color: 0xfff0bc, alpha: 0.95 });
    });
    winFrameLayer.addChild(framesGfx);

    // Çok katmanlı neon-pirinç ödeme çizgileri + düğüm noktaları
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
      g.stroke({ width: 10, color, alpha: 0.35, join: 'round', cap: 'round' });
      for (let c = 0; c < w.count; c++) {
        const x = c * CELL_W + CELL_W / 2;
        const y = line[c] * CELL_H + CELL_H / 2;
        if (c === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 3.5, color: 0xfff8dc, alpha: 0.95, join: 'round', cap: 'round' });
      for (let c = 0; c < w.count; c++) {
        g.circle(c * CELL_W + CELL_W / 2, line[c] * CELL_H + CELL_H / 2, 5.5)
          .fill({ color: 0xffffff }).stroke({ width: 2, color });
      }
      lineLayer.addChild(g);
    });

    // Tahta merkezinde uçan kazanç tutarı + kıvılcım
    spawnFloatingWin(`+${RGS.formatMoney(winMoney)}`, STAGE_W / 2, STAGE_H / 2 - 10);
    spawnBurst(STAGE_W / 2, STAGE_H / 2, 24, [0xfff0bc, 0xf6d379, 0xff7b29]);

    await sleep(state.turbo ? 580 : 1120);
  }

  // --- BIG WIN / MEGA WIN / EPIC WIN / MAX WIN ---
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
    triggerShake(11, 420);
    triggerFlash(0.45);

    let skipped = false;
    const onSkip = () => { skipped = true; };
    overlay.addEventListener('click', onSkip, { once: true });

    const duration = Math.min(4800, 1800 + mult * 18);
    const start = performance.now();
    while (!skipped) {
      const p = Math.min(1, (performance.now() - start) / duration);
      const val = totalWinMoney * (1 - Math.pow(1 - p, 2.2));
      $('bigwin-amount').textContent = RGS.formatMoney(val);
      if (Math.random() < 0.42) {
        spawnBurst(Math.random() * STAGE_W, Math.random() * STAGE_H * 0.55, 10, [0xfff0bc, 0xf6d379, 0xff7b29]);
      }
      if (p >= 1) break;
      await sleep(30);
    }

    overlay.removeEventListener('click', onSkip);
    counterSfx.stop(60);
    AUDIO.playSfx('countup_end', { volume: 0.95 });
    $('bigwin-amount').textContent = RGS.formatMoney(totalWinMoney);
    await sleep(skipped ? 650 : 1350);

    overlay.classList.add('hidden');
    AUDIO.duckMusic(false);
  }

  // --- TEK SPİN AKIŞI ---
  async function runSingleSpinVisual(ev, bet) {
    clearRoundVisuals();
    state.quickStop = false;

    AUDIO.playSfx('spin', { volume: 0.82 });

    // Kısa yukarı kalkış tepkisi (spin ağırlığı)
    if (!state.turbo) {
      reels.forEach(r => r.sprites.forEach(sp => { sp.y -= 14; }));
      await sleep(55);
    }

    reels.forEach((r) => {
      r.spinning = true;
      r.speed = state.turbo ? 62 : 46;
      r.sprites.forEach((sp) => {
        if (sp._baseScale) sp.scale.y = sp._baseScale * 1.18;
        sp.alpha = 0.88;
      });
    });

    await sleep(state.turbo ? 150 : 360);

    let scLanded = 0;
    let teaseSfx = null;

    for (let c = 0; c < COLS; c++) {
      const shouldTease = !state.inBonus && !state.quickStop && !state.turbo && scLanded >= 2;
      if (shouldTease) {
        showTeaseColumn(c);
        if (!teaseSfx) teaseSfx = AUDIO.playSfx('anticipation', { volume: 0.85, loop: true });
        reels[c].speed = 68;
        await sleep(920);
      } else if (c > 0 && !state.quickStop) {
        await sleep(state.turbo ? 55 : 145);
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
        triggerFlash(0.4);
        await sleep(480);
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
      // Müziği dokunuş anında hemen başlat (Chrome autoplay kilidi anında açılır)
      AUDIO.playMusic('base');
      await AUDIO.preload();
      AUDIO.playSfx('ui_click', { volume: 0.8 });
      $('splash-screen').classList.add('hidden');
      resizeStage();
    }, { once: true });
  }

  boot();
})();
