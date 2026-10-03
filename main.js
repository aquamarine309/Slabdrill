import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const RESOURCE_NAME    = "混沌核心";
const HUNT_INTERVAL_MS = 1000;
const SUPABASE_URL = "https://twiljicmumgxgqpcrvxc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWxqaWNtdW1neGdxcGNydnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MTc4NjIsImV4cCI6MjEwNjQ5Mzg2Mn0.l92HzSwKWEPZZbPpJwhbkbVs64lhCs5Y0Egxh2RIIgg";
const BAN_REDIRECT  = "https://aquamarine309.github.io/ADChinese";

const USERNAME_DOMAIN = '@example.com';
const toEmail = (name) => name.trim().toLowerCase() + USERNAME_DOMAIN;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const stats = {
  resource: 0,
  draws: 0,
  hits: 0,
  sinceLastHit: 0,
  lastHunt: 0,
};

let currentUser = null;
let syncTimer = 0;
let lastChance = 0.01;

const $ = (id) => document.getElementById(id);

const resourceValueEl = $('resourceValue');
const statusLineEl    = $('statusLine');
const huntBtn         = $('huntBtn');
const leaderboardList = $('leaderboardList');

const authUserView    = $('authUserView');
const authEmailEl     = $('authEmail');
const authForm        = $('authForm');
const usernameInput   = $('usernameInput');
const passwordInput   = $('passwordInput');
const loginBtn        = $('loginBtn');
const signupBtn       = $('signupBtn');
const logoutBtn       = $('logoutBtn');

const drawsLineEl = $('drawsLine');
const expectLineEl  = $('expectLine');
const luckLineEl  = $('luckLine');


const TIERS = [
  { min: 0,    color: '#ffff00' },
  { min: 10,   color: '#ff8000' },
  { min: 50,   color: '#ff0000' },
  { min: 200,  color: '#ff2f92' },
  { min: 1000, color: '#b341e0' },
  { min: 5000, color: '#00e6ff' },
];

function tierColor(v) {
  let c = TIERS[0].color;
  for (const t of TIERS) if (v >= t.min) c = t.color;
  return c;
}

function fmtChance(p) {
  const pct = p * 100;
  if (pct === 0) return '0.00';
  if (pct >= 0.01) return pct.toFixed(2);
  if (pct >= 0.0001) return pct.toFixed(4);
  return pct.toExponential(2);
}

function fmtDuration(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

function updateHUD() {
  resourceValueEl.textContent = stats.resource;

  const color = tierColor(stats.resource);
  document.documentElement.style.setProperty('--accent', color);

  statusLineEl.innerHTML =
    `你当前有 <b>${stats.resource} ${RESOURCE_NAME}</b>。` +
    `每次猎取有 <b>${fmtChance(lastChance)}%</b> 的概率找到一个。` +
    (HUNT_INTERVAL_MS > 0
      ? ` 每 <b>${fmtDuration(HUNT_INTERVAL_MS)}</b> 可猎取一次。`
      : '');
  updateStats();
}

function bumpNumber() {
  resourceValueEl.classList.remove('bump');
  void resourceValueEl.offsetWidth;
  resourceValueEl.classList.add('bump');
}

function tick() {
  const elapsed = Date.now() - stats.lastHunt;
  const canHunt = elapsed >= HUNT_INTERVAL_MS;

  if (canHunt) {
    huntBtn.disabled = false;
    huntBtn.textContent = '猎取' + RESOURCE_NAME;
  } else {
    huntBtn.disabled = true;
    huntBtn.textContent = '等待' + fmtDuration(HUNT_INTERVAL_MS - elapsed);
  }
}

async function hunt() {
  const now = Date.now();
  if (now - stats.lastHunt < HUNT_INTERVAL_MS) return;
  stats.lastHunt = now;
  tick();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { alert('请先登录'); return; }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/hunt`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (res.status === 429) {
      const { waitMs } = await res.json();
      stats.lastHunt = Date.now() - HUNT_INTERVAL_MS + waitMs;
      tick();
      return;
    }
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    stats.resource     = data.resource;
    stats.draws        = data.draws;
    stats.sinceLastHit = data.sinceLastHit;
    lastChance         = data.chance;
    if (data.hit) bumpNumber();

    updateHUD();
  } catch (e) {
    console.error('猎取失败:', e);
  }
}
function renderAuthUI() {
  if (currentUser) {
    authUserView.hidden = false;
    authForm.hidden = true;
    authEmailEl.textContent = currentUser.user_metadata?.username
      || currentUser.email?.split('@')[0]
      || '';
  } else {
    authUserView.hidden = true;
    authForm.hidden = false;
  }
  renderLeaderboard(lastRows);
}

function checkInputs() {
  const name = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!USERNAME_RE.test(name)) {
    alert('用户名 3~16 位，只支持字母 / 数字 / 下划线');
    return null;
  }
  if (password.length < 6) {
    alert('密码至少 6 位');
    return null;
  }
  return { name, password };
}

async function handleLogin(e) {
  e.preventDefault();
  const input = checkInputs();
  if (!input) return;

  loginBtn.disabled = true;
  loginBtn.textContent = '登录中…';

  const { error } = await supabase.auth.signInWithPassword({
    email: toEmail(input.name),
    password: input.password,
  });

  loginBtn.disabled = false;
  loginBtn.textContent = '登录';

  if (error) {
    const msg = /invalid/i.test(error.message)
      ? '用户名或密码错误'
      : error.message;
    alert(msg);
    return;
  }
  passwordInput.value = '';
}

async function handleSignup() {
  const input = checkInputs();
  if (!input) return;

  signupBtn.disabled = true;
  signupBtn.textContent = '注册中…';

  const { data, error } = await supabase.auth.signUp({
    email: toEmail(input.name),
    password: input.password,
    options: { data: { username: input.name } },
  });

  signupBtn.disabled = false;
  signupBtn.textContent = '注册';

  if (error) {
    const msg = /already/i.test(error.message)
      ? '这个用户名已经被注册了'
      : error.message;
    alert(msg);
    return;
  }
  if (!data.session) {
    alert('注册成功，请点登录（若开启了邮箱验证需先去邮箱点链接）');
  }
  passwordInput.value = '';
}

async function handleLogout() {
  await supabase.auth.signOut();
}

function scheduleSync(delay = 800) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncProfile, delay);
}

async function syncProfile() {
  if (!currentUser) return;

  const username = currentUser.user_metadata?.username
    || currentUser.email?.split('@')[0]
    || 'player';

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: currentUser.id,
      username,
      chaos_cores: stats.resource,
      total_hunts: stats.draws,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) console.error('同步存档失败:', error);
}

async function loadProfile() {
  if (!currentUser) {
    stats.resource = stats.draws = stats.hits = 0;
    stats.sinceLastHit = stats.lastHunt = 0;
    lastChance = 0;
    updateHUD(); tick();
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/hunt`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    if (!res.ok) throw new Error(await res.text());

    const data = await res.json();
    stats.resource     = data.resource;
    stats.draws        = data.draws;
    stats.sinceLastHit = data.sinceLastHit;
    stats.hits         = 0;
    lastChance         = data.chance;

    if (data.cooldownRemainingMs > 0) {
      stats.lastHunt = Date.now() - HUNT_INTERVAL_MS + data.cooldownRemainingMs;
    } else {
      stats.lastHunt = 0;
    }

    updateHUD(); tick();
  } catch (e) {
    console.error('加载存档失败:', e);
  }
}

let lastRows = [];
let lastMeInfo = { meRow: null, meRank: -1 };

function makeLeaderboardRow(p, index, isMe) {
  const li = document.createElement('li');
  if (isMe) li.classList.add('is-me');

  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = `#${index + 1}`;

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = p.username || '匿名';

  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = p.total_hunts != null ? `${p.total_hunts} 抽` : '';

  const sc = document.createElement('span');
  sc.className = 'score';
  sc.textContent = p.chaos_cores ?? 0;

  li.append(rank, name, meta, sc);
  return li;
}

function renderLeaderboard(rows, meInfo) {
  lastRows = rows || [];
  if (meInfo !== undefined) lastMeInfo = meInfo || { meRow: null, meRank: -1 };

  const meRow  = currentUser ? lastMeInfo.meRow  : null;
  const meRank = currentUser ? lastMeInfo.meRank : -1;

  leaderboardList.innerHTML = '';

  if (!lastRows.length && !meRow) {
    const li = document.createElement('li');
    li.className = 'c-board__empty';
    li.textContent = '还没有人上榜';
    leaderboardList.appendChild(li);
    return;
  }

  lastRows.forEach((p, i) => {
    leaderboardList.appendChild(
      makeLeaderboardRow(p, i, !!currentUser && p.id === currentUser.id)
    );
  });

  if (meRow && meRank >= 0) {
    const sep = document.createElement('li');
    sep.className = 'c-board__sep';
    sep.textContent = '···';
    leaderboardList.appendChild(sep);

    leaderboardList.appendChild(makeLeaderboardRow(meRow, meRank, true));
  }
}

const LEADERBOARD_LIMIT = 50;

async function updateLeaderboard() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, chaos_cores, total_hunts')
      .order('chaos_cores', { ascending: false })
      .order('total_hunts', { ascending: true })
      .order('updated_at',  { ascending: true })
      .limit(LEADERBOARD_LIMIT);

    if (error) throw error;

    const rows = data || [];
    let meInfo = { meRow: null, meRank: -1 };

    if (currentUser) {
      const idx = rows.findIndex(r => r.id === currentUser.id);

      if (idx < 0) {
        // 不在前 50，需要算真实名次 + 取自己的资料
        const { data: rankedIds, error: rankErr } = await supabase
          .from('profiles')
          .select('id')
          .order('chaos_cores', { ascending: false })
          .order('total_hunts', { ascending: true })
          .order('updated_at',  { ascending: true });

        if (rankErr) throw rankErr;

        const meRank = (rankedIds || []).findIndex(r => r.id === currentUser.id);

        if (meRank >= 0) {
          const { data: meData, error: meErr } = await supabase
            .from('profiles')
            .select('id, username, chaos_cores, total_hunts')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (meErr) throw meErr;
          meInfo = { meRow: meData || null, meRank };
        }
      }
    }

    renderLeaderboard(rows, meInfo);
  } catch (e) {
    console.error('排行榜加载失败:', e);
    leaderboardList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'c-board__empty';
    li.textContent = '加载失败';
    leaderboardList.appendChild(li);
  }
}

huntBtn.addEventListener('click', hunt);
authForm.addEventListener('submit', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', handleLogout);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input')) {
    e.preventDefault();
    if (!huntBtn.disabled) hunt();
  }
});

const { data: { session } } = await supabase.auth.getSession();
currentUser = session?.user ?? null;
renderAuthUI();
await loadProfile();
supabase.auth.onAuthStateChange(async (_event, sess) => {
  currentUser = sess?.user ?? null;
  renderAuthUI();
  await loadProfile();
  updateLeaderboard();
});

function pAt(r) {
  return Math.pow(10, -1 - 0.2 * r);
}

function expectedDraws(R) {
  let mean = 0, variance = 0;
  for (let r = 0; r < R; r++) {
    const p = pAt(r);
    mean     += 1 / p;
    variance += (1 - p) / (p * p);
  }
  return { mean, sd: Math.sqrt(variance) };
}

function computeZ(resource, draws) {
  if (resource <= 0 || draws <= 0) return null;
  const { mean, sd } = expectedDraws(resource);
  if (sd <= 0) return null;
  return (mean - draws) / sd;
}

function luckLabel(z) {
  if (z >=  2) return { text: 'S7', color: '#ff2f92' };
  if (z >=  1) return { text: '⁹δ', color: '#ff8000' };
  if (z >  -1) return { text: '正常', color: '#ffff00' };
  if (z >  -2) return { text: '低', color: '#b341e0' };
  return         { text: '寄', color: '#00e6ff' };
}

function updateStats() {
  drawsLineEl.textContent = stats.draws > 0 ? `已抽 ${stats.draws} 次` : '';

  if (stats.resource < 3 || stats.draws <= 0) {
    luckLineEl.textContent = '';
    luckLineEl.style.color = '';
    return;
  }

  const z = computeZ(stats.resource, stats.draws);
  if (z === null) { luckLineEl.textContent = ''; return; }

  const { text, color } = luckLabel(z);
  const sign = z >= 0 ? '+' : '';
  luckLineEl.textContent = `[${text}]  运气指数z = ${sign}${z.toFixed(2)}`;
  luckLineEl.style.color = color;

  const { mean } = expectedDraws(stats.resource);
  expectLine.textContent = `按当前概率，拿 ${stats.resource} 个平均要抽 ${fmtNum(mean)} 次，你用了 ${stats.draws} 次`;
}

luckLineEl.addEventListener('click', () => {
  if (!luckLineEl.textContent) return;
  expectLineEl.hidden = !expectLineEl.hidden;
});

function fmtNum(n) {
  if (n < 1e4) return Math.round(n).toString();
  if (n < 1e8) return (n / 1e4).toFixed(1) + '万';
  return (n / 1e8).toFixed(2) + '亿';
}

updateHUD();
tick();
setInterval(tick, 100);
updateLeaderboard();

refreshBtn.addEventListener('click', updateLeaderboard);

setInterval(updateLeaderboard, 10000);