"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Planet Postcard Forge — MVP
// Frontend-only: fetches a NASA Worldview Snapshots image for a given bbox+date,
// pulls a few facts from Wikipedia/Wikidata, and composes a postcard on <canvas>.
// Ready to drop into a Next.js page (app router) or any React project.

// ---- Small helpers ----
function toISODate(d = new Date()) {
  // YYYY-MM-DD in user's local timezone
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function degPerKmAtLat(lat: number) {
  // Approximate degrees for a given km distance at given latitude
  const degLatPerKm = 1 / 110.574; // ~km per degree
  const degLonPerKm = 1 / (111.320 * Math.cos((lat * Math.PI) / 180));
  return { degLatPerKm, degLonPerKm };
}

function buildWvsUrl({
  south,
  west,
  north,
  east,
  date,
  time,
  width = 1600,
  height = 900,
  layers = [
    "MODIS_Terra_CorrectedReflectance_TrueColor",
    "Coastlines",
  ],
  format = "image/png",
}: {
  south: number; west: number; north: number; east: number;
  date: string; time?: string; width?: number; height?: number; layers?: string[]; format?: string;
}) {
  // Combine date and time for NASA API (YYYY-MM-DDTHH:MM:SSZ)
  const dateTime = time ? `${date}T${time}:00Z` : date;
  
  const params = new URLSearchParams({
    REQUEST: "GetSnapshot",
    TIME: dateTime,
    BBOX: `${south},${west},${north},${east}`,
    CRS: "EPSG:4326",
    LAYERS: layers.join(","),
    FORMAT: format,
    WIDTH: String(width),
    HEIGHT: String(height),
  });
  return `https://wvs.earthdata.nasa.gov/api/v1/snapshot?${params.toString()}`;
}

async function wikiSearchTitle(q: string, lang = "ja") {
  // 1) Search the Wikipedia page title for the place name
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*"); // CORS requirement
  url.searchParams.set("srlimit", "5"); // Get more results for better matching
  
  console.log("Search URL:", url.toString());
  const res = await fetch(url.toString());
  
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  
  const json = await res.json();
  console.log("Search response:", json);
  
  const results = json?.query?.search;
  if (!results || results.length === 0) {
    return undefined;
  }
  
  // Try to find the best match - prioritize exact matches or shorter titles
  const exactMatch = results.find((r: { title: string }) => 
    r.title.toLowerCase() === q.toLowerCase() ||
    r.title.toLowerCase().includes(q.toLowerCase())
  );
  
  return exactMatch?.title || results[0]?.title as string | undefined;
}

async function wikiTitleToCoordAndQid(title: string, lang = "ja") {
  // 2) Use prop=coordinates|pageprops to get lat/lon and Wikidata QID
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "coordinates|pageprops");
  url.searchParams.set("titles", title);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*"); // CORS requirement
  url.searchParams.set("coprop", "type|name|dim|country|region|globe");
  url.searchParams.set("ppprop", "wikibase_item");
  const res = await fetch(url.toString());
  const json = await res.json();
  const pages = json?.query?.pages || {};
  const page = pages[Object.keys(pages)[0]];
  const coords = page?.coordinates?.[0];
  const qid = page?.pageprops?.wikibase_item as string | undefined;
  if (!coords) return undefined;
  return { lat: coords.lat as number, lon: coords.lon as number, qid };
}

async function wikidataFacts(qid: string, lang = "ja") {
  // 3) Query Wikidata for a few facts
  const sparql = `
  SELECT ?itemLabel ?countryLabel ?population ?elev WHERE {
    VALUES ?item { wd:${qid} }
    OPTIONAL { ?item wdt:P17 ?country. }
    OPTIONAL { ?item wdt:P1082 ?population. }
    OPTIONAL { ?item wdt:P2044 ?elev. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
  } LIMIT 1`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("format", "json");
  url.searchParams.set("query", sparql);
  const res = await fetch(url.toString());
  const json = await res.json();
  const b = json?.results?.bindings?.[0];
  if (!b) return {} as { label?: string; country?: string; population?: number; elev?: number };
  const num = (x?: string) => (x ? Number(x) : undefined);
  return {
    label: b.itemLabel?.value as string | undefined,
    country: b.countryLabel?.value as string | undefined,
    population: num(b.population?.value),
    elev: num(b.elev?.value),
  } as { label?: string; country?: string; population?: number; elev?: number };
}

function formatNumber(n?: number) {
  if (n == null || Number.isNaN(n)) return undefined;
  return new Intl.NumberFormat("ja-JP").format(n);
}

// Japanese-English place name dictionary for better search results
const placeNameDict: Record<string, string> = {
  "アイルランド": "Ireland",
  "イギリス": "United Kingdom", 
  "フランス": "France",
  "ドイツ": "Germany",
  "イタリア": "Italy",
  "スペイン": "Spain",
  "アメリカ": "United States",
  "カナダ": "Canada",
  "オーストラリア": "Australia",
  "ニュージーランド": "New Zealand",
  "中国": "China",
  "韓国": "South Korea",
  "台湾": "Taiwan",
  "タイ": "Thailand",
  "インド": "India",
  "ロシア": "Russia",
  "ブラジル": "Brazil",
  "メキシコ": "Mexico",
  "エジプト": "Egypt",
  "南アフリカ": "South Africa",
  "南極": "Antarctica",
  "昭和基地": "Showa Station",
  "マクマード基地": "McMurdo Station",
  "大阪": "Osaka",
  "京都": "Kyoto",
  "名古屋": "Nagoya",
  "横浜": "Yokohama",
  "神戸": "Kobe",
  "福岡": "Fukuoka",
  "札幌": "Sapporo",
  "仙台": "Sendai"
};

function getSearchTerm(place: string, lang: string): string {
  // If searching in Japanese but the place is in katakana/hiragana, try English equivalent
  if (lang === "ja" && placeNameDict[place]) {
    return placeNameDict[place];
  }
  return place;
}

export default function PlanetPostcardForge() {
  const [place, setPlace] = useState("");
  const [lang, setLang] = useState<"ja" | "en">("en");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00"); // UTC time
  const [scaleKm, setScaleKm] = useState(200); // width of bbox in km
  
  // Initialize date on client side to avoid hydration mismatch
  useEffect(() => {
    setDate(toISODate());
  }, []);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [facts, setFacts] = useState<{ label?: string; country?: string; population?: number; elev?: number }>({});
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const bbox = useMemo(() => {
    if (!center) return null;
    const { degLatPerKm, degLonPerKm } = degPerKmAtLat(center.lat);
    const halfLat = (scaleKm * degLatPerKm) / 2;
    const halfLon = (scaleKm * degLonPerKm) / 2;
    return {
      south: center.lat - halfLat,
      north: center.lat + halfLat,
      west: center.lon - halfLon,
      east: center.lon + halfLon,
    };
  }, [center, scaleKm]);

  const rebuildSnapshot = useCallback(async () => {
    if (!bbox) return;
    const url = buildWvsUrl({ ...bbox, date, time, width: 1600, height: 900 });
    setSnapshotUrl(url);
    // draw once ready
    const img = new Image();
    img.crossOrigin = "anonymous"; // allow canvas export
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 1600;
      canvas.height = 900;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // overlay gradient
      const g = ctx.createLinearGradient(0, canvas.height * 0.65, 0, canvas.height);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // text block
      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";

      const title = facts.label || place;
      const subtitleParts: string[] = [];
      if (facts.country) subtitleParts.push(facts.country);
      if (center) subtitleParts.push(`${center.lat.toFixed(3)}, ${center.lon.toFixed(3)}`);
      const subtitle = subtitleParts.join("  •  ");

      // Title typography
      ctx.font = "800 64px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillText(title, 72, 820);

      // Subtitle
      ctx.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(subtitle, 72, 860);

      // Fact chips
      const chips: string[] = [];
      if (facts.population) chips.push(`人口 ${formatNumber(facts.population)}人`);
      if (facts.elev != null) chips.push(`標高 ${facts.elev}m`);
      chips.push(new Date(date).toLocaleDateString("ja-JP"));

      let x = 72;
      for (const chip of chips) {
        ctx.font = "600 20px system-ui, -apple-system, Segoe UI, Roboto";
        const padX = 14;
        const w = ctx.measureText(chip).width + padX * 2;
        const h = 36;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.roundRect(x, 880, w, h, 12);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(chip, x + padX, 906);
        x += w + 10;
      }

      // Credit footer
      ctx.font = "400 14px system-ui, -apple-system, Segoe UI, Roboto";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.textAlign = "right";
      ctx.fillText(
        "Imagery: NASA EOSDIS Worldview Snapshots (GIBS)  |  Data: Wikipedia/Wikidata",
        canvas.width - 24,
        canvas.height - 16
      );
    };
    img.onerror = () => setStatus("画像の取得に失敗しました（ネットワーク/CORSをご確認ください）");
    img.src = url;
  }, [bbox, date, time, facts, place, center]);

  // Extend CanvasRenderingContext2D for rounded rect
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = CanvasRenderingContext2D.prototype as any;
    if (!ctx.roundRect) {
      ctx.roundRect = function(x: number, y: number, w: number, h: number, r: number) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
      };
    }
  }, []);

  const onGenerate = useCallback(async () => {
    try {
      setStatus("検索中...");
      console.log(`Searching for: ${place} in ${lang}`);
      
      // Try multiple search strategies for better hit rate
      const searchTerm = getSearchTerm(place, lang);
      console.log(`Original: ${place}, Search term: ${searchTerm}`);
      
      let title = await wikiSearchTitle(searchTerm, lang);
      console.log(`First search result (${lang}): ${title}`);
      
      // If no result and we used dictionary, try original term
      if (!title && searchTerm !== place) {
        console.log("Retrying with original term...");
        title = await wikiSearchTitle(place, lang);
        console.log(`Original term result: ${title}`);
      }
      
      // If no result in primary language, try English
      if (!title && lang !== "en") {
        console.log("Retrying with English...");
        title = await wikiSearchTitle(searchTerm, "en");
        console.log(`English search result: ${title}`);
      }
      
      // If still no result, try the other language (EN->JA or JA->EN)
      if (!title) {
        const altLang = lang === "ja" ? "en" : "ja";
        console.log(`Retrying with ${altLang}...`);
        title = await wikiSearchTitle(place, altLang);
        console.log(`${altLang} search result: ${title}`);
      }
      
      if (!title) {
        setStatus("Wikipediaで該当ページが見つかりませんでした。");
        return;
      }
      
      setStatus("座標を取得中...");
      const coordQ = await wikiTitleToCoordAndQid(title, lang);
      console.log(`Coordinates from ${lang}:`, coordQ);
      
      if (!coordQ && lang !== "en") {
        // retry with English
        console.log("Retrying coordinates with English...");
        const coordQen = await wikiTitleToCoordAndQid(title, "en");
        console.log("English coordinates:", coordQen);
        
        if (coordQen) {
          setCenter({ lat: coordQen.lat, lon: coordQen.lon });
          if (coordQen.qid) {
            setStatus("詳細情報を取得中...");
            setFacts(await wikidataFacts(coordQen.qid, lang));
          }
        } else {
          setStatus("座標が取得できませんでした。");
          return;
        }
      } else if (coordQ) {
        setCenter({ lat: coordQ.lat, lon: coordQ.lon });
        if (coordQ.qid) {
          setStatus("詳細情報を取得中...");
          setFacts(await wikidataFacts(coordQ.qid, lang));
        }
      } else {
        setStatus("座標が取得できませんでした。");
        return;
      }
      setStatus("");
    } catch (e) {
      console.error("Error in onGenerate:", e);
      setStatus(`検索に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [place, lang]);

  useEffect(() => {
    if (center) {
      rebuildSnapshot();
    }
  }, [center, rebuildSnapshot]);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    const safeTitle = (facts.label || place || "postcard").replace(/[^\p{L}\p{N}_-]+/gu, "_");
    a.download = `${safeTitle}_${date}.png`;
    a.click();
  }, [facts, place, date]);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-white flex flex-col">
      <header className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Planet Postcard Forge</h1>
        <div className="text-sm opacity-70">フロントエンド完結・NASA GIBS × Wikipedia/Wikidata</div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-0">
        {/* Controls */}
        <section className="border-r border-white/10 p-4 md:p-6 space-y-5 bg-neutral-900/30">
          <div>
            <label className="block text-sm mb-1">場所名を入力 または クリックで選択</label>
            <input
              className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/40"
              placeholder="例: 東京、パリ、ニューヨーク..."
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              spellCheck="false"
              data-ms-editor="false"
              suppressHydrationWarning
            />
            
            {/* Quick selection buttons */}
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                "Tokyo", 
                "Paris", 
                "Egypt",
                "McMurdo Station"
              ].map((place) => (
                <button
                  key={place}
                  onClick={() => setPlace(place)}
                  className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 transition border border-white/20 hover:border-white/40"
                >
                  {place}
                </button>
              ))}
            </div>
            <div className="text-xs opacity-60 mt-1">
              日本語でも試してみてください: 東京、エジプト、昭和基地
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">Language / 言語</label>
              <select
                className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
                value={lang}
                onChange={(e) => setLang(e.target.value as "ja" | "en")}
              >
                <option value="en">English (Default)</option>
                <option value="ja">日本語優先</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">日付（衛星画像）</label>
              <input
                type="date"
                className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
                value={date}
                max={toISODate()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm mb-1">時刻（UTC）</label>
              <input
                type="time"
                className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">時間帯の特徴</label>
              <div className="text-xs bg-white/5 rounded-2xl px-4 py-3 border border-white/10">
                {(() => {
                  const hour = parseInt(time.split(':')[0]);
                  if (hour >= 6 && hour < 12) return "🌅 朝 - 朝日・霧・影が長い";
                  if (hour >= 12 && hour < 18) return "☀️ 昼 - 最も明るく鮮明";
                  if (hour >= 18 && hour < 22) return "🌇 夕 - 夕日・暖色系";
                  return "🌙 夜 - 夜景・都市の光";
                })()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1 flex items-center gap-2">
              クイック時刻選択
              <span className="text-xs opacity-60">（UTC協定世界時）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { time: "00:00", label: "🌙 深夜", desc: "夜景" },
                { time: "06:00", label: "🌅 朝", desc: "朝日" },
                { time: "12:00", label: "☀️ 正午", desc: "最明" },
                { time: "18:00", label: "🌇 夕", desc: "夕日" }
              ].map((t) => (
                <button
                  key={t.time}
                  onClick={() => setTime(t.time)}
                  className={`px-3 py-1.5 text-xs rounded-xl transition border ${
                    time === t.time 
                      ? 'bg-cyan-500/20 border-cyan-400' 
                      : 'bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/40'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] opacity-60 mt-1">
              ※ 衛星の軌道により、全時間帯の画像が利用できない場合があります
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">表示範囲の幅（km）</label>
            <input
              type="range"
              min={20}
              max={5000}
              step={20}
              value={scaleKm}
              onChange={(e) => setScaleKm(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-xs opacity-80 mt-1 space-y-1">
              <div>約 {scaleKm.toLocaleString()} km 幅</div>
              <div className="text-[10px] opacity-60">
                {scaleKm < 100 ? "🏙️ 都市レベル" :
                 scaleKm < 500 ? "🏔️ 地域レベル" :
                 scaleKm < 1500 ? "🗾 国レベル" :
                 scaleKm < 3000 ? "🌏 大陸レベル" : "🌍 地球規模"}
              </div>
            </div>
          </div>

          <button
            onClick={onGenerate}
            className="w-full rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-3 transition"
          >
            ポストカード生成
          </button>

          {status && (
            <div className="text-sm text-amber-300">{status}</div>
          )}

          {center && (
            <div className="text-xs opacity-70 space-y-1">
              <div>中心: {center.lat.toFixed(4)}, {center.lon.toFixed(4)}</div>
              {bbox && (
                <div>
                  BBOX: {bbox.south.toFixed(4)}, {bbox.west.toFixed(4)}, {bbox.north.toFixed(4)}, {bbox.east.toFixed(4)}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 text-[11px] leading-relaxed opacity-70">
            画像クレジット: NASA EOSDIS Worldview Snapshots (GIBS). 事実データ: Wikipedia/Wikidata. このアプリはフロントエンドのみで動作します。
          </div>
        </section>

        {/* Canvas / Preview */}
        <section className="p-4 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">プレビュー</h2>
            <div className="flex gap-2">
              <button
                onClick={rebuildSnapshot}
                disabled={!center}
                className="rounded-xl border border-white/20 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
              >
                再描画
              </button>
              <button
                onClick={downloadPng}
                disabled={!center}
                className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold hover:bg-neutral-200 disabled:opacity-40"
              >
                PNGで保存
              </button>
            </div>
          </div>
          <canvas ref={canvasRef} className="w-full aspect-[16/9] rounded-2xl bg-black shadow-xl" />

          {snapshotUrl && (
            <details className="text-xs opacity-70">
              <summary>デバッグ: 取得先URL (Worldview Snapshots)</summary>
              <div className="break-all mt-1">{snapshotUrl}</div>
            </details>
          )}

          {facts && (facts.country || facts.population || facts.elev) && (
            <div className="text-sm grid grid-cols-1 md:grid-cols-3 gap-3">
              {facts.country && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <div className="opacity-60 text-xs mb-1">Country</div>
                  <div className="font-semibold">{facts.country}</div>
                </div>
              )}
              {facts.population && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <div className="opacity-60 text-xs mb-1">Population</div>
                  <div className="font-semibold">{formatNumber(facts.population)}</div>
                </div>
              )}
              {facts.elev != null && (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <div className="opacity-60 text-xs mb-1">Elevation (m)</div>
                  <div className="font-semibold">{facts.elev}</div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="p-4 md:p-6 border-t border-white/10 text-xs opacity-70">
        © Planet Postcard Forge — Demo. Ensure attribution in your deployed app footer.
      </footer>
    </div>
  );
}