// ---- Supabase setup ----
// Paste your project's URL and public anon key from Supabase → Project settings → API.
const SUPABASE_URL='https://gkmqfxlebecqgqqtwisn.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable__56CqKPAYts8T_ON0JwpWQ_02tChiOZ';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const today=()=>new Date().toISOString().slice(0,10);
const defaults={budget:1800,steps:0,habits:[false,false,false,false],transactions:[{type:'income',amount:3200,category:'Salary',note:'Monthly pay'},{type:'expense',amount:520,category:'Housing',note:'Rent and utilities'},{type:'expense',amount:264,category:'Groceries',note:'Food and essentials'},{type:'expense',amount:118,category:'Transport',note:'Travel this month'},{type:'expense',amount:91,category:'Health',note:'Gym and pharmacy'},{type:'expense',amount:146,category:'Social',note:'Meals and plans'}].map((t,i)=>({...t,id:`sample-${i}`,date:today()})),tasks:[]};
const baseCategories=['Bills','Education','Entertainment','Food & dining','Groceries','Health','Housing','Income','Shopping','Social','Subscriptions','Transport','Travel'];
let data=null;
let currentUser=null;
let saveTimer=null;
let pendingSync=false;
let syncInFlight=false;

function normalizeData(){
  data.transactions=(data.transactions||[]).map((transaction,index)=>({id:transaction.id||`legacy-${Date.now()}-${index}`,date:transaction.date||today(),note:transaction.note||'',...transaction}));
  if(!data.simpleStartApplied){data.steps=0;data.habits=[false,false,false,false];data.tasks=[];data.simpleStartApplied=true}
  data.history=Array.isArray(data.history)?data.history:[];
  data.statements=Array.isArray(data.statements)?data.statements:[];
}
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(n);
const dateLabel=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(`${date}T12:00:00`));

// ---- Offline-first local cache ----
const localKey=userId=>`dashboard-cache-${userId}`;
function saveLocal(){
  if(!currentUser)return;
  try{localStorage.setItem(localKey(currentUser.id),JSON.stringify({data,updatedAt:Date.now()}))}
  catch(e){console.error('Local cache write failed',e)}
}
function loadLocalCache(userId){
  try{
    const raw=localStorage.getItem(localKey(userId));
    return raw?JSON.parse(raw):null
  }catch(e){console.error('Local cache read failed',e);return null}
}

function updateSyncBadge(state){
  const dot=qs('#sync-dot'),label=qs('#sync-status');
  if(!dot||!label)return;
  dot.className='sync-dot '+(state==='synced'?'':state);
  dot.title={synced:'Synced',syncing:'Syncing…',offline:'Offline — changes saved on this device',error:'Sync error — will retry when online'}[state]||'';
  label.textContent={synced:'Synced',syncing:'Syncing…',offline:'Offline — saved on this device',error:'Sync error — will retry'}[state]||''
}

async function syncToRemote(){
  if(!currentUser)return;
  if(!navigator.onLine){pendingSync=true;updateSyncBadge('offline');return}
  syncInFlight=true;
  updateSyncBadge('syncing');
  const{error}=await supabaseClient.from('dashboard_data').upsert({id:currentUser.id,data,updated_at:new Date().toISOString()});
  syncInFlight=false;
  if(error){
    console.error('Save failed',error);
    pendingSync=true;
    updateSyncBadge('error')
  }else{
    pendingSync=false;
    updateSyncBadge('synced')
  }
}
function save(){
  saveLocal();
  if(!currentUser)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(syncToRemote,500)
}
window.addEventListener('online',()=>{
  if(!currentUser)return;
  toast('Back online — syncing your data');
  syncToRemote()
});
window.addEventListener('offline',()=>{
  if(currentUser)updateSyncBadge('offline')
});
const qs=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const currentMonth=()=>new Date().toISOString().slice(0,7);
const monthLabel=month=>new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(new Date(`${month}-01T12:00:00`));
const thisMonthsTransactions=()=>data.transactions.filter(transaction=>transaction.date.startsWith(currentMonth()));
const newId=()=>`transaction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let toastTimer;
function toast(message){clearTimeout(toastTimer);qs('#toast-message').textContent=message;qs('#toast').classList.add('show');toastTimer=setTimeout(()=>qs('#toast').classList.remove('show'),2800)}
function celebrate(){const wrap=qs('#confetti'),colors=['#e4775b','#2862df','#a4cf86','#e0ad4e','#f2b5a3'];wrap.innerHTML=Array.from({length:54},(_,i)=>`<i class="confetti-piece" style="left:${Math.random()*100}%;background:${colors[i%colors.length]};--drift:${-160+Math.random()*320}px;animation-delay:${Math.random()*.35}s"></i>`).join('');setTimeout(()=>wrap.innerHTML='',2300)}
function totals(transactions=thisMonthsTransactions()){const income=transactions.filter(t=>t.type==='income').reduce((sum,t)=>sum+t.amount,0),spent=transactions.filter(t=>t.type==='expense').reduce((sum,t)=>sum+t.amount,0);return{income,spent,saved:income-spent,available:data.budget-spent}}
function closePreviousMonth(){const month=currentMonth();if(!data.activeMonth){data.activeMonth=month;return false}if(data.activeMonth===month)return false;const previousTransactions=data.transactions||[],income=previousTransactions.filter(item=>item.type==='income').reduce((sum,item)=>sum+item.amount,0),spent=previousTransactions.filter(item=>item.type==='expense').reduce((sum,item)=>sum+item.amount,0);data.statements.unshift({month:data.activeMonth,budget:data.budget||0,income,spent,saved:income-spent,transactions:previousTransactions,steps:data.steps||0,habits:data.habits.filter(Boolean).length,tasksCompleted:data.tasks.filter(task=>task.done).length,tasksTotal:data.tasks.length});data.statements=data.statements.slice(0,24);data.transactions=[];data.budget=0;data.steps=0;data.habits=[false,false,false,false];data.tasks=[];data.history=[];data.activeMonth=month;save();return true}
function renderStatements(){const list=qs('#statement-list');list.innerHTML=data.statements.map(statement=>`<article class="statement-card"><div><span>${monthLabel(statement.month)}</span><strong>${money(statement.saved)} saved</strong></div><dl><div><dt>Income</dt><dd>${money(statement.income)}</dd></div><div><dt>Spent</dt><dd>${money(statement.spent)}</dd></div><div><dt>Budget</dt><dd>${money(statement.budget)}</dd></div></dl><p>${statement.transactions.length} transactions · ${statement.habits}/4 habits on the final day · ${statement.tasksCompleted}/${statement.tasksTotal} tasks complete</p></article>`).join('')||'<p class="empty-state">Your completed-month statements will appear here automatically.</p>'}
function categoryOptions(){return [...new Set([...baseCategories,...data.transactions.map(t=>t.category)])].sort((a,b)=>a.localeCompare(b))}
function renderCategoryOptions(){qs('#category-options').innerHTML=categoryOptions().map(category=>`<option value="${esc(category)}"></option>`).join('')}
function renderTransactionList(){const filter=qs('#transaction-filter'),previous=filter.value||'all',categories=categoryOptions();filter.innerHTML=`<option value="all">All categories</option>${categories.map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('')}`;filter.value=categories.includes(previous)?previous:'all';const visible=thisMonthsTransactions().filter(t=>filter.value==='all'||t.category===filter.value).sort((a,b)=>b.date.localeCompare(a.date));qs('#transaction-subtitle').textContent=filter.value==='all'?'This month':`${filter.value} · this month`;qs('#transaction-list').innerHTML=visible.map(t=>`<li class="transaction-item"><span class="transaction-mark ${t.type}">${t.type==='income'?'↑':'↓'}</span><div class="transaction-info"><strong>${esc(t.category)}</strong><span>${esc(t.note||dateLabel(t.date))}${t.note?` · ${dateLabel(t.date)}`:''}</span></div><em class="transaction-kind">${t.type}</em><b class="transaction-amount ${t.type}">${t.type==='income'?'+':'−'}${money(t.amount)}</b><span class="transaction-actions"><button data-edit-transaction="${t.id}">Edit</button><button class="delete-transaction" data-delete-transaction="${t.id}" aria-label="Delete ${esc(t.category)} transaction">Delete</button></span></li>`).join('');qs('#empty-transactions').hidden=visible.length>0}
function renderFinance(){const {income,spent,saved,available}=totals();qs('#available-money').textContent=money(available);qs('#income-total').textContent=money(income);qs('#expense-total').textContent=money(spent);qs('#saved-total').textContent=money(saved);qs('#savings-rate').textContent=income?`${Math.max(0,saved/income*100).toFixed(0)}% of income`:'0% of income';qs('#spend-note').textContent=data.budget?`${Math.max(0,spent/data.budget*100).toFixed(0)}% of budget used`:'No monthly budget';qs('#budget-used').textContent=money(spent);qs('#budget-total').textContent=money(data.budget);const percent=data.budget?Math.min(100,spent/data.budget*100):0;qs('#budget-progress').style.width=`${percent}%`;qs('#budget-progress').style.background=spent>data.budget?'#e4775b':'#2862df';qs('#budget-status').textContent=data.budget?(spent>data.budget?`${money(spent-data.budget)} over your limit — adjust gently.`:`${money(data.budget-spent)} remains for the month.`):'Add a budget to keep spending intentional.';const categories={};thisMonthsTransactions().filter(t=>t.type==='expense').forEach(t=>categories[t.category]=(categories[t.category]||0)+t.amount);const max=Math.max(...Object.values(categories),1);qs('#spending-bars').innerHTML=Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([category,value])=>`<div class="spending-row"><label title="${esc(category)}">${esc(category)}</label><div class="bar-track"><span style="width:${value/max*100}%"></span></div><b>${money(value)}</b></div>`).join('')||'<p class="empty-state">Add expenses to see a category breakdown.</p>';renderCategoryOptions();renderTransactionList()}
const habitInfo=[['💧','Drink water','Aim for 6–8 glasses'],['🧘','Move your body','Any movement counts'],['🥗','Nourish well','Choose something colourful'],['🌙','Wind down','Protect your sleep']];
function renderHabits(){qs('#habit-grid').innerHTML=habitInfo.map(([icon,name,sub],i)=>`<button class="habit-card ${data.habits[i]?'complete':''}" data-habit="${i}"><span class="habit-check">✓</span><span class="habit-icon">${icon}</span><h3>${name}</h3><p>${sub}</p></button>`).join('');qs('#streak-count').textContent=data.habits.every(Boolean)?1:0;qs('#steps-input').value=data.steps||'';qs('#step-summary').textContent=data.steps?`${data.steps.toLocaleString()} / 8,000 steps`:'No steps logged'}
function renderTasks(){const open=data.tasks.filter(t=>!t.done);qs('#task-count').textContent=`${open.length} remaining`;qs('#task-list').innerHTML=data.tasks.map((t,i)=>`<li class="task-item"><input type="checkbox" data-task="${i}" ${t.done?'checked':''}><span>${esc(t.text)}</span><em class="priority ${t.priority}">${t.priority}</em><button class="task-delete" data-delete="${i}" aria-label="Delete ${esc(t.text)}">×</button></li>`).join('');qs('#empty-tasks').hidden=data.tasks.length>0;const focus=open[0];qs('#focus-task').textContent=focus?focus.text:'Your day is in balance.';qs('#focus-message').textContent=focus?'Start with the task that will make the rest of the day lighter.':'Take a breath, enjoy the space you created, and choose your next intention.'}
function renderScore(){const {spent}=totals(),finance=data.budget?Math.max(0,Math.min(100,(1-spent/data.budget)*100)):50,health=(data.habits.filter(Boolean).length/4*70)+(Math.min(data.steps,8000)/8000*30),tasks=data.tasks.length?data.tasks.filter(t=>t.done).length/data.tasks.length*100:0,hasPersonalProgress=data.steps>0||data.habits.some(Boolean)||data.tasks.some(task=>task.done),score=hasPersonalProgress?Math.round((finance+health+tasks)/3):0;qs('#balance-score').textContent=score;qs('.score-ring').style.background=`conic-gradient(#e4775b ${score*3.6}deg,#e7edf0 0deg)`;qs('#score-message').textContent=score>=75?'You’re finding your rhythm':score>=45?'A few wins away':'Start with one small win';qs('#score-nudge').textContent=score>=75?'Lovely consistency — protect your rhythm.':score>=45?'One small action will lift your balance.':'Choose one simple win to begin.';return score}
function sevenDays(){return Array.from({length:7},(_,i)=>{const day=new Date();day.setHours(12,0,0,0);day.setDate(day.getDate()-6+i);return day})}
function syncHistory(score){const entry={date:today(),score};const existing=data.history.findIndex(item=>item.date===entry.date);if(existing>-1)data.history[existing]=entry;else data.history.push(entry);data.history=data.history.slice(-90)}
function renderProgress(){const history=Object.fromEntries(data.history.map(item=>[item.date,item]));const days=sevenDays(),week=days.map(day=>history[day.toISOString().slice(0,10)]||{score:0}),active=week.filter(day=>day.score>0).length;qs('#week-summary').textContent=active?`${active} day${active===1?'':'s'} checked in`:'Start with today';qs('#weekly-chart').innerHTML=days.map((day,index)=>{const item=week[index],label=day.toLocaleDateString('en-GB',{weekday:'narrow'});return `<div class="day-progress ${index===6?'today':''}"><div class="day-bar"><i style="height:${item.score?Math.max(8,item.score):0}%"></i></div><strong>${item.score||'—'}</strong><span>${label}</span></div>`}).join('')}
function renderMobileSummary(score){qs('#mobile-score').textContent=score;qs('#mobile-tasks').textContent=data.tasks.filter(task=>!task.done).length;qs('#mobile-steps').textContent=data.steps?data.steps.toLocaleString():'—'}
function render(){renderFinance();renderHabits();renderTasks();renderStatements();const score=renderScore();syncHistory(score);renderProgress();renderMobileSummary(score);save()}
function openTransaction(id){const form=qs('#transaction-form'),transaction=data.transactions.find(t=>t.id===id);form.reset();form.dataset.editId=id||'';qs('#transaction-modal-title').textContent=transaction?'Edit transaction':'Add transaction';form.elements.type.value=transaction?.type||'expense';form.elements.amount.value=transaction?.amount||'';form.elements.category.value=transaction?.category||'';form.elements.date.value=transaction?.date||today();form.elements.note.value=transaction?.note||'';qs('#transaction-modal').showModal()}
document.querySelectorAll('[data-modal]').forEach(button=>button.onclick=()=>button.dataset.modal==='transaction-modal'?openTransaction():qs('#'+button.dataset.modal).showModal());document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>qs('#'+button.dataset.close).close());qs('#edit-budget').onclick=()=>{qs('#budget-form [name=budget]').value=data.budget;qs('#budget-modal').showModal()};qs('#transaction-filter').onchange=renderTransactionList;qs('#transaction-form').onsubmit=event=>{event.preventDefault();const form=event.target,fields=new FormData(form),transaction={type:fields.get('type'),amount:Number(fields.get('amount')),category:fields.get('category').trim(),date:fields.get('date'),note:fields.get('note').trim()};const existing=data.transactions.find(t=>t.id===form.dataset.editId);if(existing){Object.assign(existing,transaction)}else{data.transactions.push({id:newId(),...transaction})}form.closest('dialog').close();render();toast(existing?'Transaction updated':'Transaction saved')};qs('#task-form').onsubmit=event=>{event.preventDefault();const fields=new FormData(event.target);data.tasks.push({text:fields.get('task'),priority:fields.get('priority'),done:false});event.target.closest('dialog').close();event.target.reset();render();toast('Task added to today')};qs('#budget-form').onsubmit=event=>{event.preventDefault();data.budget=Number(new FormData(event.target).get('budget'));event.target.closest('dialog').close();render();toast('Monthly budget updated')};document.addEventListener('click',event=>{const habit=event.target.closest('[data-habit]');if(habit){const index=+habit.dataset.habit;data.habits[index]=!data.habits[index];render();toast(data.habits[index]?`${habitInfo[index][1]} completed`:`${habitInfo[index][1]} reopened`)}const task=event.target.closest('[data-task]');if(task){data.tasks[+task.dataset.task].done=task.checked;render();toast(task.checked?'Task complete — nice work':'Task reopened')}const deleteTask=event.target.closest('[data-delete]');if(deleteTask){data.tasks.splice(+deleteTask.dataset.delete,1);render();toast('Task removed')}const editTransaction=event.target.closest('[data-edit-transaction]');if(editTransaction)openTransaction(editTransaction.dataset.editTransaction);const deleteTransaction=event.target.closest('[data-delete-transaction]');if(deleteTransaction){const transaction=data.transactions.find(t=>t.id===deleteTransaction.dataset.deleteTransaction);if(transaction&&confirm(`Delete ${transaction.category} (${money(transaction.amount)})?`)){data.transactions=data.transactions.filter(t=>t.id!==transaction.id);render();toast('Transaction deleted')}}});qs('#save-steps').onclick=()=>{data.steps=Number(qs('#steps-input').value)||0;render();toast('Movement saved')};qs('#complete-day').onclick=()=>{data.habits=[true,true,true,true];data.tasks.forEach(t=>t.done=true);render();qs('#complete-day').textContent='✓ Day complete';celebrate();toast('Beautiful work — today is complete!')};qs('#reset-data').onclick=()=>{if(confirm('Reset all your dashboard data to the sample values?')){data=structuredClone(defaults);data.simpleStartApplied=true;data.history=[];render();toast('Sample data restored')}};
qs('#quick-add').onclick=()=>qs('#quick-add-modal').showModal();document.querySelectorAll('[data-quick]').forEach(button=>button.onclick=()=>{qs('#quick-add-modal').close();if(button.dataset.quick==='transaction')openTransaction();if(button.dataset.quick==='task')qs('#task-modal').showModal();if(button.dataset.quick==='steps'){qs('#habits').scrollIntoView({behavior:'smooth'});setTimeout(()=>qs('#steps-input').focus(),450)}});document.querySelectorAll('.mobile-nav a').forEach(link=>link.onclick=()=>{document.querySelectorAll('.mobile-nav a').forEach(item=>item.classList.remove('active'));link.classList.add('active')});
qs('#reset-data').onclick=()=>{if(confirm('Reset all your dashboard data to the sample values?')){data=structuredClone(defaults);data.simpleStartApplied=true;data.history=[];data.statements=[];data.activeMonth=currentMonth();render();toast('Sample data restored')}};
function updateClock(){qs('#live-time').textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit'}).format(new Date())}

function bootstrapApp(){
  const monthRolledOver=closePreviousMonth();
  const now=new Date();
  qs('#today-label').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
  qs('#month-name').textContent=now.toLocaleDateString('en-GB',{month:'long'});
  updateClock();
  setInterval(updateClock,30000);
  render();
  if(monthRolledOver)toast('Last month has been saved as a statement. Your new month starts at zero.');
}

// ---- Auth ----
function showAuthScreen(){
  qs('#auth-screen').style.display='flex';
  qs('.app-shell').style.display='none';
}
function showApp(){
  qs('#auth-screen').style.display='none';
  qs('.app-shell').style.display='';
}
function authError(message){
  const el=qs('#auth-error');
  if(!message){el.hidden=true;el.textContent='';return}
  el.hidden=false;el.textContent=message
}
function closeAccountMenu(){
  qs('#account-dropdown').hidden=true;
  qs('#account-trigger').setAttribute('aria-expanded','false')
}
qs('#account-trigger').addEventListener('click',event=>{
  event.stopPropagation();
  const dropdown=qs('#account-dropdown'),willOpen=dropdown.hidden;
  dropdown.hidden=!willOpen;
  qs('#account-trigger').setAttribute('aria-expanded',String(willOpen))
});
document.addEventListener('click',event=>{
  if(!event.target.closest('.account-menu'))closeAccountMenu()
});
qs('.auth-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-auth-tab]');
  if(!button)return;
  document.querySelectorAll('.auth-tab').forEach(tab=>tab.classList.toggle('active',tab===button));
  qs('#signin-form').hidden=button.dataset.authTab!=='signin';
  qs('#signup-form').hidden=button.dataset.authTab!=='signup';
  authError(null)
});
qs('#signin-form').onsubmit=async event=>{
  event.preventDefault();
  authError(null);
  const fields=new FormData(event.target);
  const{error}=await supabaseClient.auth.signInWithPassword({email:fields.get('email'),password:fields.get('password')});
  if(error)authError(error.message)
};
qs('#signup-form').onsubmit=async event=>{
  event.preventDefault();
  authError(null);
  const fields=new FormData(event.target);
  const{error}=await supabaseClient.auth.signUp({email:fields.get('email'),password:fields.get('password')});
  if(error){authError(error.message);return}
  authError('Check your inbox to confirm your email, then sign in.')
};
qs('#log-out').onclick=async()=>{
  closeAccountMenu();
  await supabaseClient.auth.signOut()
};
qs('#switch-account').onclick=async()=>{
  closeAccountMenu();
  pendingAuthNote='Signed out. Sign in with a different account below.';
  await supabaseClient.auth.signOut()
};

function loadUserData(userId){
  const cached=loadLocalCache(userId);
  data=cached&&cached.data?cached.data:structuredClone(defaults);
  if(!cached)data.simpleStartApplied=true;
  normalizeData();
  return cached?cached.updatedAt:0
}

async function reconcileRemote(userId,cachedUpdatedAt){
  if(!navigator.onLine){updateSyncBadge('offline');return}
  updateSyncBadge('syncing');
  try{
    const{data:row,error}=await supabaseClient.from('dashboard_data').select('data,updated_at').eq('id',userId).maybeSingle();
    if(error){console.error('Sync check failed',error);updateSyncBadge('error');return}
    if(row&&row.data&&Object.keys(row.data).length){
      const remoteTime=row.updated_at?new Date(row.updated_at).getTime():0;
      if(remoteTime>cachedUpdatedAt){
        data=row.data;
        normalizeData();
        saveLocal();
        render();
        toast('Synced the latest data from your other device')
      }
    }
    updateSyncBadge('synced')
  }catch(e){
    console.error('Sync check failed',e);
    updateSyncBadge('error')
  }
}

async function handleSignedIn(user){
  currentUser=user;
  qs('#account-email').textContent=user.email;
  qs('#account-avatar').textContent=(user.email||'?').charAt(0).toUpperCase();
  const cachedUpdatedAt=loadUserData(user.id);
  saveLocal();
  showApp();
  bootstrapApp();
  reconcileRemote(user.id,cachedUpdatedAt)
}
let pendingAuthNote=null;
function handleSignedOut(){
  currentUser=null;
  data=null;
  pendingSync=false;
  syncInFlight=false;
  closeAccountMenu();
  qs('#signin-form').reset();
  qs('#signup-form').reset();
  showAuthScreen();
  authError(pendingAuthNote);
  pendingAuthNote=null
}

supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_IN'&&session)handleSignedIn(session.user);
  if(event==='SIGNED_OUT')handleSignedOut()
});

(async()=>{
  const{data:{session}}=await supabaseClient.auth.getSession();
  if(session)await handleSignedIn(session.user);
  else showAuthScreen()
})();

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(err=>console.error('Service worker registration failed',err))
  })
}
