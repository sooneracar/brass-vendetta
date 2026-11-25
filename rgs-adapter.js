(() => {
  const API_SCALE = 1000000; // Stake Engine micro-unit standard (1.00 = 1,000,000)
  const MAX_BONUS_SPINS = 40;
  const DEMO_STORAGE_KEY = 'bv_pending_round_v4';
  const DEMO_BAL_KEY = 'bv_demo_balance_v4';

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

  // Math v2 ile birebir aynı havuzlar (Bonus içi Scatter Retrigger dahil)
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

      if (cumWin >= 12500) {
        added = 0;
      } else {
        totalSpins += added;
      }
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

  class RGSAdapter {
    constructor() {
      const p = new URLSearchParams(window.location.search);
      this.rgsUrl = p.get('rgs_url') || '';
      this.sessionID = p.get('sessionID') || '';
      this.currency = p.get('currency') || 'USD';
      this.isSocial = p.get('social') === 'true' || p.get('social') === '1';
      this.isLive = Boolean(this.rgsUrl && this.sessionID && p.get('demo') !== '1');
      this.balance = 1000.0;
      this.betLevels = [0.2, 0.4, 0.6, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0];
      this.currencySymbols = { USD: '$', EUR: '€', TRY: '₺', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥', SC: 'SC ', GC: 'GC ', XSC: 'SC ', XGC: 'GC ' };

      if (!this.isLive) {
        const savedBal = Number(localStorage.getItem(DEMO_BAL_KEY));
        if (Number.isFinite(savedBal) && savedBal > 0) this.balance = savedBal;
      }
    }

    formatMoney(val) {
      const sym = this.currencySymbols[this.currency] || `${this.currency} `;
      const decimals = this.currency === 'JPY' ? 0 : 2;
      return `${sym}${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
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

    async authenticate() {
      if (!this.isLive) {
        const pendingRound = this._loadDemoPending();
        return {
          balance: pendingRound ? pendingRound.balanceBeforeWin : this.balance,
          betLevels: this.betLevels,
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
      this.currency = data.balance?.currency || this.currency;
      if (Array.isArray(data.config?.betLevels) && data.config.betLevels.length) {
        this.betLevels = data.config.betLevels.map(v => v / API_SCALE);
      }

      // Canlı RGS 20 dk sonra yarım kalan tur kurtarma (Deterministic Recovery)
      let pendingRound = null;
      const activeEvents = data.round?.state || data.round?.events;
      if (data.round && Array.isArray(activeEvents) && activeEvents.length > 0) {
        pendingRound = {
          balanceBeforeWin: this.balance,
          balanceAfter: this.balance,
          betAmount: data.round.amount ? data.round.amount / API_SCALE : this.betLevels[0],
          events: activeEvents,
          payoutMultiplier: (data.round.payoutMultiplier ?? 0) / 100,
          triggeredBonus: activeEvents.length > 1 || activeEvents[0]?.type === 'buyTrigger' || activeEvents[0]?.type === 'bonusSpin'
        };
      }
      return { balance: this.balance, betLevels: this.betLevels, mode: 'LIVE', pendingRound };
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

      // LOCAL DEMO ENGINE (Math v2 + 20 Dk Tutarlı Kurtarma)
      if (this.balance < cost) throw new Error('INSUFFICIENT BALANCE');
      const balanceBeforeWin = +(this.balance - cost).toFixed(2);
      const events = [];
      let cumWin = 0;
      let triggeredBonus = false;

      if (mode === 'bonus') {
        triggeredBonus = true;
        // Event 0: Gerçek 3-Scatter tetikleme spini
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

      const totalPayout = +(cumWin * betAmount).toFixed(2);
      const balanceAfter = +(balanceBeforeWin + totalPayout).toFixed(2);
      this.balance = balanceAfter;

      const roundObj = {
        balanceBeforeWin,
        balanceAfter,
        betAmount,
        events,
        payoutMultiplier: cumWin,
        triggeredBonus
      };

      // Bonus içeren turu tamamlanana kadar kilitle (sayfa kapanıp 20 dk sonra açılsa bile birebir devam eder)
      if (triggeredBonus) {
        this._saveDemoPending(roundObj);
      } else {
        this._saveDemoBalance();
      }
      return roundObj;
    }

    async endRound(payoutMultiplier = 0) {
      if (!this.isLive) {
        this._clearDemoPending();
        this._saveDemoBalance();
        return;
      }
      // Stake Engine kuralı: /wallet/end-round yalnızca kazanan turlarda çağrılır
      if (payoutMultiplier <= 0) return;
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