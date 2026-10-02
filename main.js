import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ====================================================================
 *   ↓↓↓  改这三块  ↓↓↓
 * ==================================================================== */

const RESOURCE_NAME    = "混沌核心";
const HUNT_INTERVAL_MS = 1000;              // 0 = 无冷却

// 概率函数：0~1
// stats = { resource, draws, hits, sinceLastHit }
function getChance(stats) {
  return Math.pow(10, -0.2 * stats.resource - 1);
}

// 奖励函数：非负整数
function getReward(stats) {
  return 1;
}

/* ====================================================================
 *   ↑↑↑  改完就不用动下面了  ↑↑↑
 * ==================================================================== */


/* ========================= 配置 ========================= */
const SUPABASE_URL = "https://twiljicmumgxgqpcrvxc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWxqaWNtdW1neGdxcGNydnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MTc4NjIsImV4cCI6MjEwNjQ5Mzg2Mn0.l92HzSwKWEPZZbPpJwhbkbVs64lhCs5Y0Egxh2RIIgg";
const BAN_REDIRECT  = "https://aquamarine309.github.io/ADChinese";

// 用户名 → 假邮箱。玩家永远看不到后缀。
const USERNAME_DOMAIN = '@example.com';
const toEmail = (name) => name.trim().toLowerCase() + USERNAME_DOMAIN;

// 只允许：字母、数字、下划线、中文
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,16}$/;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ========================= 状态 ========================= */
const stats = {
  resource: 0,
  draws: 0,
  hits: 0,
  sinceLastHit: 0,
  lastHunt: 0,
};

let currentUser = null;
let syncTimer = 0;

/* ========================= DOM ========================= */
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

/* ========================= 配色阶梯 ========================= */
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

/* ========================= 工具 ========================= */
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

/* ========================= HUD ========================= */
function updateHUD() {
  resourceValueEl.textContent = stats.resource;

  const color = tierColor(stats.resource);
  document.documentElement.style.setProperty('--accent', color);

  const chance = Math.max(0, Math.min(1, getChance(stats)));
  statusLineEl.innerHTML =
    `你当前有 <b>${stats.resource} ${RESOURCE_NAME}</b>。` +
    `每次猎取有 <b>${fmtChance(chance)}%</b> 的概率找到一个。` +
    (HUNT_INTERVAL_MS > 0 ? `每 <b>${fmtDuration(HUNT_INTERVAL_MS)}</b> 可猎取一次。` : '');
}

function bumpNumber() {
  resourceValueEl.classList.remove('bump');
  void resourceValueEl.offsetWidth;
  resourceValueEl.classList.add('bump');
}

/* ========================= 冷却倒计时 ========================= */
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

/* ========================= 核心：一次猎取 ========================= */
function hunt() {
  const now = Date.now();
  if (now - stats.lastHunt < HUNT_INTERVAL_MS) return;

  stats.lastHunt = now;

  const chance = Math.max(0, Math.min(1, getChance(stats)));
  if (Math.random() < chance) {
    stats.resource += Math.max(0, Math.floor(getReward(stats)));
    stats.hits++;
    stats.sinceLastHit = 0;
    bumpNumber();
    scheduleSync();
  } else {
    stats.sinceLastHit++;
  }

  stats.draws++;
  updateHUD();
  tick();
}

/* ========================= 账号 UI ========================= */
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
    alert('用户名 3~16 位，只支持字母 / 数字 / 下划线 / 中文');
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
    options: { data: { username: input.name } },   // 触发器会读这个
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

  // 后台关了邮箱验证的话，data.session 直接就有值，onAuthStateChange 会处理
  if (!data.session) {
    alert('注册成功，请点登录（若开启了邮箱验证需先去邮箱点链接）');
  }
  passwordInput.value = '';
}

async function handleLogout() {
  await supabase.auth.signOut();
}

/* ========================= 存档同步（一对一 upsert） ========================= */
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncProfile, 800);
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
    stats.resource = 0;
    stats.draws = 0;
    stats.hits = 0;
    stats.sinceLastHit = 0;
    stats.lastHunt = 0;
    updateHUD();
    tick();
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('chaos_cores, total_hunts')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('读取存档失败:', error);
    return;
  }

  stats.resource     = data?.chaos_cores ?? 0;
  stats.draws        = data?.total_hunts ?? 0;
  stats.hits         = 0;
  stats.sinceLastHit = 0;
  stats.lastHunt     = 0;

  updateHUD();
  tick();
}

/* ========================= 排行榜 ========================= */
let lastRows = [];

function renderLeaderboard(rows) {
  lastRows = rows || [];
  leaderboardList.innerHTML = '';

  if (!lastRows.length) {
    const li = document.createElement('li');
    li.className = 'c-board__empty';
    li.textContent = '还没有人上榜';
    leaderboardList.appendChild(li);
    return;
  }

  lastRows.forEach((p, i) => {
    const li = document.createElement('li');
    if (currentUser && p.id === currentUser.id) li.classList.add('is-me');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${i + 1}`;

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
    leaderboardList.appendChild(li);
  });
}

async function updateLeaderboard() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, chaos_cores, total_hunts')
      .order('chaos_cores', { ascending: false })
      .limit(50);

    if (error) throw error;

    renderLeaderboard(data || []);
  } catch (e) {
    console.error('排行榜加载失败:', e);
    leaderboardList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'c-board__empty';
    li.textContent = '加载失败';
    leaderboardList.appendChild(li);
  }
}

/* ========================= 事件 ========================= */
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

/* ========================= 初始化 ========================= */
if (localStorage.getItem('bx') === '1') {
  location.replace(BAN_REDIRECT);
} else {
  document.title = RESOURCE_NAME;

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

  updateHUD();
  tick();
  setInterval(tick, 100);
  updateLeaderboard();
}

refreshBtn.addEventListener('click', updateLeaderboard);