// Frontend logic for Script Master

const api = window.scriptAPI;

const els = {
  list: document.getElementById('scriptList'),
  newBtn: document.getElementById('newScriptBtn'),
  name: document.getElementById('scriptName'),
  shell: document.getElementById('scriptShell'),
  saveBtn: document.getElementById('saveScriptBtn'),
  runBtn: document.getElementById('runScriptBtn'),
  stopBtn: document.getElementById('stopScriptBtn'),
  deleteBtn: document.getElementById('deleteScriptBtn'),
  content: document.getElementById('scriptContent'),
  output: document.getElementById('output'),
  clearOutputBtn: document.getElementById('clearOutputBtn')
};

let currentId = null;

function fmtDate(ts){
  if(!ts) return ''; return new Date(ts).toLocaleString();
}

async function refreshList(selectId) {
  const scripts = await api.list();
  els.list.innerHTML = '';
  scripts.forEach(s => {
    const li = document.createElement('li');
    li.dataset.id = s.id;
    li.innerHTML = `<strong>${s.name}</strong><br><small>${s.shell} • ${fmtDate(s.updatedAt)}</small>`;
    if (s.id === selectId) li.classList.add('active');
    li.addEventListener('click', () => loadScript(s.id));
    els.list.appendChild(li);
  });
}

function clearEditor() {
  currentId = null;
  els.name.value = '';
  els.shell.value = 'powershell';
  els.content.value = '';
  els.output.textContent = '';
  updateButtons();
}

async function loadScript(id) {
  try {
    const s = await api.get(id);
    currentId = s.id;
    els.name.value = s.name;
    els.shell.value = s.shell;
    els.content.value = s.content;
    els.output.textContent = '';
    await refreshList(id);
    updateButtons();
  } catch (e) {
    console.error(e);
    alert('Failed to load script');
  }
}

async function saveCurrent() {
  const result = await api.save({ id: currentId, name: els.name.value, shell: els.shell.value, content: els.content.value });
  if (result && result.error) {
    if (result.code === 'NAME_CONFLICT') {
      els.name.classList.add('error');
      showTempMessage('Name already exists', 'error');
      return;
    }
    showTempMessage(result.error || 'Save failed', 'error');
    return;
  }
  els.name.classList.remove('error');
  currentId = result.id;
  await refreshList(currentId);
  updateButtons();
}

async function deleteCurrent() {
  if (!currentId) return; 
  if (!confirm('Delete this script?')) return;
  await api.delete(currentId);
  clearEditor();
  await refreshList();
}

function appendOutput({type, message, code}){
  if(type==='end') {
    els.output.textContent += `\n[Process exited with code ${code}]`; 
  } else if (type==='start') {
    els.output.textContent += `[${message}]\n`; 
  } else {
    const tag = type==='stderr' ? 'ERR' : type==='stdout' ? 'OUT' : type.toUpperCase();
    els.output.textContent += message.split(/\r?\n/).filter(l=>l.length).map(l=>`[${tag}] ${l}`).join('\n') + '\n';
  }
  els.output.scrollTop = els.output.scrollHeight;
}

function updateButtons(running=false){
  els.runBtn.disabled = !currentId || running;
  els.stopBtn.disabled = !running;
  els.deleteBtn.disabled = !currentId || running;
}

async function runCurrent(){
  if(!currentId) return; await saveCurrent();
  els.output.textContent = '';
  updateButtons(true);
  await api.run(currentId);
}

function stopCurrent(){
  if(!currentId) return; api.stop(currentId); }

// --- Duplicate name live feedback ---
let nameCheckTimeout;
els.name.addEventListener('input', async () => {
  clearTimeout(nameCheckTimeout);
  nameCheckTimeout = setTimeout(async () => {
    const list = await api.list();
    const val = els.name.value.trim();
    const duplicate = list.find(s => s.name.toLowerCase() === val.toLowerCase() && s.id !== currentId);
    if (duplicate) {
      els.name.classList.add('error');
    } else {
      els.name.classList.remove('error');
    }
  }, 250);
});

// --- Lightweight transient message display ---
let msgDiv;
function ensureMsgDiv(){
  if(!msgDiv){
    msgDiv = document.createElement('div');
    msgDiv.id = 'toastMsg';
    document.body.appendChild(msgDiv);
  }
  return msgDiv;
}
function showTempMessage(text, type='info', ms=2500){
  const d = ensureMsgDiv();
  d.textContent = text;
  d.className = type;
  d.style.opacity = '1';
  setTimeout(()=>{ d.style.opacity='0'; }, ms);
}

// Event wiring
els.newBtn.addEventListener('click', () => { clearEditor(); });
els.saveBtn.addEventListener('click', saveCurrent);
els.deleteBtn.addEventListener('click', deleteCurrent);
els.runBtn.addEventListener('click', runCurrent);
els.stopBtn.addEventListener('click', stopCurrent);
els.clearOutputBtn.addEventListener('click', () => { els.output.textContent=''; });

api.onOutput(data => {
  appendOutput(data);
  if(data.type==='end' || data.type==='error') {
    updateButtons(false);
  }
});

refreshList();
clearEditor();
