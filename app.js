const KEY='goal-management-v1';let goals=[];try{goals=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{}let editing=null,current=null,dateEditing=null;let loading=true;const $=id=>document.getElementById(id);const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const fmt=s=>s.replaceAll('-','.');const save=()=>{if(window.goalSync)window.goalSync.save(goals);else localStorage.setItem(KEY,JSON.stringify(goals));render()};function metric(label,n,d,unit,percent,cls=''){
  const number=Number.isFinite(percent)?percent:0;
  return `<div class="metric-line"><span class="metric-label">${label} <b>${n}/${d}${unit} · ${number}%</b></span><div class="bar"><div class="fill ${cls}" style="width:${Math.min(100,Math.max(0,number))}%"></div></div></div>`;
}
function render(){
  if(loading){$('rows').replaceChildren();$('empty').hidden=true;return;}
  const body=$('rows');body.replaceChildren();$('empty').hidden=goals.length!==0;
  goals.forEach(g=>{
    const stats=GoalMetrics.stats(g,today()),tr=document.createElement('tr');
    const targets = [];
    const progress = [metric('기간', stats.elapsed, stats.totalDays, '일', stats.periodPercent)];
    if (g.trackDates !== false) {
      targets.push(g.count + '일');
      progress.push(metric('진행(날짜)', stats.completed, g.count, '일', stats.datePercent, 'done'));
    }
    if (g.trackQuantity !== false) {
      targets.push(g.targetQuantity ? g.targetQuantity + '건' : '건수 미설정');
      progress.push(g.targetQuantity
        ? metric('진행(건)', stats.total, g.targetQuantity, '건', stats.quantityPercent, 'quantity')
        : `<div class="metric-label">진행(건) ${stats.total}건 · 목표 미설정</div>`);
    }
    const values = [g.name, targets.join('<br>'), `${fmt(g.start)}<br>~ ${fmt(g.end)}`,
      `<div class="metric">${progress.join('')}</div>`];
    values.forEach((value,i)=>{const td=document.createElement('td');if(i===0){td.className='goal';td.textContent=value}else{td.innerHTML=value;if(i===1)td.className='target-cell';if(i===2)td.className='date-cell'}tr.appendChild(td)});
    const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='상세';btn.className='detail-btn';btn.setAttribute('aria-label',g.name+' 상세 보기');btn.onclick=()=>showDetail(g.id);td.appendChild(btn);tr.appendChild(td);body.appendChild(tr);
  });
}
function showTrackingFields() {
  $('dateTarget').hidden = $('count').disabled = !$('trackDates').checked;
  $('quantityTarget').hidden = $('targetQuantity').disabled = !$('trackQuantity').checked;
}
$('trackDates').addEventListener('change', showTrackingFields);
$('trackQuantity').addEventListener('change', showTrackingFields);

function addGoal() {
  if (!canEdit()) return;
  editing = null;
  $('formTitle').textContent = '목표 추가';
  $('goalForm').reset();
  $('trackDates').checked = $('trackQuantity').checked = true;
  $('count').value = 100;
  $('start').value = $('end').value = today();
  showTrackingFields();
  syncDaysAfter();
  $('editDialog').showModal();
}

$('goalForm').onsubmit = e => {
  e.preventDefault();
  if (!canEdit()) return;
  const existing = goals.find(g => g.id === editing);
  if (editing && !existing) return;
  const trackDates = $('trackDates').checked;
  const trackQuantity = $('trackQuantity').checked;
  const name = $('name').value.trim();
  const count = trackDates ? Number($('count').value) : existing?.count ?? 100;
  const start = $('start').value;
  const end = $('end').value;
  const targetQuantity = trackQuantity
    ? ($('targetQuantity').value === '' ? null : Number($('targetQuantity').value))
    : existing?.targetQuantity ?? null;
  if (!name || !Number.isInteger(count) || count < 1 || count > 10000 ||
      !start || !end || end < start ||
      (targetQuantity !== null && (!GoalMetrics.validQuantity(targetQuantity) || targetQuantity < 1))) {
    alert('목표, 횟수 및 날짜를 확인해 주세요.');
    return;
  }
  if (existing && count < existing.count && existing.dates.slice(count).some(Boolean)) {
    alert('기록이 있는 실행 일수보다 목표 일수를 작게 줄일 수 없습니다.');
    return;
  }
  const length = Math.max(count, (existing?.dates.findLastIndex(Boolean) ?? -1) + 1);
  const settings = {name, count, start, end, targetQuantity, trackDates, trackQuantity,
    dates: Array.from({length}, (_, i) => existing?.dates[i] || null),
    quantities: Array.from({length}, (_, i) => existing?.quantities?.[i] || 0)};
  if (existing) Object.assign(existing, settings);
  else goals.push({id: crypto.randomUUID(), ...settings});
  save();
  $('editDialog').close();
};

function showDetail(id) {
  current = id;
  const g = goals.find(x => x.id === id);
  if (!g) return;
  const trackDates = g.trackDates !== false;
  const trackQuantity = g.trackQuantity !== false;
  const stats = GoalMetrics.stats(g, today());
  const info = [`${fmt(g.start)} ~ ${fmt(g.end)}`];
  if (trackDates) info.push(`실행 ${stats.completed}/${g.count}일`);
  if (trackQuantity) info.push(`누적 ${stats.total}${g.targetQuantity ? '/' + g.targetQuantity : ''}건`);
  $('detailTitle').textContent = g.name;
  $('detailInfo').textContent = info.join(' · ');
  $('detailHint').textContent = trackDates
    ? '날짜를 눌러 실행을 체크하세요. 완료 날짜를 길게 누르면 날짜를 수정할 수 있습니다.'
    : trackQuantity ? '건수 기록에는 날짜가 함께 저장됩니다.' : '';
  $('addQuantity').hidden = trackDates || !trackQuantity;
  const box = $('cells');
  box.replaceChildren();
  const entries = g.dates.map((date, index) => ({date, index}));
  const visible = trackDates ? entries.filter(({date, index}) => date || index < g.count)
    : trackQuantity ? entries.filter(({date}) => date).sort((a, b) => a.date.localeCompare(b.date)) : [];
  for (const {date, index} of visible) {
    const card = document.createElement('div');
    card.className = 'cell-card';
    if (trackDates) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cell' + (date ? ' checked' : '');
      button.textContent = date ? `${index + 1}일차 완료
${fmt(date)}` : `${index + 1}일차
실행 체크`;
      button.style.whiteSpace = 'pre-line';
      bindDateLongPress(button, id, index);
      button.onclick = e => {
        if (!canEdit()) return;
        if (button.suppressClick) {
          e.preventDefault();
          button.suppressClick = false;
          return;
        }
        if (g.dates[index]) {
          if (!confirm('이 날짜의 실행 체크와 입력 건수를 취소하시겠습니까?')) return;
          g.dates[index] = null;
          if (g.quantities) g.quantities[index] = 0;
        } else {
          if (g.dates.includes(today())) {
            alert('오늘 실행은 이미 체크되어 있습니다.');
            return;
          }
          g.dates[index] = today();
        }
        save();
        showDetail(id);
      };
      card.appendChild(button);
    }
    if (trackQuantity) {
      const counts = document.createElement('div');
      counts.className = 'cell-counts';
      const label = !trackDates && date ? fmt(date) + ' · ' : '';
      counts.textContent = `${label}당일 ${GoalMetrics.quantity(g, index)}건 · 누적 ${GoalMetrics.cumulative(g, index)}건`;
      card.appendChild(counts);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quantity-button';
      button.textContent = '건수 입력 / 수정';
      button.onclick = () => openQuantity(id, index);
      card.appendChild(button);
    }
    box.appendChild(card);
  }
  if (!$('detailDialog').open) $('detailDialog').showModal();
}

let quantityEditing = null;
$('addQuantity').onclick = () => {
  const goal = goals.find(g => g.id === current);
  if (!goal) return;
  const todayIndex = goal.dates.indexOf(today());
  openQuantity(current, todayIndex < 0 ? null : todayIndex);
};

function openQuantity(id, index) {
  if (!canEdit()) return;
  const goal = goals.find(g => g.id === id);
  if (!goal || goal.trackQuantity === false) return;
  quantityEditing = {id, index};
  $('quantityTitle').textContent = index !== null && goal.trackDates !== false
    ? (index + 1) + '일차 건수 입력' : '실행 건수 입력';
  $('quantityDate').value = goal.dates[index] || today();
  $('quantityMode').value = 'daily';
  $('quantityValue').max = 1000000000;
  $('quantityValue').value = GoalMetrics.quantity(goal, index);
  updateQuantityPreview();
  $('quantityDialog').showModal();
}

function quantityValues(goal) {
  const date = $('quantityDate').value;
  const value = $('quantityValue').value;
  const previous = GoalMetrics.previousTotal(goal, date);
  const isCumulative = $('quantityMode').value === 'cumulative';
  const daily = value === '' ? NaN : Number(value) - (isCumulative ? previous : 0);
  return {date, previous, daily, cumulative: previous + daily};
}

function updateQuantityPreview() {
  const goal = goals.find(g => g.id === quantityEditing?.id);
  if (!goal) return;
  const {date, previous, daily, cumulative} = quantityValues(goal);
  $('quantityPreview').textContent = date && GoalMetrics.validQuantity(daily)
    ? `당일 ${daily}건 · 누적 ${cumulative}건`
    : `이 날짜 이전 누적 ${previous}건 · 당일 건수는 0~1,000,000,000건이어야 합니다.`;
}

$('quantityMode').addEventListener('change', () => {
  const goal = goals.find(g => g.id === quantityEditing?.id);
  if (!goal) return;
  const date = $('quantityDate').value;
  const index = quantityEditing.index ?? goal.dates.indexOf(date);
  const daily = GoalMetrics.quantity(goal, index);
  $('quantityValue').value = $('quantityMode').value === 'cumulative'
    ? GoalMetrics.previousTotal(goal, date) + daily : daily;
  $('quantityValue').max = $('quantityMode').value === 'cumulative' ? 10000000000000 : 1000000000;
  updateQuantityPreview();
});
$('quantityDate').addEventListener('input', updateQuantityPreview);
$('quantityValue').addEventListener('input', updateQuantityPreview);
$('quantityDialog').addEventListener('close', () => { quantityEditing = null; });
$('quantityForm').onsubmit = e => {
  e.preventDefault();
  if (!canEdit() || !quantityEditing) return;
  const {id, index} = quantityEditing;
  const goal = goals.find(g => g.id === id);
  if (!goal || goal.trackQuantity === false) return;
  const {date, daily} = quantityValues(goal);
  if (!date || !GoalMetrics.validQuantity(daily)) {
    alert('누적 건수는 이 날짜 이전 누적보다 작을 수 없습니다. 입력한 건수를 확인해 주세요.');
    return;
  }
  const sameDay = goal.dates.indexOf(date);
  if (sameDay !== -1 && sameDay !== index) {
    alert('같은 날짜의 실행 기록이 있습니다. 해당 기록에서 건수를 수정해 주세요.');
    return;
  }
  const empty = goal.dates.indexOf(null);
  const slot = index ?? (empty >= 0 ? empty : goal.dates.length);
  if (slot >= 10000) {
    alert('기록은 최대 10,000일까지만 저장할 수 있습니다.');
    return;
  }
  goal.dates[slot] = date;
  goal.quantities ??= Array(goal.dates.length).fill(0);
  goal.quantities[slot] = daily;
  save();
  $('quantityDialog').close();
  showDetail(id);
};

function bindDateLongPress(button,id,index){
  let timer=null,origin=null;
  const cancel=()=>{clearTimeout(timer);timer=null};
  button.addEventListener('pointerdown',e=>{
    cancel();button.suppressClick=false;
    if(!e.isPrimary||e.button!==0)return;
    const goal=goals.find(g=>g.id===id);
    if(!goal?.dates[index])return;
    origin={x:e.clientX,y:e.clientY};
    timer=setTimeout(()=>{
      timer=null;button.suppressClick=true;openCompletionDate(id,index);
    },600);
  });
  button.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>10)cancel()});
  for(const event of ['pointerup','pointercancel','pointerleave','lostpointercapture'])button.addEventListener(event,cancel);
  button.addEventListener('contextmenu',e=>{if(button.classList.contains('checked'))e.preventDefault()});
  button.addEventListener('keydown',e=>{if(e.key==='F2'){e.preventDefault();openCompletionDate(id,index)}});
  button.title='완료 날짜를 길게 누르거나 F2를 눌러 날짜 수정';
}
function openCompletionDate(id,index){
  if(!canEdit())return;
  const goal=goals.find(g=>g.id===id);
  if(!goal?.dates[index])return;
  dateEditing={id,index};
  $('completionDateTitle').textContent=(index+1)+'회 실행 날짜 수정';
  $('completionDate').value=goal.dates[index];
  $('completionDateDialog').showModal();
}
$('completionDateDialog').addEventListener('close',()=>{dateEditing=null});
$('completionDateForm').onsubmit=e=>{
  e.preventDefault();
  if(!canEdit())return;
  const input=$('completionDate'),value=input.value;
  if(!input.reportValidity()||!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
  const goal=goals.find(g=>g.id===dateEditing?.id),index=dateEditing?.index;
  if(!goal?.dates[index])return;
  if(goal.dates.some((d,i)=>i!==index&&d===value)){alert('같은 날짜의 실행 기록이 있습니다. 날짜별로 하나의 실행 기록을 사용해 주세요.');return;}
  goal.dates[index]=value;
  save();
  $('completionDateDialog').close();
  showDetail(goal.id);
};
function editCurrent() {
  if (!canEdit()) return;
  const goal = goals.find(g => g.id === current);
  if (!goal) return;
  editing = goal.id;
  $('formTitle').textContent = '목표 수정';
  $('name').value = goal.name;
  $('count').value = goal.count;
  $('targetQuantity').value = goal.targetQuantity || '';
  $('trackDates').checked = goal.trackDates !== false;
  $('trackQuantity').checked = goal.trackQuantity !== false;
  $('start').value = goal.start;
  $('end').value = goal.end;
  showTrackingFields();
  syncDaysAfter();
  $('detailDialog').close();
  $('editDialog').showModal();
}
function removeCurrent(){if(!canEdit())return;if(!confirm('이 목표와 완료 기록을 모두 삭제하시겠습니까?'))return;goals=goals.filter(x=>x.id!==current);save();$('detailDialog').close()}render();if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
function canEdit(){
  if(loading){alert('기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');return false;}
  if(window.goalSync && !window.goalSync.canEdit()){
    alert('계정 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');return false;
  }
  return true;
}
window.GoalApp={
  getGoals:()=>goals,
  setLoading(value){
    loading=!!value;
    $('dataLoading').hidden=!loading;
    if(loading){$('dataLoading').textContent=typeof value==='string'?value:'기록 불러오는 중…';render();}
  },
  setGoals(next){
    goals=next;render();
    if($('detailDialog').open){
      if(goals.some(g=>g.id===current))showDetail(current);
      else $('detailDialog').close();
    }
  },
  closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());editing=null;current=null;dateEditing=null;}
};

// UTC calendar arithmetic avoids daylight-saving changes.
function calendarDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00Z'):NaN;}
function syncDaysAfter(){
  const start=calendarDate($('start').value),end=calendarDate($('end').value);
  $('daysAfter').value=Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.round((end-start)/86400000):'';
  $('daysAfter').setCustomValidity('');
}
function syncDeadline(){
  const input=$('daysAfter'),days=input.valueAsNumber,start=calendarDate($('start').value);
  input.setCustomValidity('');
  if(!input.value||!Number.isInteger(days)||days<0||!Number.isFinite(start)){$('end').value='';return;}
  const end=new Date(start+days*86400000);
  if(!Number.isFinite(end.getTime())||end.getUTCFullYear()>9999){input.setCustomValidity('기한일은 9999년 12월 31일 이내로 입력해 주세요.');$('end').value='';return;}
  $('end').value=end.toISOString().slice(0,10);
}
$('end').addEventListener('input',syncDaysAfter);
$('daysAfter').addEventListener('input',syncDeadline);
$('start').addEventListener('input',()=>{if($('daysAfter').value!=='')syncDeadline();else syncDaysAfter();});

