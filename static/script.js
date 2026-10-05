/* Small, dependency-free client for uploads, chat, source cards, and themes. */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { history: [], docs: [], busy: false, toastTimer: null };
const input = $('#question'), messages = $('#messages'), scroll = $('#chatScroll');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(message, type = '') {
  const box = $('#toast'); box.textContent = message; box.className = `toast show ${type}`;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => box.className = 'toast', 3200);
}
function renderMarkdown(text) {
  // Escape first, then support the small Markdown subset used in study answers.
  let safe = escapeHtml(text).replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const blocks = safe.split(/\n\s*\n/);
  return blocks.map(block => {
    if (block.startsWith('<pre>')) return block;
    const lines = block.split('\n');
    if (lines.every(line => /^\s*[-*]\s+/.test(line))) return '<ul>' + lines.map(line => `<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`).join('') + '</ul>';
    if (lines.every(line => /^\s*\d+[.)]\s+/.test(line))) return '<ol>' + lines.map(line => `<li>${line.replace(/^\s*\d+[.)]\s+/, '')}</li>`).join('') + '</ol>';
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}
function addMessage(role, text, options = {}) {
  const wrap = document.createElement('article'); wrap.className = `message ${role}`;
  const label = role === 'user' ? 'YOU' : 'STUDYBUDDY';
  let content = options.notFound ? `<div class="not-found-card"><svg viewBox="0 0 60 55" fill="none" aria-hidden="true"><path d="M7 17c9-5 16-4 23 1v29c-7-5-14-6-23-2V17Z" stroke="currentColor" stroke-width="1.5"/><path d="M53 17c-9-5-16-4-23 1v29c7-5 14-6 23-2V17Z" stroke="currentColor" stroke-width="1.5"/><path d="M13 24c5-2 9-2 13 0m-13 6c4-2 8-2 12 0m21-6c-5-2-9-2-13 0m13 6c-4-2-8-2-12 0" stroke="currentColor" opacity=".55"/><path d="m27 10 3-5 3 5m9 0 2-3 2 3" stroke="currentColor"/></svg><div><strong>No page turned up.</strong><p>${escapeHtml(text)}</p></div></div>` : renderMarkdown(text);
  wrap.innerHTML = `<div class="avatar">${role === 'user' ? '◌' : '✳'}</div><div class="message-body"><div class="message-label">${label} · ${role === 'assistant' ? 'GROUNDED RESPONSE' : 'YOUR QUESTION'}</div><div class="bubble">${content}</div>${options.answer ? '<div class="answer-actions"><button class="copy-answer">▣ Copy answer</button></div>' : ''}</div>`;
  messages.appendChild(wrap); scrollToBottom(); return wrap;
}
function scrollToBottom() { requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; }); }
function highlightSnippet(text, question) {
  let result = escapeHtml(text);
  const terms = [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []))].slice(0, 8);
  terms.forEach(term => { const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); result = result.replace(new RegExp(`(${escaped})`, 'ig'), '<mark>$1</mark>'); });
  return result;
}
function showSources(sources, question) {
  const body = $('#evidenceBody'); $('#sourceCount').textContent = sources.length ? `${sources.length} PASSAGES` : '';
  if (!sources.length) { body.innerHTML = '<div class="evidence-empty"><div class="empty-star">✧</div><strong>No source cards this time</strong><p>Only sufficiently relevant passages are shown.</p><div class="evidence-rule"></div><span>READ · RETRIEVE · REASON</span></div>'; return; }
  body.innerHTML = sources.map((source, i) => {
    const score = Math.max(0, Math.min(100, Math.round(source.score * 100)));
    return `<div class="evidence-card" id="source-${i}"><div class="card-top"><span class="card-file" title="${escapeHtml(source.doc)}">${escapeHtml(source.doc)}</span><span class="card-page">PAGE ${source.page}</span></div><div class="card-snippet">${highlightSnippet(source.snippet, question)}</div><div class="relevance-row"><span>RELEVANCE</span><strong>${score}% MATCH</strong></div><div class="relevance-track"><i data-width="${score}%"></i></div></div>`;
  }).join('');
  requestAnimationFrame(() => $$('.relevance-track i', body).forEach(bar => bar.style.width = bar.dataset.width));
}
function addSourceChips(answerNode, sources) {
  if (!sources.length) return;
  const bubble = $('.bubble', answerNode);
  const chips = document.createElement('div'); chips.className = 'source-chips';
  chips.innerHTML = sources.map((s, i) => `<button class="source-chip" data-source="${i}">↗ ${escapeHtml(s.doc)} · p.${s.page}</button>`).join('');
  bubble.appendChild(chips);
  $$('.source-chip', chips).forEach(button => button.addEventListener('click', () => {
    const card = $(`#source-${button.dataset.source}`); card?.scrollIntoView({behavior:'smooth', block:'nearest'}); card?.classList.add('highlight'); setTimeout(() => card?.classList.remove('highlight'), 1300);
  }));
}
function updateFilterLabel() {
  const selected = $$('.doc-check:checked').map(c => c.value);
  $('#filterLabel').textContent = state.docs.length && selected.length < state.docs.length ? `· Searching ${selected.length} of ${state.docs.length}` : '';
}
async function loadDocuments() {
  try {
    const response = await fetch('/documents'); state.docs = await response.json();
    $('#docCount').textContent = state.docs.length;
    if (!state.docs.length) { $('#documents').innerHTML = '<div class="shelf-empty">Your shelf is waiting<br>for its first book.</div>'; }
    else $('#documents').innerHTML = state.docs.map(doc => `<div class="book"><span class="book-spine"></span><span class="book-icon">${doc.name.toLowerCase().endsWith('.pdf') ? '▧' : '▤'}</span><div class="book-meta"><div class="book-title" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div><div class="book-sub"><span class="ready-dot"></span>${doc.pages} ${doc.pages === 1 ? 'page' : 'pages'} <span>·</span> ${doc.chunks} chunks</div></div><div class="book-actions"><input class="doc-check" type="checkbox" value="${escapeHtml(doc.name)}" checked aria-label="Include ${escapeHtml(doc.name)} in search"><button class="delete-doc" data-name="${escapeHtml(doc.name)}" aria-label="Delete ${escapeHtml(doc.name)}" title="Remove document">×</button></div></div>`).join('');
    $$('.delete-doc').forEach(button => button.addEventListener('click', () => deleteDocument(button.dataset.name)));
    $$('.doc-check').forEach(input => input.addEventListener('change', updateFilterLabel)); updateFilterLabel();
  } catch { toast('Could not load your document shelf.', 'error'); }
}
async function deleteDocument(name) {
  try { const response = await fetch(`/documents/${encodeURIComponent(name)}`, {method:'DELETE'}); if (!response.ok) throw new Error(); await loadDocuments(); toast(`Removed ${name} from the shelf.`, 'success'); }
  catch { toast('Could not remove that document.', 'error'); }
}
function uploadFiles(fileList) {
  const files = [...fileList]; if (!files.length) return;
  files.forEach(file => {
    const job = document.createElement('div'); job.className = 'upload-job'; job.innerHTML = `<div class="job-row"><span>${escapeHtml(file.name)}</span><span class="job-state">Reading…</span></div><div class="job-track"><i></i></div>`; $('#uploadJobs').appendChild(job);
    const bar = $('.job-track i', job), label = $('.job-state', job); let progress = 12;
    const timer = setInterval(() => { progress = Math.min(83, progress + 6); bar.style.width = `${progress}%`; label.textContent = ['Reading…','Chunking…','Embedding…'][Math.min(2, Math.floor(progress / 30))]; }, 550);
    const data = new FormData(); data.append('files', file);
    fetch('/upload', {method:'POST', body:data}).then(r => r.json().then(payload => ({ok:r.ok,payload}))).then(({ok,payload}) => {
      clearInterval(timer); const result = payload.files?.[0];
      if (!ok || result?.status !== 'Ready') { bar.style.background = 'var(--red)'; bar.style.width = '100%'; label.textContent = 'Error'; toast(result?.error || payload.error || 'Upload failed.', 'error'); }
      else { bar.style.width = '100%'; label.textContent = '✦ Ready'; job.classList.add('ready'); toast(`${result.name} is ready · ${result.chunks} chunks indexed.`, 'success'); loadDocuments(); }
      setTimeout(() => job.remove(), 6500);
    }).catch(() => { clearInterval(timer); label.textContent = 'Error'; toast('Upload failed. Check that the server is running.', 'error'); });
  });
}
async function ask(question = input.value.trim()) {
  if (!question || state.busy) return;
  if (!state.docs.length) { toast('Add a PDF or TXT note to your shelf first.', 'error'); return; }
  $('#welcome').classList.add('hidden'); addMessage('user', question); input.value = ''; input.style.height = 'auto';
  const history = state.history.slice(-8); state.busy = true; $('#sendButton').disabled = true; $('#typing').classList.add('visible');
  try {
    const selected = $$('.doc-check:checked').map(c => c.value);
    if (!selected.length) { toast('Select at least one document on the shelf.', 'error'); state.busy = false; $('#sendButton').disabled = false; $('#typing').classList.remove('visible'); return; }
    const response = await fetch('/ask', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,history,selected_docs:selected})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not answer that question.');
    const answerNode = addMessage('assistant', data.answer, {answer:data.found, notFound:!data.found});
    if (data.found) { addSourceChips(answerNode, data.sources); showSources(data.sources, data.standalone_question || question); }
    else showSources([], question);
    state.history.push({role:'user',content:question},{role:'assistant',content:data.answer});
  } catch (error) { addMessage('assistant', error.message || 'The answer service had a problem.'); toast(error.message || 'Answer failed.', 'error'); }
  finally { state.busy = false; $('#sendButton').disabled = false; $('#typing').classList.remove('visible'); input.focus(); }
}
$('#askForm').addEventListener('submit', event => { event.preventDefault(); ask(); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight,130)}px`; });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(); } });
$('#fileInput').addEventListener('change', event => { uploadFiles(event.target.files); event.target.value = ''; });
$('#dropZone').addEventListener('dragover', event => { event.preventDefault(); $('#dropZone').classList.add('dragging'); });
$('#dropZone').addEventListener('dragleave', () => $('#dropZone').classList.remove('dragging'));
$('#dropZone').addEventListener('drop', event => { event.preventDefault(); $('#dropZone').classList.remove('dragging'); uploadFiles(event.dataTransfer.files); });
$('#suggestions').addEventListener('click', event => { const button = event.target.closest('[data-q]'); if (button) ask(button.dataset.q); });
messages.addEventListener('click', async event => { if (event.target.closest('.copy-answer')) { const text = event.target.closest('.message-body').querySelector('.bubble').innerText; try { await navigator.clipboard.writeText(text); toast('Answer copied.', 'success'); } catch { toast('Could not access clipboard.', 'error'); } } });
$('#newChat').addEventListener('click', () => { state.history = []; messages.innerHTML = ''; $('#welcome').classList.remove('hidden'); showSources([], ''); toast('A fresh page, ready when you are.', 'success'); });
$('#exportBtn').addEventListener('click', () => $('#exportMenu').classList.toggle('open'));
$('#exportMenu').addEventListener('click', event => {
  const format = event.target.dataset.format; if (!format) return;
  const entries = $$('.message').map(message => `${$('.message-label', message).textContent.split(' · ')[0]}\n${$('.bubble', message).innerText}`).join('\n\n---\n\n');
  const content = format === 'md' ? `# StudyBuddy conversation\n\n${entries}` : `StudyBuddy conversation\n\n${entries}`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], {type:'text/plain'})); link.download = `studybuddy-conversation.${format}`; link.click(); URL.revokeObjectURL(link.href); $('#exportMenu').classList.remove('open'); toast('Conversation exported.', 'success');
});
document.addEventListener('click', event => { if (!event.target.closest('.export-wrap')) $('#exportMenu').classList.remove('open'); });
$('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('day'); localStorage.setItem('studybuddy-theme', document.body.classList.contains('day') ? 'day' : 'night'); });
if (localStorage.getItem('studybuddy-theme') === 'day') document.body.classList.add('day');
$('#howBtn').addEventListener('click', () => $('#howModal').classList.add('open'));
$('#modalClose').addEventListener('click', () => $('#howModal').classList.remove('open'));
$('#modalDone').addEventListener('click', () => $('#howModal').classList.remove('open'));
$('#howModal').addEventListener('click', event => { if (event.target === $('#howModal')) $('#howModal').classList.remove('open'); });
$('#collapseEvidence').addEventListener('click', () => $('#evidence').classList.toggle('collapsed'));
function shelf(open) { $('#shelf').classList.toggle('open', open); $('#scrim').classList.toggle('show', open); }
$('#openShelf').addEventListener('click', () => shelf(true)); $('#closeShelf').addEventListener('click', () => shelf(false)); $('#scrim').addEventListener('click', () => shelf(false));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); input.focus(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); state.history = []; messages.innerHTML = ''; $('#welcome').classList.remove('hidden'); showSources([], ''); toast('Chat cleared.', 'success'); }
  if (event.key === 'Escape') { $('#howModal').classList.remove('open'); shelf(false); }
});

// Tiny drifting star field. It stops moving when the visitor asks for reduced motion.
const canvas = $('#sky'), ctx = canvas.getContext('2d'); let stars = [], frame;
function sizeSky() { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; ctx.setTransform(dpr,0,0,dpr,0,0); stars = Array.from({length:Math.min(65,Math.floor(innerWidth/18))},() => ({x:Math.random()*innerWidth,y:Math.random()*innerHeight,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,r:Math.random()*1.2+.3})); }
function drawSky() { ctx.clearRect(0,0,innerWidth,innerHeight); const color = getComputedStyle(document.body).getPropertyValue('--gold').trim(); for (const a of stars) { a.x += a.vx; a.y += a.vy; if(a.x<0||a.x>innerWidth)a.vx*=-1;if(a.y<0||a.y>innerHeight)a.vy*=-1; ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,Math.PI*2);ctx.fillStyle=color;ctx.globalAlpha=.42;ctx.fill();for(const b of stars){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d<95){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.globalAlpha=(1-d/95)*.07;ctx.stroke();}}}ctx.globalAlpha=1; if(!matchMedia('(prefers-reduced-motion: reduce)').matches) frame=requestAnimationFrame(drawSky); }
sizeSky(); drawSky(); addEventListener('resize',sizeSky); loadDocuments();
