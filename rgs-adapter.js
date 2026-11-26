(() => {
  const API_SCALE = 1000000; // Stake Engine micro-unit standard (1.00 = 1,000,000)
  const MAX_BONUS_SPINS = 40;
  const DEMO_STORAGE_KEY = 'bv_pending_round_v5';
  const DEMO_BAL_KEY = 'bv_demo_balance_v5';

  const PAYLINES = [
    [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],
    [0,1,2,1,0],[3,2,1,2,3],[0,0,1,2,2],[3,3,2,1,1],
    [1,0,0,0,1],[2,3,3,3,2],[1,2,3,2,1],[2,1,0,1,2],
    [0,1,1,1,0],[3,2,2,2,3]
  ];

  const PAYTABLE = {
    L1: { 3: 0.1, 4: 0.3, 5: 0.8 },
    L2: { 3: 0.1, 4: 0.4, 5: 1.0 },
    L3: { 3: 0.2, 4: 0.5, 5: 1.2 },
    L4: { 3: 0.2, 4: 0.6, 5: 1.5 },
    H1: { 3: 0.4, 4: 1.2, 5: 4.0 },
    H2: { 3: 0.5, 4: 1.8, 5: 6.0 },
    H3: { 3: 0.8, 4: 2.5, 5: 10.0 },
    H4: { 3: 1.2, 4: 4.0, 5: 15.0 },
    W:  { 3: 1.2, 4: 4.0, 5: 15.0 }
  };

  const BASE_POOL = [
    ...Array(30).fill('L1'), ...Array(28).fill('L2'), ...Array(26).fill('L3'), ...Array(24).fill('L4'),
    ...Array(12).fill('H1'), ...Array(10).fill('H2'), ...Array(8).fill('H3'), ...Array(5).fill('H4'),
    ...Array(3).fill('W'),   ...Array(2).fill('VS'),  ...Array(3).fill('SC')
  ];
  const BONUS_POOL = [
    ...Array(22).fill('L1'), ...Array(22).fill('L2'), ...Array(20).fill('L3'), ...Array(18).fill('L4'),
    ...Array(14).fill('H1'), ...Array(12).fill('H2'), ...Array(10).fill('H3'), ...Array(8).fill('H4'),
    ...Array(5).fill('W'),   ...Array(4).fill('VS'),  ...Array(2).fill('SC')
  ];
  const TRIGGER_FILL = [
    ...Array(12).fill('L1'), ...Array(12).fill('L2'), ...Array(12).fill('L3'), ...Array(12).fill('L4'),
    ...Array(8).fill('H1'),  ...Array(8).fill('H2'),  ...Array(6).fill('H3'),  ...Array(4).fill('H4')
  ];
  const VS_MULTS = [2, 3, 4, 5, 8, 10, 15, 20, 25, 50, 100];
  const VS_W     = [35, 25, 16, 10, 5, 4, 2, 1.2, 0.8, 0.6, 0.4];

  const CURRENCY_META = {
    USD:  { sym: '$',     minDec: 2, maxDec: 2 },
    EUR:  { sym: '€',     minDec: 2, maxDec: 2 },
    GBP:  { sym: '£',     minDec: 2, maxDec: 2 },
    CAD:  { sym: 'CA$',   minDec: 2, maxDec: 2 },
    AUD:  { sym: 'A$',    minDec: 2, maxDec: 2 },
    MXN:  { sym: 'MX$',   minDec: 2, maxDec: 2 },
    TRY:  { sym: '₺',     minDec: 2, maxDec: 2 },
    JPY:  { sym: '¥',     minDec: 0, maxDec: 0 },
    KRW:  { sym: '₩',     minDec: 0, maxDec: 0 },
    USDT: { sym: 'USDT ', minDec: 2, maxDec: 2 },
    USDC: { sym: 'USDC ', minDec: 2, maxDec: 2 },
    BTC:  { sym: 'BTC ',  minDec: 4, maxDec: 8 },
    ETH:  { sym: 'ETH ',  minDec: 4, maxDec: 6 },
    SC:   { sym: 'SC ',   minDec: 2, maxDec: 2 },
    GC:   { sym: 'GC ',   minDec: 2, maxDec: 2 },
    XSC:  { sym: 'SC ',   minDec: 2, maxDec: 2 },
    XGC:  { sym: 'GC ',   minDec: 2, maxDec: 2 }
  };

  function pickWeighted(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[0];
  }

  function makeGrid(pool, allowSC = true) {
    const g = Array.from({ length: 4 }, () => Array(5).fill('L1'));
    for (let c = 0; c < 5; c++) {
      let colHasSC = false;
      for (let r = 0; r < 4; r++) {
        let sym = pool[Math.floor(Math.random() * pool.length)];
        if (sym === 'SC' && (!allowSC || colHasSC)) sym = 'L2';
        if (sym === 'SC') colHasSC = true;
        g[r][c] = sym;
      }
    }
    return g;
  }

  function evalSpin(grid) {
    const vsReels = {};
    for (let c = 0; c < 5; c++) {
      let hasVS = false;
      for (let r = 0; r < 4; r++) if (grid[r][c] === 'VS') hasVS = true;
      if (hasVS) {
        const left = pickWeighted(VS_MULTS, VS_W);
        const right = pickWeighted(VS_MULTS, VS_W);
        const winMult = Math.random() < 0.6 ? Math.max(left, right) : Math.min(left, right);
        vsReels[String(c)] = { left, right, winMult };
      }
    }
    let total = 0;
    const wins = [];
    PAYLINES.forEach((line, idx) => {
      const syms = line.map((row, c) => (vsReels[String(c)] ? 'W' : grid[row][c]));
      const target = syms.find(s => s !== 'W' && s !== 'SC') || 'W';
      if (target === 'SC') return;
      let count = 0;
      let lineMult = 0;
      for (let c = 0; c < 5; c++) {
        if (syms[c] === target || syms[c] === 'W') {
          count++;
          if (vsReels[String(c)]) lineMult += vsReels[String(c)].winMult;
        } else break;
      }
      if (count >= 3 && PAYTABLE[target]) {
        const mult = lineMult > 0 ? lineMult : 1;
        const win = +(PAYTABLE[target][count] * mult).toFixed(2);
        total = +(total + win).toFixed(2);
        wins.push({ line: idx, symbol: target, count, mult, win });
      }
    });
    return { spinWin: total, vsReels, wins };
  }

  function makeTriggerGrid() {
    for (let tries = 0; tries < 200; tries++) {
      const g = Array.from({ length: 4 }, () =>
        Array.from({ length: 5 }, () => TRIGGER_FILL[Math.floor(Math.random() * TRIGGER_FILL.length)])
      );
      const cols = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, 3);
      cols.forEach(c => { g[Math.floor(Math.random() * 4)][c] = 'SC'; });
      if (evalSpin(g).spinWin === 0) return g;
    }
    return [
      ['SC','L2','L3','L4','H1'],
      ['L2','SC','L1','H2','L3'],
      ['L4','L3','SC','L1','H2'],
      ['H1','L4','L2','H3','L1']
    ];
  }

  function runDemoBonusSequence(events, startCumWin) {
    let totalSpins = 10;
    let cumWin = startCumWin;
    let s = 0;
    while (s < totalSpins) {
      const grid = makeGrid(BONUS_POOL, true);
      const scCount = grid.flat().filter(x => x === 'SC').length;
      let added = scCount >= 3 ? 5 : (scCount === 2 ? 2 : 0);
      if (totalSpins + added > MAX_BONUS_SPINS) added = Math.max(0, MAX_BONUS_SPINS - totalSpins);

      const res = evalSpin(grid);
      const newCum = Math.min(12500, +(cumWin + res.spinWin).toFixed(2));
      const actualSpinWin = +(newCum - cumWin).toFixed(2);
      cumWin = newCum;

      if (cumWin >= 12500) added = 0;
      else totalSpins += added;
      const spinsLeft = cumWin >= 12500 ? 0 : totalSpins - (s + 1);

      events.push({
        index: events.length,
        type: 'bonusSpin',
        grid,
        vsReels: res.vsReels,
        wins: res.wins,
        spinWin: actualSpinWin,
        cumWin,
        scatters: scCount,
        retriggerSpins: added,
        spinsLeft,
        totalSpins
      });
      if (cumWin >= 12500) break;
      s++;
    }
    return cumWin;
  }

  // GitHub Pages ?replay=1 testi için deterministik çift VS vitrin turu
  function buildShowcaseReplay(betAmount) {
    const grid = [
      ['H4', 'VS', 'H4', 'VS', 'H4'],
      ['L1', 'H3', 'L2', 'H2', 'L3'],
      ['H2', 'L4', 'W',  'L1', 'H1'],
      ['L3', 'L2', 'H3', 'L4', 'L2']
    ];
    const vsReels = {
      '1': { left: 4, right: 10, winMult: 10 },
      '3': { left: 5, right: 2,  winMult: 5 }
    };
    const wins = [
      { line: 0, symbol: 'H4', count: 5, mult: 15, win: 225.0 }
    ];
    return {
      balanceBeforeWin: 0,
      balanceAfter: 0,
      betAmount,
      events: [{ index: 0, type: 'spin', grid, vsReels, wins, spinWin: 225.0, cumWin: 225.0, scatters: 0, retriggerSpins: 0 }],
      payoutMultiplier: 225.0,
      triggeredBonus: false
    };
  }

  class RGSAdapter {
    constructor() {
      const p = new URLSearchParams(window.location.search);
      this.rgsUrl = p.get('rgs_url') || '';
      this.sessionID = p.get('sessionID') || '';
      this.currency = (p.get('currency') || 'USD').toUpperCase();
      this.isSocial = p.get('social') === 'true' || p.get('social') === '1' || this.currency === 'XSC' || this.currency === 'XGC';
      this.isReplay = p.get('replay') === 'true' || p.get('replay') === '1';
      this.replayMeta = {
        game: p.get('game') || '',
        version: p.get('version') || '',
        mode: p.get('mode') || 'base',
        event: p.get('event') || '',
        amount: Number(p.get('amount') || 0)
      };
      this.isLive = Boolean(!this.isReplay && this.rgsUrl && this.sessionID && p.get('demo') !== '1');
      this.balance = 1000.0;
      this.betLevels = [0.2, 0.4, 0.6, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0];
      this.defaultBetLevel = 1.0;

      if (!this.isLive && !this.isReplay) {
        const savedBal = Number(localStorage.getItem(DEMO_BAL_KEY));
        if (Number.isFinite(savedBal) && savedBal > 0) this.balance = savedBal;
      }
    }

    formatMoney(val) {
      const num = Number(val || 0);
      const meta = CURRENCY_META[this.currency] || { sym: `${this.currency} `, minDec: 2, maxDec: 2 };
      const formatted = num.toLocaleString('en-US', {
        minimumFractionDigits: meta.minDec,
        maximumFractionDigits: meta.maxDec
      });
      return `${meta.sym}${formatted}`;
    }

    _saveDemoPending(payload) {
      try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(payload)); } catch (_) {}
    }

    _loadDemoPending() {
      try {
        const raw = localStorage.getItem(DEMO_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (_) { return null; }
    }

    _clearDemoPending() {
      try { localStorage.removeItem(DEMO_STORAGE_KEY); } catch (_) {}
    }

    _saveDemoBalance() {
      try { localStorage.setItem(DEMO_BAL_KEY, String(this.balance)); } catch (_) {}
    }

    // ZORUNLU STAKE ENGINE REPLAY VERİSİ ÇEKME
    async fetchReplayRound() {
      const rawAmt = this.replayMeta.amount;
      const betAmount = rawAmt > 0
        ? (rawAmt >= 10000 ? rawAmt / API_SCALE : rawAmt)
        : 1.0;

      if (this.rgsUrl && this.replayMeta.game && this.replayMeta.event) {
        const base = this.rgsUrl.replace(/\/$/, '');
        const { game, version, mode, event } = this.replayMeta;
        const url = `${base}/bet/replay/${encodeURIComponent(game)}/${encodeURIComponent(version)}/${encodeURIComponent(mode)}/${encodeURIComponent(event)}`;
        const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`Replay fetch failed (${res.status})`);
        const data = await res.json();
        const events = data.state || data.events || data.round?.state || data.round?.events || [];
        const rawMult = data.payoutMultiplier ?? data.round?.payoutMultiplier ?? 0;
        return {
          balanceBeforeWin: 0,
          balanceAfter: 0,
          betAmount,
          events,
          payoutMultiplier: rawMult / 100,
          triggeredBonus: mode === 'bonus' || events.length > 1
        };
      }
      return buildShowcaseReplay(betAmount);
    }

    async authenticate() {
      if (this.isReplay) {
        return {
          balance: 0,
          betLevels: this.betLevels,
          defaultBetLevel: this.defaultBetLevel,
          mode: 'REPLAY',
          pendingRound: null
        };
      }

      if (!this.isLive) {
        const pendingRound = this._loadDemoPending();
        return {
          balance: pendingRound ? pendingRound.balanceBeforeWin : this.balance,
          betLevels: this.betLevels,
          defaultBetLevel: this.defaultBetLevel,
          mode: 'DEMO',
          pendingRound
        };
      }

      const res = await fetch(`${this.rgsUrl.replace(/\/$/, '')}/wallet/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: this.sessionID })
      });
      if (!res.ok) throw new Error(`Auth failed (${res.status})`);
      const data = await res.json();
      this.balance = (data.balance?.amount ?? 0) / API_SCALE;
      this.currency = (data.balance?.currency || this.currency).toUpperCase();
      if (this.currency === 'XSC' || this.currency === 'XGC') this.isSocial = true;

      if (Array.isArray(data.config?.betLevels) && data.config.betLevels.length) {
        this.betLevels = data.config.betLevels.map(v => v / API_SCALE);
      }
      if (typeof data.config?.defaultBetLevel === 'number' && data.config.defaultBetLevel > 0) {
        this.defaultBetLevel = data.config.defaultBetLevel / API_SCALE;
      } else {
        this.defaultBetLevel = this.betLevels[0];
      }

      let pendingRound = null;
      const activeEvents = data.round?.state || data.round?.events;
      if (data.round && Array.isArray(activeEvents) && activeEvents.length > 0) {
        pendingRound = {
          balanceBeforeWin: this.balance,
          balanceAfter: this.balance,
          betAmount: data.round.amount ? data.round.amount / API_SCALE : this.defaultBetLevel,
          events: activeEvents,
          payoutMultiplier: (data.round.payoutMultiplier ?? 0) / 100,
          triggeredBonus: activeEvents.length > 1 || activeEvents[0]?.type === 'buyTrigger' || activeEvents[0]?.type === 'bonusSpin'
        };
      }
      return {
        balance: this.balance,
        betLevels: this.betLevels,
        defaultBetLevel: this.defaultBetLevel,
        mode: 'LIVE',
        pendingRound
      };
    }

    async play(betAmount, mode = 'base') {
      const cost = mode === 'bonus' ? betAmount * 100 : betAmount;
      if (this.isLive) {
        const res = await fetch(`${this.rgsUrl.replace(/\/$/, '')}/wallet/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionID: this.sessionID,
            amount: Math.round(betAmount * API_SCALE),
            mode
          })
        });
        if (!res.ok) throw new Error(`Play failed (${res.status})`);
        const data = await res.json();
        this.balance = (data.balance?.amount ?? 0) / API_SCALE;
        const events = data.round?.state || data.round?.events || [];
        return {
          balanceBeforeWin: this.balance,
          balanceAfter: this.balance,
          betAmount,
          events,
          payoutMultiplier: (data.round?.payoutMultiplier ?? 0) / 100,
          triggeredBonus: mode === 'bonus' || events.length > 1
        };
      }

      if (this.balance < cost) throw new Error('INSUFFICIENT BALANCE');
      const balanceBeforeWin = +(this.balance - cost).toFixed(8);
      const events = [];
      let cumWin = 0;
      let triggeredBonus = false;

      if (mode === 'bonus') {
        triggeredBonus = true;
        events.push({
          index: 0, type: 'buyTrigger', grid: makeTriggerGrid(), vsReels: {}, wins: [],
          spinWin: 0, cumWin: 0, scatters: 3, retriggerSpins: 0
        });
        cumWin = runDemoBonusSequence(events, 0);
      } else {
        const grid = makeGrid(BASE_POOL, true);
        const scCount = grid.flat().filter(s => s === 'SC').length;
        const { spinWin, vsReels, wins } = evalSpin(grid);
        cumWin = Math.min(12500, spinWin);
        events.push({
          index: 0, type: 'spin', grid, vsReels, wins,
          spinWin: cumWin, cumWin, scatters: scCount, retriggerSpins: 0
        });
        if (scCount >= 3 && cumWin < 12500) {
          triggeredBonus = true;
          cumWin = runDemoBonusSequence(events, cumWin);
        }
      }

      const totalPayout = +(cumWin * betAmount).toFixed(8);
      const balanceAfter = +(balanceBeforeWin + totalPayout).toFixed(8);
      this.balance = balanceAfter;

      const roundObj = {
        balanceBeforeWin,
        balanceAfter,
        betAmount,
        events,
        payoutMultiplier: cumWin,
        triggeredBonus
      };

      if (triggeredBonus) this._saveDemoPending(roundObj);
      else this._saveDemoBalance();
      return roundObj;
    }

    async endRound(payoutMultiplier = 0) {
      if (this.isReplay) return;
      if (!this.isLive) {
        this._clearDemoPending();
        this._saveDemoBalance();
        return;
      }
      // Stake Engine kuralı: /wallet/end-round yalnızca kazanan turlarda çağrılır
      if (!(payoutMultiplier > 0)) return;
      try {
        await fetch(`${this.rgsUrl.replace(/\/$/, '')}/wallet/end-round`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionID: this.sessionID })
        });
      } catch (_) {}
    }
  }

  window.BV_CONST = { PAYLINES, PAYTABLE };
  window.BV_RGS = new RGSAdapter();
})();