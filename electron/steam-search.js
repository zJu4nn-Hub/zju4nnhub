// steam-search.js — Busca jogos na Steam Store API (pública).
// Usa endpoints oficiais que NÃO precisam de chave/auth.
//
// APIs usadas:
//   - storesearch: busca rápida por título (returns id, name, price, etc)
//   - appdetails: detalhes completos do jogo (descrição, screenshots, gêneros)
//   - apps?key=...: featured/popular (podemos adicionar depois se quiser)

const { net } = require('electron');

// ============================================================
// FETCH HELPER
// ============================================================
function httpGet(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' });
    request.setHeader('User-Agent', 'Mozilla/5.0 zJu4nn-Hub/1.0');
    request.setHeader('Accept', 'application/json, text/plain, */*');

    let data = '';
    let timer;

    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        request.abort();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.on('data', (chunk) => { data += chunk.toString('utf8'); });
      response.on('end', () => {
        clearTimeout(timer);
        resolve(data);
      });
      response.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    request.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    timer = setTimeout(() => {
      request.abort();
      reject(new Error('Timeout (12s)'));
    }, timeoutMs);

    request.end();
  });
}

// ============================================================
// CACHE de TYPE por appid (pra filtrar DLCs/music/etc do search)
// Storesearch da Steam categoriza DLCs como 'app' (!!), só appdetails
// retorna o tipo real ('game', 'dlc', 'music', 'video', 'demo'...).
// ============================================================
const appTypeCache = new Map();
const inFlightTypeRequests = new Map();

async function getAppType(appid) {
  if (appTypeCache.has(appid)) return appTypeCache.get(appid);
  if (inFlightTypeRequests.has(appid)) return inFlightTypeRequests.get(appid);

  const promise = (async () => {
    try {
      const url = `https://store.steampowered.com/api/appdetails/?appids=${encodeURIComponent(appid)}&filters=basic`;
      const raw = await httpGet(url, 6000);
      const json = JSON.parse(raw);
      const data = json[String(appid)]?.data;
      const type = data?.type || null;
      appTypeCache.set(appid, type);
      return type;
    } catch {
      // Se appdetails falha, NÃO bloqueia — assume que é jogo (better safe)
      appTypeCache.set(appid, 'game');
      return 'game';
    }
  })();

  inFlightTypeRequests.set(appid, promise);
  promise.finally(() => inFlightTypeRequests.delete(appid));
  return promise;
}

// ============================================================
// SEARCH (storesearch)
// Retorna até ~25 resultados rápidos
// ============================================================
async function search(term, opts = {}) {
  const lang = opts.lang || 'brazilian';
  const cc = opts.cc || 'br';

  if (!term || typeof term !== 'string' || term.trim().length < 2) {
    return [];
  }

  // ESTRATÉGIA HÍBRIDA:
  // - /search/results?category1=998: filtra DLCs server-side, retorna até 50
  //   resultados, mas exige palavras COMPLETAS (sem prefix matching)
  // - storesearch: faz PREFIX matching (essencial pra digitar incremental),
  //   max 10 resultados, mas mistura DLCs como type='app'
  //
  // Combina os 2 e dedupe. /search/results vem primeiro (já vem filtrado).
  // Items só do storesearch são validados via appdetails (cache).

  const [fromCategory, fromStoresearch] = await Promise.all([
    fetchCategorySearch(term, lang, cc),
    fetchStoresearch(term, lang, cc),
  ]);

  // Map appid → item (preferindo dados do /search/results)
  const merged = new Map();
  for (const it of fromCategory) merged.set(it.appid, { ...it, _source: 'category' });

  // Adiciona items do storesearch que não estão no merged
  const onlyStoresearch = fromStoresearch.filter((it) => !merged.has(it.appid));

  // Valida tipo via appdetails (cache) pra eliminar DLCs do storesearch
  const validatedStoresearch = await Promise.all(onlyStoresearch.map(async (it) => {
    const realType = await getAppType(it.appid);
    if (realType === 'dlc' || realType === 'music' || realType === 'video' || realType === 'demo') return null;
    return it;
  }));
  for (const it of validatedStoresearch) {
    if (it) merged.set(it.appid, it);
  }

  let results = Array.from(merged.values());

  // FILTRO DE RELEVÂNCIA: o /search/results da Steam às vezes retorna jogos
  // com tags similares (action/fantasy) mas sem o termo no NOME. Exigimos
  // que TODAS as palavras (3+ chars) da busca apareçam no nome.
  // Palavras de 2 chars (of, in, to, the) são ignoradas pra match flexível.
  const significantWords = normalizeForMatch(term).split(/\s+/).filter((w) => w.length >= 3);
  if (significantWords.length) {
    results = results.filter((it) => {
      const name = normalizeForMatch(it.name || '');
      return significantWords.every((w) => name.includes(w));
    });
  }

  return results;
}

// Normaliza string pra comparação: lowercase + tira acentos/símbolos
function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .trim();
}

// Endpoint /search/results — palavras completas, filtra DLCs (category1=998)
async function fetchCategorySearch(term, lang, cc) {
  const url = `https://store.steampowered.com/search/results/?term=${encodeURIComponent(term)}` +
              `&category1=998&infinite=1&count=50&start=0&l=${lang}&cc=${cc}`;
  try {
    const raw = await httpGet(url);
    const json = JSON.parse(raw);
    const html = json.results_html || '';
    return parseSearchHtml(html);
  } catch {
    return [];
  }
}

// Endpoint storesearch — prefix matching + filter=games (Steam tenta excluir DLCs/soundtracks server-side)
async function fetchStoresearch(term, lang, cc) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=${lang}&cc=${cc}&filter=games`;
  try {
    const raw = await httpGet(url);
    const json = JSON.parse(raw);
    const items = Array.isArray(json.items) ? json.items : [];

    // Pré-filtros baratos (subs, edition variants)
    return items
      .filter((it) => {
        if (it.type && !['app', undefined, null, ''].includes(it.type)) return false;
        const n = String(it.name || '').toLowerCase();
        if (/\bupgrade\b/.test(n)) return false;
        if (/\bseason pass\b/.test(n)) return false;
        if (/\bdlc\b/.test(n)) return false;
        if (/\bcharacter pack\b/.test(n)) return false;
        if (/\bexpansion pack\b/.test(n)) return false;
        return true;
      })
      .map((it) => ({
        appid: it.id,
        name: it.name,
        type: 'app',
        tinyImage: it.tiny_image,
        headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${it.id}/header.jpg`,
        libraryImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${it.id}/library_600x900.jpg`,
        price: it.price?.final ? (it.price.final / 100) : null,
        priceCurrency: it.price?.currency || null,
        isFree: it.price?.final === 0 || !it.price,
        platforms: it.platforms || {},
        metascore: it.metascore || null,
        streamingvideo: !!it.streamingvideo,
        controllerSupport: it.controller_support || null,
      }));
  } catch {
    return [];
  }
}

// ============================================================
// Parser do HTML do search results
// ============================================================
function parseSearchHtml(html) {
  const items = [];
  // Cada result row é um <a ... data-ds-appid="..." ... class="search_result_row ...">...</a>
  // Steam coloca data-ds-appid ANTES da class, então o regex precisa respeitar essa ordem.
  const rowRegex = /<a[^>]*data-ds-appid="(\d+)"[^>]*class="search_result_row[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const appid = parseInt(m[1], 10);
    const block = m[2];

    const nameMatch = block.match(/<span class="title">([^<]+)<\/span>/);
    const name = nameMatch ? decodeHtmlEntities(nameMatch[1].trim()) : '';
    if (!name) continue;

    // Imagem capsule (231x87)
    const imgMatch = block.match(/<div class="search_capsule"><img[^>]+src="([^"]+)"/);
    const tinyImage = imgMatch ? imgMatch[1] : null;

    // Plataformas
    const platforms = {};
    if (/platform_img\s+win/.test(block)) platforms.windows = true;
    if (/platform_img\s+mac/.test(block)) platforms.mac = true;
    if (/platform_img\s+linux/.test(block)) platforms.linux = true;

    // Preço (data-price-final em centavos)
    let price = null;
    let isFree = false;
    const priceFinalMatch = block.match(/data-price-final="(\d+)"/);
    if (priceFinalMatch) {
      const cents = parseInt(priceFinalMatch[1], 10);
      if (cents > 0) {
        price = cents / 100;
      } else {
        // 0 cents = gratuito, ou pode ser "free to play"
        isFree = true;
      }
    }
    // Verifica gratuito explícito no HTML
    if (/Gratuito|Free to Play|Free To Play|Play for Free/i.test(block)) {
      isFree = true;
      price = null;
    }

    items.push({
      appid,
      name,
      type: 'app',
      tinyImage,
      headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      libraryImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
      price,
      priceCurrency: 'BRL',
      isFree,
      platforms,
      metascore: null,
      streamingvideo: false,
      controllerSupport: null,
    });
  }
  return items;
}

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ============================================================
// DETAILS (appdetails)
// Retorna descrição, screenshots, gêneros, requisitos, etc.
// ============================================================
async function details(appid, opts = {}) {
  const lang = opts.lang || 'brazilian';
  const cc = opts.cc || 'BR';

  if (!appid) throw new Error('appid obrigatório');

  const url = `https://store.steampowered.com/api/appdetails/?appids=${encodeURIComponent(appid)}&l=${lang}&cc=${cc}`;

  let raw;
  try {
    raw = await httpGet(url);
  } catch (err) {
    throw new Error(`Steam details falhou: ${err.message}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Steam retornou resposta inválida');
  }

  const entry = json[String(appid)];
  if (!entry || !entry.success) {
    throw new Error('Jogo não encontrado na Steam');
  }

  const d = entry.data || {};
  return {
    appid: d.steam_appid || appid,
    name: d.name,
    type: d.type,
    requiredAge: d.required_age,
    isFree: d.is_free,
    detailedDescription: d.detailed_description,
    aboutTheGame: d.about_the_game,
    shortDescription: d.short_description,
    supportedLanguages: d.supported_languages,
    headerImage: d.header_image,
    capsuleImage: d.capsule_image,
    capsuleImageV5: d.capsule_imagev5,
    background: d.background_raw || d.background,
    backgroundRaw: d.background_raw,
    website: d.website,
    developers: d.developers || [],
    publishers: d.publishers || [],
    price: d.price_overview ? {
      currency: d.price_overview.currency,
      initial: d.price_overview.initial / 100,
      final: d.price_overview.final / 100,
      discountPercent: d.price_overview.discount_percent,
      formatted: d.price_overview.final_formatted,
    } : null,
    platforms: d.platforms || {},
    categories: (d.categories || []).map((c) => c.description),
    genres: (d.genres || []).map((g) => g.description),
    screenshots: (d.screenshots || []).slice(0, 8).map((s) => ({
      thumb: s.path_thumbnail,
      full: s.path_full,
    })),
    movies: (d.movies || []).slice(0, 3).map((m) => ({
      name: m.name,
      thumbnail: m.thumbnail,
      mp4: m.mp4?.['480'] || m.mp4?.max,
      webm: m.webm?.['480'] || m.webm?.max,
    })),
    releaseDate: d.release_date ? {
      comingSoon: d.release_date.coming_soon,
      date: d.release_date.date,
    } : null,
    metacritic: d.metacritic ? {
      score: d.metacritic.score,
      url: d.metacritic.url,
    } : null,
  };
}

module.exports = { search, details };
