const $ = (selector) => document.querySelector(selector);
const messagesEl = $('#messages');
const promptEl = $('#prompt');
const sendEl = $('#send');
const modelEl = $('#model');
let chats = JSON.parse(localStorage.getItem('local-chat-history') || '[]');
let activeId = chats[0]?.id || null;
let generating = false;
const savedSettings = JSON.parse(localStorage.getItem('local-chat-settings') || '{}');

const save = () => localStorage.setItem('local-chat-history', JSON.stringify(chats.slice(0, 30)));
const activeChat = () => chats.find(c => c.id === activeId);
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Escape model-produced HTML first; Markdown formatting still works without allowing script injection.
const markdown = value => window.marked ? marked.parse(escapeHtml(value), {breaks:true}) : escapeHtml(value).replaceAll('\n','<br>');

function renderHistory() {
  $('#history').innerHTML = chats.map(c => `<button class="history-item ${c.id===activeId?'active':''}" data-id="${c.id}">${escapeHtml(c.title)}</button>`).join('');
  document.querySelectorAll('.history-item').forEach(button => button.onclick = () => { activeId=button.dataset.id; render(); });
}

function render() {
  const chat = activeChat();
  if (!chat?.messages.length) {
    messagesEl.innerHTML = `<div id="welcome"><div class="hero-logo">L</div><h1>Your private AI workspace</h1><p>Ask questions, write code, or explore ideas. Everything stays on this machine.</p><div class="suggestions"><button>Explain a difficult concept simply</button><button>Help me brainstorm a project idea</button><button>Write a Python script to organize files</button><button>Review this code for potential bugs</button></div></div>`;
    bindSuggestions();
  } else {
    messagesEl.innerHTML = chat.messages.map(m => messageHtml(m.role,m.content)).join('');
  }
  renderHistory();
  messagesEl.scrollTop=messagesEl.scrollHeight;
}

function messageHtml(role, content, extra='') {
  return `<article class="message ${role} ${extra}"><div class="avatar">${role==='user'?'You':'L'}</div><div class="content">${markdown(content)}</div></article>`;
}

function bindSuggestions() {
  document.querySelectorAll('.suggestions button').forEach(b => b.onclick = () => { promptEl.value=b.textContent; resizePrompt(); promptEl.focus(); });
}

function newChat() {
  activeId=null; render(); promptEl.focus();
}

async function sendMessage(text) {
  if (!text.trim() || generating) return;
  let chat=activeChat();
  if (!chat) {
    chat={id:crypto.randomUUID(), title:text.trim().slice(0,45), messages:[]};
    chats.unshift(chat); activeId=chat.id;
  }
  chat.messages.push({role:'user',content:text.trim()});
  chat.messages.push({role:'assistant',content:''});
  generating=true; sendEl.disabled=true; promptEl.value=''; resizePrompt(); render();
  const assistantNode=messagesEl.lastElementChild;
  assistantNode.classList.add('cursor');
  try {
    const system=$('#system-prompt').value.trim();
    const messages=[...(system?[{role:'system',content:system}]:[]), ...chat.messages.slice(0,-1).filter(m=>m.content.trim())];
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:modelEl.value,messages,temperature:+$('#temperature').value,top_p:+$('#top-p').value})});
    if (!response.ok) throw new Error(await response.text());
    const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer='';
    while (true) {
      const {value,done}=await reader.read(); if (done) break;
      buffer+=decoder.decode(value,{stream:true}); const lines=buffer.split('\n'); buffer=lines.pop();
      for (const line of lines) if (line) {
        const event=JSON.parse(line);
        if (event.error) throw new Error(event.error);
        if (event.content) { chat.messages.at(-1).content+=event.content; assistantNode.querySelector('.content').innerHTML=markdown(chat.messages.at(-1).content); messagesEl.scrollTop=messagesEl.scrollHeight; }
      }
    }
  } catch (error) {
    chat.messages.at(-1).content=`Error: ${error.message}`;
    assistantNode.querySelector('.content').innerHTML=`<span class="error">${escapeHtml(chat.messages.at(-1).content)}</span>`;
  } finally { assistantNode.classList.remove('cursor'); generating=false; sendEl.disabled=false; save(); renderHistory(); }
}

async function loadModels() {
  try {
    const data=await fetch('/api/health').then(r=>r.json());
    if (!savedSettings.systemPrompt && data.default_system_prompt) $('#system-prompt').value=data.default_system_prompt;
    const models=data.models.length?data.models:[data.default_model];
    modelEl.innerHTML=models.map(m=>`<option ${m===data.default_model?'selected':''}>${escapeHtml(m)}</option>`).join('');
    if (!data.ok) modelEl.title='Ollama is not running yet';
  } catch { modelEl.innerHTML='<option>qwen2:7b</option>'; }
}

function resizePrompt(){ promptEl.style.height='auto'; promptEl.style.height=Math.min(promptEl.scrollHeight,180)+'px'; }
$('#composer').onsubmit=e=>{e.preventDefault();sendMessage(promptEl.value)};
promptEl.oninput=resizePrompt;
promptEl.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(promptEl.value)}};
$('#new-chat').onclick=newChat;
$('#menu').onclick=()=>$('#sidebar').classList.toggle('open');
$('#settings-button').onclick=()=>$('#settings').showModal();
$('#settings').addEventListener('close', () => localStorage.setItem('local-chat-settings', JSON.stringify({
  systemPrompt: $('#system-prompt').value,
  temperature: $('#temperature').value,
  topP: $('#top-p').value
})));
$('#temperature').oninput=e=>$('#temperature-value').value=e.target.value;
$('#top-p').oninput=e=>$('#top-p-value').value=e.target.value;
if (savedSettings.systemPrompt) $('#system-prompt').value=savedSettings.systemPrompt;
if (savedSettings.temperature) { $('#temperature').value=savedSettings.temperature; $('#temperature-value').value=savedSettings.temperature; }
if (savedSettings.topP) { $('#top-p').value=savedSettings.topP; $('#top-p-value').value=savedSettings.topP; }
loadModels(); render();
