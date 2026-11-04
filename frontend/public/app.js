const $ = (id) => document.getElementById(id);
const form = $('note-form');
let config;
let busy = false;
let refreshBusy = false;
let configured = false;
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

function notice(message = '', tone = 'success') {
  $('notice').textContent = message;
  $('notice').dataset.tone = tone;
  $('notice').hidden = !message;
}

function setBusy(value) {
  busy = value;
  for (const input of form.elements) input.disabled = value || !configured;
  $('submit-label').textContent = value ? '저장하고 있어요' : '메모 남기기';
  $('refresh').disabled = value || refreshBusy || !configured;
  for (const button of document.querySelectorAll('.delete-button')) button.disabled = value;
}

async function api(path, options = {}) {
  const response = await fetch(`${config.apiEndpoint}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? '요청을 처리하지 못했어요.');
  return data;
}

function errorMessage(error) {
  return error.name === 'TimeoutError' || error instanceof TypeError
    ? '서비스에 연결하지 못했어요. 잠시 후 새로고침해 주세요.'
    : error.message;
}

function connection(ok, health) {
  $('status-dot').dataset.state = ok ? 'ok' : 'error';
  $('connection-status').textContent = ok ? '모든 서비스가 연결됐어요' : 'API 연결을 확인해 주세요';
  $('be-version').textContent = health?.version ?? '-';
}

function renderNotes(notes) {
  $('notes').replaceChildren();
  $('note-count').textContent = notes.length;
  $('empty-state').hidden = notes.length > 0;
  $('empty-title').textContent = '첫 메모를 남겨 보세요';
  $('empty-description').textContent = '지금 떠오른 생각 하나면 충분해요.';
  for (const note of notes) {
    const card = document.createElement('article');
    card.className = 'note-card';
    const title = document.createElement('h3');
    title.textContent = note.title;
    const content = document.createElement('p');
    content.className = 'note-content';
    content.textContent = note.content;
    const footer = document.createElement('div');
    footer.className = 'note-footer';
    const date = document.createElement('time');
    date.className = 'note-date';
    date.dateTime = note.createdAt;
    date.textContent = dateFormat.format(new Date(note.createdAt));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.setAttribute('aria-label', `${note.title} 삭제`);
    remove.title = '메모 삭제';
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
    remove.disabled = busy;
    remove.addEventListener('click', () => deleteNote(note.id));
    footer.append(date, remove);
    card.append(title, content, footer);
    $('notes').append(card);
  }
}

async function refresh({ quiet = false } = {}) {
  refreshBusy = true;
  $('refresh').disabled = true;
  $('notes-section').setAttribute('aria-busy', 'true');
  if (!quiet) notice();
  try {
    const [health, data] = await Promise.all([api('/health'), api('/notes')]);
    connection(true, health);
    renderNotes(data.notes);
    $('last-updated').textContent = `${new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())} 업데이트`;
    return true;
  } catch (error) {
    connection(false);
    $('last-updated').textContent = '목록을 새로 불러오지 못했어요';
    $('empty-title').textContent = '연결을 기다리고 있어요';
    $('empty-description').textContent = '잠시 후 새로고침을 눌러 주세요.';
    notice(errorMessage(error), 'error');
    return false;
  } finally {
    refreshBusy = false;
    $('refresh').disabled = busy || !configured;
    $('notes-section').setAttribute('aria-busy', 'false');
  }
}

async function deleteNote(id) {
  if (busy) return;
  setBusy(true);
  notice();
  try {
    await api(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (await refresh({ quiet: true })) notice('메모를 삭제했어요.');
  } catch (error) {
    notice(errorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !configured) return;
  if (!$('title').value.trim()) {
    notice('제목을 입력해 주세요.', 'error');
    $('title').focus();
    return;
  }
  setBusy(true);
  notice();
  try {
    await api('/notes', {
      method: 'POST',
      body: JSON.stringify({ title: $('title').value, content: $('content').value }),
    });
    form.reset();
    $('character-count').textContent = '0 / 2,000';
    if (await refresh({ quiet: true })) notice('새 메모를 남겼어요.');
  } catch (error) {
    notice(errorMessage(error), 'error');
  } finally {
    setBusy(false);
    $('title').focus();
  }
});

$('content').addEventListener('input', () => {
  $('character-count').textContent = `${$('content').value.length.toLocaleString('ko-KR')} / 2,000`;
});
$('refresh').addEventListener('click', () => configured ? refresh() : initialize());

async function initialize() {
  $('refresh').disabled = true;
  try {
    const response = await fetch('/runtime-config.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('화면 설정을 불러오지 못했어요.');
    config = await response.json();
    $('app-name').textContent = config.appName;
    document.title = config.appName;
    $('environment').textContent = config.environment.toUpperCase();
    $('fe-version').textContent = config.version;
    configured = true;
    setBusy(false);
    await refresh();
  } catch (error) {
    connection(false);
    $('notes-section').setAttribute('aria-busy', 'false');
    $('empty-title').textContent = '화면 설정을 확인하고 있어요';
    $('empty-description').textContent = '잠시 후 새로고침을 눌러 주세요.';
    notice(errorMessage(error), 'error');
    $('refresh').disabled = false;
  }
}

initialize();
