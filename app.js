const KEY='goal-management-v1';let goals=[];try{goals=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{}let editing=null,current=null,dateEditing=null;const $=id=>document.getElementById(id);const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const fmt=s=>s.replaceAll('-','.');const save=()=>{if(window.goalSync)window.goalSync.save(goals);else localStorage.setItem(KEY,JSON.stringify(goals));render()};function metric(label,n,d,unit,percent,cls=''){
  const number=Number.isFinite(percent)?percent:0;
  return `<div class="metric-line"><span class="metric-label">${label} <b>${n}/${d}${unit} · ${number}%</b></span><div class="bar"><div class="fill ${cls}" style="width:${Math.min(100,Math.max(0,number))}%"></div></div></div>`;
}
function render(){
  const body=$('rows');body.replaceChildren();$('empty').hidden=goals.length!==0;
  goals.forEach(g=>{
    const stats=GoalMetrics.stats(g,today()),tr=document.createElement('tr');
    const values=[g.name,`${g.count}일<br>${g.targetQuantity?g.targetQuantity+'건':'건수 미설정'}`,`${fmt(g.start)}<br>~ ${fmt(g.end)}`,`<div class="metric">${metric('기간',stats.elapsed,stats.totalDays,'일',stats.periodPercent)}${metric('진행(날짜)',stats.completed,g.count,'일',stats.datePercent,'done')}${g.targetQuantity?metric('진행(건)',stats.total,g.targetQuantity,'건',stats.quantityPercent,'quantity'):`<div class="metric-label">진행(건) ${stats.total}건 · 목표 미설정</div>`}</div>`];
    values.forEach((value,i)=>{const td=document.createElement('td');if(i===0){td.className='goal';td.textContent=value}else{td.innerHTML=value;if(i===1)td.className='target-cell';if(i===2)td.className='date-cell'}tr.appendChild(td)});
    const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='상세';btn.className='detail-btn';btn.setAttribute('aria-label',g.name+' 상세 보기');btn.onclick=()=>showDetail(g.id);td.appendChild(btn);tr.appendChild(td);body.appendChild(tr);
  });
}
function addGoal(){if(!canEdit())return;editing=null;$('formTitle').textContent='목표 추가';$('goalForm').reset();$('count').value=100;$('targetQuantity').value='';$('start').value=today();$('end').value=today();syncDaysAfter();$('editDialog').showModal()}$('goalForm').onsubmit=e=>{e.preventDefault();if(!canEdit())return;let name=$('name').value.trim(),count=Number($('count').value),start=$('start').value,end=$('end').value,targetQuantity=$('targetQuantity').value===''?null:Number($('targetQuantity').value);if(!name||!Number.isInteger(count)||count<1||count>10000||end<start||(targetQuantity!==null&&(!GoalMetrics.validQuantity(targetQuantity)||targetQuantity<1))){alert('목표, 횟수 및 날짜를 확인해 주세요.');return}if(editing){let g=goals.find(x=>x.id===editing);if(count<g.count && (g.dates.slice(count).some(Boolean)||g.quantities?.slice(count).some(Boolean))){alert('기록이 있는 실행 일수보다 목표 일수를 작게 줄일 수 없습니다.');return;}Object.assign(g,{name,count,start,end,targetQuantity});g.quantities=Array.from({length:count},(_,i)=>g.quantities?.[i]||0);g.dates.length=count;g.dates=Array.from({length:count},(_,i)=>g.dates[i]||null)}else goals.push({id:crypto.randomUUID(),name,count,start,end,targetQuantity,quantities:Array(count).fill(0),dates:Array(count).fill(null)});save();$('editDialog').close()};function showDetail(id){
  current=id;const g=goals.find(x=>x.id===id);if(!g)return;
  $('detailTitle').textContent=g.name;const stats=GoalMetrics.stats(g,today());
  $('detailInfo').textContent=`${fmt(g.start)} ~ ${fmt(g.end)} · 실행 ${stats.completed}/${g.count}일 · 누적 ${stats.total}${g.targetQuantity?'/'+g.targetQuantity:''}건`;
  const box=$('cells');box.replaceChildren();
  g.dates.forEach((date,i)=>{
    const card=document.createElement('div');card.className='cell-card';
    const b=document.createElement('button');b.type='button';b.className='cell'+(date?' checked':'');b.textContent=date?`${i+1}일차 완료\n${fmt(date)}`:`${i+1}일차\n실행 체크`;b.style.whiteSpace='pre-line';bindDateLongPress(b,id,i);
    b.onclick=e=>{
      if(!canEdit())return;if(b.suppressClick){e.preventDefault();b.suppressClick=false;return}
      if(g.dates[i]){if(!confirm('이 날짜의 실행 체크와 입력 건수를 취소하시겠습니까?'))return;g.dates[i]=null;if(g.quantities)g.quantities[i]=0}
      else {if(g.dates.includes(today())){alert('오늘 실행은 이미 체크되어 있습니다. 해당 날짜의 건수 입력 버튼을 이용해 주세요.');return}g.dates[i]=today()}
      save();showDetail(id);
    };
    card.appendChild(b);
    const counts=document.createElement('div');counts.className='cell-counts';counts.textContent=`당일 ${GoalMetrics.quantity(g,i)}건 · 누적 ${GoalMetrics.cumulative(g,i)}건`;card.appendChild(counts);
    const qty=document.createElement('button');qty.type='button';qty.className='quantity-button';qty.textContent='건수 입력 / 수정';qty.onclick=()=>openQuantity(id,i);card.appendChild(qty);box.appendChild(card);
  });
  if(!$('detailDialog').open)$('detailDialog').showModal();
}
let quantityEditing=null;
function openQuantity(id,index){
  if(!canEdit())return;const g=goals.find(x=>x.id===id);if(!g)return;quantityEditing={id,index};
  $('quantityTitle').textContent=(index+1)+'일차 건수 입력';$('quantityDate').value=g.dates[index]||today();$('quantityValue').value=GoalMetrics.quantity(g,index);$('quantityDialog').showModal();
}
$('quantityDialog').addEventListener('close',()=>{quantityEditing=null});
$('quantityForm').onsubmit=e=>{
  e.preventDefault();if(!canEdit()||!quantityEditing)return;const {id,index}=quantityEditing,g=goals.find(x=>x.id===id);if(!g)return;
  const date=$('quantityDate').value,n=Number($('quantityValue').value);if(!date||!GoalMetrics.validQuantity(n))return;
  if(g.dates.some((d,i)=>i!==index&&d===date)){alert('같은 날짜의 실행 기록이 있습니다. 해당 기록에서 건수를 수정해 주세요.');return}
  g.dates[index]=date;g.quantities=Array.from({length:g.count},(_,i)=>g.quantities?.[i]||0);g.quantities[index]=n;
  save();$('quantityDialog').close();showDetail(id);
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
function editCurrent(){if(!canEdit())return;let g=goals.find(x=>x.id===current);if(!g)return;editing=g.id;$('formTitle').textContent='목표 수정';$('name').value=g.name;$('count').value=g.count;$('targetQuantity').value=g.targetQuantity||'';$('start').value=g.start;$('end').value=g.end;syncDaysAfter();$('detailDialog').close();$('editDialog').showModal()}function removeCurrent(){if(!canEdit())return;if(!confirm('이 목표와 완료 기록을 모두 삭제하시겠습니까?'))return;goals=goals.filter(x=>x.id!==current);save();$('detailDialog').close()}render();if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
function canEdit(){
  if(window.goalSync && !window.goalSync.canEdit()){
    alert('계정 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');return false;
  }
  return true;
}
window.GoalApp={
  getGoals:()=>goals,
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

