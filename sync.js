const $ = id => document.getElementById(id);
const app = window.GoalApp;
const core = window.GoalSyncCore;
const GUEST_KEY = 'goal-management-v1';
const config = window.FIREBASE_CONFIG || {};
const configured = ['apiKey', 'authDomain', 'projectId', 'appId'].every(key => !!config[key]);
let auth, db, authAPI, storeAPI, user = null, state = null, remote = new Map();
let lastView = core.copy(app.getGoals()), unsubscribe = null, epoch = 0;
let ready = !configured, running = null, listening = false, authBusy = false;
let serverConfirmed = false;
let syncError = '';

const status = message => { $('syncStatus').textContent = message; };
const cacheKey = uid => `goal-management-account-v1:${config.projectId}:${uid}`;
function readGuest() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || '[]'); }
  catch { return []; }
}
function persist() { localStorage.setItem(cacheKey(user.uid), JSON.stringify(state)); }
function updateStatus() {
  $('retrySyncButton').hidden = !user || !syncError;
  if (!user) return;
  if (syncError) status(syncError);
  else if (!navigator.onLine) status(`오프라인 · 이 기기에 보관 중${state.pending.length ? ' · 연결되면 동기화' : ''}`);
  else if (!serverConfirmed) status('계정 기록 불러오는 중…');
  else if (state.pending.length) status(`동기화 중 · 남은 변경 ${state.pending.length}건`);
  else status('계정에 동기화 완료');
}
function display(goals) {
  lastView = core.copy(goals);
  app.setGoals(goals);
}
function importButton() {
  $('importLocalButton').hidden = !user || !ready || state.imported || !readGuest().length;
}
window.goalSync = {
  canEdit: () => ready,
  save(goals) {
    if (!ready) throw new Error('Account is not ready');
    if (!user) {
      localStorage.setItem(GUEST_KEY, JSON.stringify(goals));
      lastView = core.copy(goals);
      return;
    }
    const operations = core.diff(lastView, goals);
    const next = {...state, goals: core.copy(goals), pending: [...state.pending, ...operations]};
    // Save the outbox before sending. Reloads/offline sessions retain unsent edits.
    localStorage.setItem(cacheKey(user.uid), JSON.stringify(next));
    state = next;
    lastView = core.copy(goals);
    updateStatus();
    void flush();
  }
};

function friendly(error) {
  const code = error?.code || '';
  const message = ({
    'auth/invalid-email': '이메일 주소를 확인해 주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/wrong-password': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/user-not-found': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/email-already-in-use': '이미 가입한 이메일입니다. 로그인 또는 비밀번호 재설정을 이용해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상으로 입력해 주세요.',
    'auth/password-does-not-meet-requirements': '프로젝트에서 정한 비밀번호 조건을 충족하지 않습니다.',
    'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '인터넷 연결을 확인하고 다시 시도해 주세요.',
    'auth/operation-not-allowed': '이메일 로그인이 아직 활성화되지 않았습니다.',
    'auth/unauthorized-domain': '이 웹주소의 로그인이 아직 허용되지 않았습니다.',
    'auth/invalid-api-key': 'Firebase 연결 키가 올바르지 않습니다. 프로젝트의 웹 앱 설정값을 다시 확인해 주세요.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase 연결 키가 올바르지 않습니다. 프로젝트의 웹 앱 설정값을 다시 확인해 주세요.',
    'auth/app-not-authorized': '현재 웹 앱에서 이 Firebase 연결 키를 사용할 수 없습니다. 프로젝트의 웹 앱 설정을 확인해 주세요.',
    'auth/configuration-not-found': 'Firebase 로그인 설정을 찾을 수 없습니다. Authentication 설정을 확인해 주세요.',
    'auth/admin-restricted-operation': '현재 프로젝트에서 회원가입이 제한되어 있습니다. Authentication 설정을 확인해 주세요.',
    'auth/requests-from-referer-<empty>-are-blocked.': '현재 접속 주소에서 로그인이 허용되지 않습니다. 배포된 웹주소로 접속해 주세요.',
    'permission-denied': '동기화 권한이 없습니다. 데이터베이스 보안 규칙을 확인해 주세요.',
    'unavailable': '서버에 연결할 수 없습니다. 연결 후 다시 시도해 주세요.',
    'resource-exhausted': '동기화 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
  })[code] || '처리하지 못했습니다. 연결과 계정 설정을 확인하고 다시 시도해 주세요.';
  // Display only the SDK error identifier, never raw responses or credentials.
  const identifier = /^(?:auth\/)?[a-z0-9._-]{1,160}$/i.test(code) ? code : '';
  return message + (identifier ? `\n오류 코드: ${identifier}` : '');
}

function startListener(token) {
  unsubscribe?.();
  listening = true;
  const uid = user.uid;
  let serverSeen = false;
  unsubscribe = storeAPI.onSnapshot(storeAPI.collection(db, 'users', uid, 'goals'),
    {includeMetadataChanges: true}, snapshot => {
      if (token !== epoch) return;
      // A new SDK memory cache is empty, including on an offline cached account.
      // Keep our account cache until this listener has seen the server at least once.
      if (snapshot.metadata.fromCache && !serverSeen) return;
      if (!snapshot.metadata.fromCache) { serverSeen = true; serverConfirmed = true; }
      remote = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
      ready = true;
      syncError = '';
      const goals = core.overlay(remote, state.pending);
      state.goals = core.copy(goals);
      try { persist(); } catch { syncError = '이 기기의 저장 공간이 부족합니다. 브라우저 저장 공간을 확인해 주세요.'; }
      display(goals);
      importButton();
      updateStatus();
      void flush();
    }, error => {
      if (token !== epoch) return;
      listening = false;
      syncError = friendly(error);
      updateStatus();
    });
}

async function flush() {
  const token = epoch;
  if (!user || !ready || !navigator.onLine || syncError || running === token) return;
  running = token;
  const uid = user.uid;
  try {
    while (token === epoch && state.pending.length && navigator.onLine) {
      const operation = core.copy(state.pending[0]);
      const reference = storeAPI.doc(db, 'users', uid, 'goals', operation.id);
      // mergeFields prevents an empty dates map from replacing existing repetitions.
      const fields = Object.keys(operation.patch).filter(key => !['dates','quantities'].includes(key));
      for (const map of ['dates','quantities']) for (const key of Object.keys(operation.patch[map] || {})) fields.push(new storeAPI.FieldPath(map, key));
      await storeAPI.setDoc(reference, operation.patch, {mergeFields: fields});
      if (token !== epoch) return;
      state.pending.shift();
      persist();
      updateStatus();
    }
  } catch (error) {
    if (token === epoch) {
      syncError = friendly(error);
      updateStatus();
    }
  } finally {
    if (running === token) running = null;
  }
}

function switchAccount(nextUser) {
  const token = ++epoch;
  unsubscribe?.(); unsubscribe = null;
  listening = false; running = null; syncError = ''; serverConfirmed = false;
  app.closeDialogs();
  user = nextUser;
  $('loginButton').hidden = !!user;
  $('logoutButton').hidden = !user;
  $('accountEmail').textContent = user ? user.email : '로그인하면 여러 기기에서 기록을 함께 사용할 수 있습니다.';
  if (!user) {
    state = null; remote = new Map(); ready = true;
    display(readGuest());
    $('retrySyncButton').hidden = true;
    $('importLocalButton').hidden = true;
    status('이 기기에 저장 중 · 로그인하면 여러 기기에서 동기화');
    return;
  }
  try { state = JSON.parse(localStorage.getItem(cacheKey(user.uid)) || 'null'); }
  catch { state = null; }
  const cached = state && Array.isArray(state.goals) && Array.isArray(state.pending);
  if (!cached) state = {goals: [], pending: [], imported: false};
  ready = !!cached;
  remote = new Map(state.goals.map(goal => [goal.id, core.toRemote(goal)]));
  display(core.copy(state.goals));
  importButton();
  updateStatus();
  startListener(token);
}

async function authenticate(mode) {
  if (authBusy) return;
  if (!auth) { $('authMessage').textContent = '로그인 연결 설정이 필요합니다. 관리자에게 문의해 주세요.'; return; }
  const emailInput = $('authEmail'), passwordInput = $('authPassword');
  if (!emailInput.reportValidity() || (mode !== 'reset' && !passwordInput.reportValidity())) return;
  const email = emailInput.value.trim(), password = passwordInput.value;
  authBusy = true;
  for (const id of ['signInButton', 'signUpButton', 'resetPasswordButton']) $(id).disabled = true;
  $('authMessage').textContent = '처리 중…';
  try {
    if (mode === 'reset') {
      await authAPI.sendPasswordResetEmail(auth, email);
      $('authMessage').textContent = '가입한 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.';
    } else {
      if (mode === 'signup') await authAPI.createUserWithEmailAndPassword(auth, email, password);
      else await authAPI.signInWithEmailAndPassword(auth, email, password);
      passwordInput.value = '';
      $('authDialog').close();
    }
  } catch (error) { $('authMessage').textContent = friendly(error); }
  finally {
    authBusy = false;
    for (const id of ['signInButton', 'signUpButton', 'resetPasswordButton']) $(id).disabled = false;
  }
}
$('loginButton').onclick = () => {
  $('authMessage').textContent = configured ? '' : '로그인 연결 설정이 필요합니다. 관리자에게 문의해 주세요.';
  $('authDialog').showModal();
};
$('authDialog').addEventListener('close', () => { $('authPassword').value = ''; });
$('authForm').onsubmit = event => { event.preventDefault(); void authenticate('signin'); };
$('signUpButton').onclick = () => void authenticate('signup');
$('resetPasswordButton').onclick = () => void authenticate('reset');
$('logoutButton').onclick = async () => {
  try { await authAPI.signOut(auth); }
  catch { status('로그아웃하지 못했습니다. 다시 시도해 주세요.'); }
};
$('retrySyncButton').onclick = () => {
  syncError = '';
  if (user && !listening) startListener(epoch);
  updateStatus(); void flush();
};
$('importLocalButton').onclick = () => {
  if (!user || !ready || state.imported) return;
  if (!confirm('이 기기에 저장된 기존 목표와 실행 기록을 현재 로그인한 계정에 추가하시겠습니까?')) return;
  const imported = readGuest().map(goal => {
    // Import as new goals; never overwrite a similarly named account goal.
    return {...core.copy(goal), id: crypto.randomUUID()};
  });
  try {
    const merged = [...app.getGoals(), ...imported];
    window.goalSync.save(merged);
    state.imported = true; persist();
    display(merged); importButton();
  } catch { status('기기 기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'); }
};
window.addEventListener('online', () => {
  syncError = '';
  if (user && !listening) startListener(epoch);
  updateStatus(); void flush();
});
window.addEventListener('offline', updateStatus);

async function boot() {
  if (!configured) {
    status('이 기기에 저장 중 · 이메일 로그인 연결 준비 중');
    return;
  }
  try {
    const sdk = 'https://www.gstatic.com/firebasejs/13.1.0/';
    const [appAPI, loadedAuth, loadedStore] = await Promise.all([
      import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js'), import(sdk + 'firebase-firestore.js')
    ]);
    authAPI = loadedAuth; storeAPI = loadedStore;
    const firebase = appAPI.initializeApp(config);
    auth = authAPI.getAuth(firebase);
    db = storeAPI.getFirestore(firebase);
    await authAPI.setPersistence(auth, authAPI.browserLocalPersistence);
    authAPI.onAuthStateChanged(auth, switchAccount, error => { ready = true; status(friendly(error)); });
  } catch (error) {
    ready = true;
    status('로그인 서버에 연결하지 못했습니다. 기기 기록은 사용할 수 있습니다. 인터넷 연결 후 새로고침해 주세요.');
  }
}
void boot();

