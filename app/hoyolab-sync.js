'use strict';

// Local, read-only access to HoYoLAB Battle Chronicle endpoints.
// Authentication cookies stay in Electron's isolated persistent session;
// this module never sends cookie values to the UI or to non-HoYoverse hosts.
const https = require('node:https');
const crypto = require('node:crypto');

const REFRESH_OPTIONS = Object.freeze([5, 10, 15, 30, 60]);
const API_HOSTS = new Set([
  'api-os-takumi.mihoyo.com',
  'api-account-os.hoyolab.com',
  'bbs-api-os.hoyolab.com',
  'bbs-api-os.hoyoverse.com'
]);
const ROLE_URLS = [
  'https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global',
  'https://api-account-os.hoyolab.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global'
];
const NOTE_URLS = [
  'https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote',
  'https://bbs-api-os.hoyoverse.com/game_record/genshin/api/dailyNote'
];
const REGION_MAP = Object.freeze({ os_asia: 'asia', os_euro: 'europe', os_usa: 'america', os_cht: 'tw' });
const AUTH_COOKIE_NAMES = new Set([
  'ltuid', 'ltoken', 'ltuid_v2', 'ltoken_v2', 'ltmid_v2',
  'account_id', 'account_id_v2', 'cookie_token', 'cookie_token_v2',
  'stuid', 'stoken', 'stoken_v2', 'mid', 'mid_v2'
]);

function safeRole(raw) {
  const uid = String(raw?.game_uid ?? raw?.uid ?? '').trim();
  const region = String(raw?.region ?? '');
  if (!/^\d{8,12}$/.test(uid) || !Object.hasOwn(REGION_MAP, region)) return null;
  return {
    uid,
    region,
    server: REGION_MAP[region],
    nickname: String(raw?.nickname || `Traveler ${uid.slice(-4)}`).slice(0, 48),
    level: Number.isFinite(Number(raw?.level)) ? Math.max(0, Math.min(100, Math.trunc(Number(raw.level)))) : null
  };
}
function noteHeaders() {
  // HoYoLAB can rotate this request signature. A failed request is surfaced,
  // never silently represented as a successful sync.
  const t = Math.floor(Date.now() / 1000);
  const r = crypto.randomBytes(6).toString('hex');
  const salt = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';
  const digest = crypto.createHash('md5').update(`salt=${salt}&t=${t}&r=${r}`).digest('hex');
  return {
    'DS': `${t},${r},${digest}`,
    'x-rpc-client_type': '4',
    'x-rpc-app_version': '1.5.0',
    'x-rpc-language': 'en-us',
    'Referer': 'https://www.hoyolab.com/'
  };
}
function requestJson(endpoint, cookieHeader, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !API_HOSTS.has(url.hostname)) {
      reject(new Error('Non-HoYoLAB API address blocked')); return;
    }
    const request = https.get(url, {
      timeout: 15000,
      headers: {
        'Cookie': cookieHeader,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        ...headers
      }
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HoYoLAB responded with HTTP ${response.statusCode}`));
        return;
      }
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 1_000_000) response.destroy(new Error('HoYoLAB response exceeds size limit'));
      });
      response.on('end', () => {
        try { resolve(JSON.parse(buffer)); }
        catch { reject(new Error('HoYoLAB returned an unreadable response')); }
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('HoYoLAB request timed out')));
    request.on('error', err => reject(new Error(/timed out/.test(err.message) ? err.message : 'Could not reach HoYoLAB (check your connection)')));
  });
}
function checkResponse(result) {
  if (!result || typeof result !== 'object') throw new Error('Invalid HoYoLAB response');
  if (result.retcode !== 0) {
    const code = Number(result.retcode);
    if (code === 10001 || code === -100 || code === -101 || code === -10001) throw new Error('HoYoLAB session expired. Please sign in again.');
    if (code === 10102 || code === 10103) throw new Error('Enable Real-Time Notes in HoYoLAB Battle Chronicle settings.');
    throw new Error(`HoYoLAB rejected this request (code ${Number.isFinite(code) ? code : 'unknown'}). Check Real-Time Notes or sign in again.`);
  }
  return result.data;
}
function finiteInt(value, fallback = 0, min = 0, max = 1_000_000_000) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}
function parseNotes(data, role, at = Date.now()) {
  if (!data || typeof data !== 'object' || !Number.isFinite(Number(data.current_resin))) {
    throw new Error('HoYoLAB did not provide a valid resin value');
  }
  const resinMax = finiteInt(data.max_resin, 200, 1, 500);
  const resin = finiteInt(data.current_resin, 0, 0, resinMax);
  const recoverySeconds = finiteInt(data.resin_recovery_time, 0, 0, 200 * 3600);
  const exp = Array.isArray(data.expeditions) ? data.expeditions.slice(0, 10).map((e, i) => {
    const remaining = finiteInt(e?.remained_time, 0, 0, 10 * 86400);
    const finished = String(e?.status || '').toLowerCase() === 'finished';
    return {
      id: `live-${i}`,
      name: `Expedition ${i + 1}`,
      status: finished ? 'finished' : String(e?.status || 'ongoing').toLowerCase(),
      endAt: finished ? at : at + remaining * 1000
    };
  }) : [];
  return {
    fetchedAt: at,
    account: role,
    resin: { value: resin, cap: resinMax, fullAt: resin === resinMax ? at : at + recoverySeconds * 1000 },
    commissions: {
      completed: finiteInt(data.finished_task_num, 0, 0, 100),
      total: finiteInt(data.total_task_num, 4, 0, 100),
      rewardClaimed: !!data.is_extra_task_reward_received
    },
    realm: {
      value: finiteInt(data.current_home_coin, 0),
      cap: finiteInt(data.max_home_coin, 2400),
      recoverySeconds: finiteInt(data.home_coin_recovery_time, 0)
    },
    weeklyDiscounts: {
      remaining: finiteInt(data.remain_resin_discount_num, 0, 0, 10),
      limit: finiteInt(data.resin_discount_num_limit, 3, 0, 10)
    },
    expeditions: exp,
    expeditionSlots: finiteInt(data.max_expedition_num, 5, 0, 10),
    transformer: data.transformer ? {
      obtained: !!data.transformer.obtained,
      ready: !!data.transformer.recovery_time?.reached,
      recovery: data.transformer.recovery_time ? [
        finiteInt(data.transformer.recovery_time.Day,0,0,7),
        finiteInt(data.transformer.recovery_time.Hour,0,0,24),
        finiteInt(data.transformer.recovery_time.Minute,0,0,60),
        finiteInt(data.transformer.recovery_time.Second,0,0,60)
      ] : null
    } : null,
    quests: data.archon_quest_progress && typeof data.archon_quest_progress==='object' ? {
      title: String(data.archon_quest_progress.archon_quest_title || data.archon_quest_progress.title || '').slice(0,100),
      chapter: String(data.archon_quest_progress.chapter || '').slice(0,70),
      status: String(data.archon_quest_progress.status || '').slice(0,50)
    } : null,
    encounter: data.daily_task && typeof data.daily_task==='object' ? {
      total: finiteInt(data.daily_task.total_num, 0,0,999),
      finished: finiteInt(data.daily_task.finished_num, 0,0,999),
      taskType: String(data.daily_task.task_type || '').slice(0,50)
    } : null
  };
}
function cookieDomainAllowed(domain) {
  const d = String(domain || '').replace(/^\./, '').toLowerCase();
  return ['hoyolab.com', 'hoyoverse.com', 'mihoyo.com'].some(host => d === host || d.endsWith('.' + host));
}
async function getAuthHeader(hoyoSession) {
  const cookies = await hoyoSession.cookies.get({});
  const selected = new Map();
  for (const c of cookies) {
    if (!AUTH_COOKIE_NAMES.has(c.name) || !cookieDomainAllowed(c.domain) || !c.value) continue;
    if (!selected.has(c.name) || c.domain.startsWith('.')) selected.set(c.name, c.value);
  }
  // The app never asks for a password or reads game files.
  if (!(['ltoken_v2','ltoken','cookie_token_v2','cookie_token','stoken','stoken_v2'].some(n => selected.has(n)))) {
    throw new Error('No HoYoLAB session found. Use Connect HoYoLAB, complete sign-in, then select your account.');
  }
  return [...selected.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function callWithFallback(urls, cookieHeader, headers = {}) {
  let lastError;
  for (const url of urls) {
    try { return checkResponse(await requestJson(url, cookieHeader, headers)); }
    catch (err) {
      lastError = err;
      // A permission/expiry error won't be fixed by changing official API host.
      if (/session expired|Enable Real-Time Notes|rejected this request/.test(err.message)) break;
    }
  }
  throw lastError || new Error('HoYoLAB API unavailable');
}
async function fetchRoles(hoyoSession) {
  const auth = await getAuthHeader(hoyoSession);
  const payload = await callWithFallback(ROLE_URLS, auth);
  const roles = (Array.isArray(payload?.list) ? payload.list : []).map(safeRole).filter(Boolean);
  if (!roles.length) throw new Error('No Genshin account was found in HoYoLAB. Make sure your game account is linked.');
  return roles;
}
async function fetchNotes(hoyoSession, role) {
  const auth = await getAuthHeader(hoyoSession);
  const safe = safeRole({ game_uid: role?.uid, region: role?.region, nickname: role?.nickname, level: role?.level });
  if (!safe) throw new Error('Select a valid linked Genshin account');
  const params = new URLSearchParams({ role_id: safe.uid, server: safe.region });
  const urls = NOTE_URLS.map(base => `${base}?${params}`);
  const payload = await callWithFallback(urls, auth, noteHeaders());
  return parseNotes(payload, safe);
}
module.exports = { fetchRoles, fetchNotes, parseNotes, safeRole, getAuthHeader, REFRESH_OPTIONS, REGION_MAP };
