// Vercel serverless functie: haalt waterhoogte (meting, verwachting, astronomisch)
// live op bij de openbare Rijkswaterstaat Waterwebservices (DD-API 2.0) en geeft
// één compact JSON-bestand terug. Vercel's CDN bewaart het antwoord 10 minuten.

const URL = 'https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen';
const DAYS_BACK = 2, DAYS_AHEAD = 7, STEP = 10;
const PTS = ['meting', 'verwachting', 'astronomisch'];

// [weergavenaam, Waterwebservices-code of { procestype: code }]
const LOCATIONS = [
  ['West-Terschelling', 'terschelling.west'],
  ['Vlieland', 'vlieland.haven'],
  ['Harlingen', 'harlingen.waddenzee'],
  ['Nes Ameland', 'ameland.nes'],
  ['Kornwerderzand', 'kornwerderzand.waddenzee.buitenhaven'],
  ['Oudeschild', 'texel.oudeschild'],
  ['Den Oever', 'denoever.waddenzee.voorhaven'],
  ['Den Helder', 'denhelder.marsdiep'],
  ['Holwerd', { meting: 'holwerd.vaargeul', verwachting: 'holwerd.veersteiger', astronomisch: 'holwerd.veersteiger' }],
  ['Wierumergronden', 'wierumergronden'],
  ['Lauwersoog', 'lauwersoog.waddenzee'],
  ['Schiermonnikoog', 'schiermonnikoog.waddenzee'],
  ['Eemshaven', 'eemshaven.haven'],
  ['Delfzijl', 'delfzijl'],
  ['Nieuwe Statenzijl', 'nieuwestatenzijl.dollard'],
  ['Scheveningen', 'scheveningen'],
];

const codeFor = (c, pt) => (typeof c === 'string' ? c : c[pt]);
const iso = d => d.toISOString().replace('Z', '+00:00');

async function fetchSeries(code, pt, start, end, T0, N) {
  const body = {
    Locatie: { Code: code },
    AquoPlusWaarnemingMetadata: { AquoMetadata: {
      Compartiment: { Code: 'OW' }, Grootheid: { Code: 'WATHTE' }, ProcesType: pt } },
    Periode: { Begindatumtijd: iso(start), Einddatumtijd: iso(end) },
  };
  let d = null;
  for (let attempt = 0; attempt < 3 && !d; attempt++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (r.status === 204) return null; // geen gegevens voor deze combinatie
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      if (!txt) return null;
      d = JSON.parse(txt);
    } catch (e) {
      if (attempt === 2) { console.error(code, pt, e.message); return null; }
    }
  }
  if (!d || !d.Succesvol) return null;
  const vals = new Array(N).fill(null);
  for (const w of d.WaarnemingenLijst || []) {
    if (w.AquoMetadata?.Hoedanigheid?.Code !== 'NAP') continue;
    for (const m of w.MetingenLijst || []) {
      const v = m.Meetwaarde?.Waarde_Numeriek;
      if (v == null || Math.abs(v) > 5000) continue; // 999999999 = ontbrekend
      const t = Math.floor(Date.parse(m.Tijdstip) / 60000);
      const i = Math.round((t - T0) / STEP);
      if (i >= 0 && i < N) vals[i] = Math.round(v);
    }
  }
  while (vals.length && vals[vals.length - 1] === null) vals.pop();
  const first = vals.findIndex(v => v !== null);
  return first < 0 ? null : { i0: first, v: vals.slice(first) };
}

// Voert taken uit met een maximum aantal tegelijk, om de RWS-server te sparen.
async function pool(tasks, size) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

export async function buildData() {
  const now = new Date();
  const start = new Date(now.getTime() - DAYS_BACK * 864e5);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(now.getTime() + DAYS_AHEAD * 864e5);
  const T0 = Math.floor(start.getTime() / 60000);
  const N = Math.floor((end - start) / 60000 / STEP) + 1;

  const tasks = [];
  for (const [, code] of LOCATIONS) for (const pt of PTS) tasks.push(() => fetchSeries(codeFor(code, pt), pt, start, end, T0, N));
  const res = await pool(tasks, 12);

  const locations = LOCATIONS.map(([name, code], k) => {
    const series = {};
    PTS.forEach((pt, n) => { if (res[k * 3 + n]) series[pt] = res[k * 3 + n]; });
    return { name, code: codeFor(code, 'astronomisch'), series };
  });
  return { generated: now.toISOString().replace(/\.\d+Z$/, 'Z'), t0: T0, step: STEP,
    source: 'Rijkswaterstaat Waterwebservices', locations };
}

export default async function handler(req, res) {
  try {
    const data = await buildData();
    const filled = data.locations.filter(l => Object.keys(l.series).length).length;
    if (filled < LOCATIONS.length / 2) throw new Error('Te weinig data van Rijkswaterstaat ontvangen');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: e.message });
  }
}
