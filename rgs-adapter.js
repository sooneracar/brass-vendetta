(() => {
  const API_SCALE = 1000000; // Stake Engine micro-unit standard (1.00 = 1,000,000)

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
    ...Array(5).fill('W'),   ...Array(4).fill('VS')
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

  function makeGrid(pool, allowMultiSC = true) {
    const g = Array.from({ length: 4 }, () => Array(5).fill('L1'));
    for (let c = 0; c < 5; c++) {
      let colHasSC = false;
      for (let r = 0; r < 4; r++) {
        let sym = pool[Math.floor(Math.random() * pool.length)];
        if (sym === 'SC' && (!allowMultiSC || colHasSC)) sym = 'L2';
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

  class RGSAdapter {
    constructor() {
      const p = new URLSearchParams(window.location.search);
      this.rgsUrl = p.get('rgs_url') || '';
      this.sessionID = p.get('sessionID') || '';
      this.currency = p.get('currency') || 'USD';
      this.isLive = Boolean(this.rgsUrl && this.sessionID && p.get('demo') !== '1');
      this.balance = 1000.0;
      this.betLevels = [0.2, 0.4, 0.6, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0];
      this.currencySymbols = { USD: '$', EUR: '€', TRY: '₺', GBP: '£', CAD: 'CA$', AUD: 'A$' };
    }

    formatMoney(val) {
      const sym = this.currencySymbols[this.currency] || `${this.currency} `;
      return `${sym}${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    async authenticate() {
      if (!this.isLive) {
        return { balance: this.balance, betLevels: this.betLevels, mode: 'DEMO' };
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
      return { balance: this.balance, betLevels: this.betLevels, mode: 'LIVE' };
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
          balanceAfter: this.balance,
          events,
          payoutMultiplier: (data.round?.payoutMultiplier ?? 0) / 100,
          triggeredBonus: mode === 'bonus' || events.length > 1
        };
      }

      // LOCAL DEMO ENGINE (Birebir aynı matematik kuralları)
      if (this.balance < cost) throw new Error('INSUFFICIENT BALANCE');
      this.balance = +(this.balance - cost).toFixed(2);
      const events = [];
      let cumWin = 0;
      let triggeredBonus = false;

      if (mode === 'bonus') {
        triggeredBonus = true;
        for (let s = 0; s < 10; s++) {
          const grid = makeGrid(BONUS_POOL, false);
          const { spinWin, vsReels, wins } = evalSpin(grid);
          cumWin = Math.min(12500, +(cumWin + spinWin).toFixed(2));
          events.push({ index: s, type: 'bonusSpin', grid, vsReels, wins, spinWin, cumWin });
          if (cumWin >= 12500) break;
        }
      } else {
        const grid = makeGrid(BASE_POOL, true);
        const scCount = grid.flat().filter(s => s === 'SC').length;
        const { spinWin, vsReels, wins } = evalSpin(grid);
        cumWin = Math.min(12500, spinWin);
        events.push({ index: 0, type: 'spin', grid, vsReels, wins, spinWin, cumWin, scatters: scCount });

        if (scCount >= 3) {
          triggeredBonus = true;
          for (let s = 0; s < 10; s++) {
            const bGrid = makeGrid(BONUS_POOL, false);
            const bRes = evalSpin(bGrid);
            cumWin = Math.min(12500, +(cumWin + bRes.spinWin).toFixed(2));
            events.push({ index: s + 1, type: 'bonusSpin', grid: bGrid, vsReels: bRes.vsReels, wins: bRes.wins, spinWin: bRes.spinWin, cumWin });
            if (cumWin >= 12500) break;
          }
        }
      }

      const totalPayout = +(cumWin * betAmount).toFixed(2);
      this.balance = +(this.balance + totalPayout).toFixed(2);
      return {
        balanceBeforeWin: +(this.balance - totalPayout).toFixed(2),
        balanceAfter: this.balance,
        events,
        payoutMultiplier: cumWin,
        triggeredBonus
      };
    }

    async endRound() {
      if (!this.isLive) return;
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
