const KEY='goal-management-v1';let goals=[];try{goals=JSON.parse(localStorage.getItem(KEY)||'[]')}catch{}let editing=null,current=null,dateEditing=null;const $=id=>document.getElementById(id);const today=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};const fmt=s=>s.replaceAll('-','.');const save=()=>{if(window.goalSync)window.goalSync.save(goals);else localStorage.setItem(KEY,JSON.stringify(goals));render()};function pct(g){let s=new Date(g.start+'T00:00:00').getTime(),e=new Date(g.end+'T00:00:00').getTime(),n=new Date(today()+'T00:00:00').getTime();return Math.round(Math.max(0,Math.min(100,(n-s)/(e-s||1)*100)))}function render(){let body=$('rows');body.replaceChildren();$('empty').hidden=goals.length!==0;goals.forEach(g=>{let tr=document.createElement('tr');let completed=g.dates.filter(Boolean).length,progress=Math.round(completed/g.count*100);let cells=[g.name,String(g.count),`${fmt(g.start)}<br>~ ${fmt(g.end)}`,`<div class="metric"><div class="metric-line"><span class="metric-label">날짜 ${pct(g)}%</span><div class="bar"><div class="fill" style="width:${pct(g)}%"></div></div></div><div class="metric-line"><span class="metric-label">진행 ${progress}%</span><div class="bar"><div class="fill done" style="width:${progress}%"></div></div></div></div>`];cells.forEach((value,i)=>{let td=document.createElement('td');if(i===0){td.className='goal';td.textContent=value}else if(i===2||i===3){td.innerHTML=value;if(i===2)td.className='date-cell';}else td.textContent=value;tr.appendChild(td)});let td=document.createElement('td'),btn=document.createElement('button');btn.textContent='상세';btn.className='detail-btn';btn.setAttribute('aria-label','상세 보기');btn.onclick=()=>showDetail(g.id);td.appendChild(btn);tr.appendChild(td);body.appendChild(tr)})}function addGoal(){if(!canEdit())return;editing=null;$('formTitle').textContent='목표 추가';$('goalForm').reset();$('count').value=100;$('start').value=today();$('end').value=today();$('editDialog').showModal()}$('goalForm').onsubmit=e=>{e.preventDefault();if(!canEdit())return;let name=$('name').value.trim(),count=Number($('count').value),start=$('start').value,end=$('end').value;if(!name||!Number.isInteger(count)||count<1||count>10000||end<start){alert('목표, 횟수 및 날짜를 확인해 주세요.');return}if(editing){let g=goals.find(x=>x.id===editing);Object.assign(g,{name,count,start,end});g.dates.length=count;g.dates=Array.from({length:count},(_,i)=>g.dates[i]||null)}else goals.push({id:crypto.randomUUID(),name,count,start,end,dates:Array(count).fill(null)});save();$('editDialog').close()};function showDetail(id){current=id;let g=goals.find(x=>x.id===id);if(!g)return;$('detailTitle').textContent=g.name;let completed=g.dates.filter(Boolean).length;$('detailInfo').textContent=`${fmt(g.start)} ~ ${fmt(g.end)} · 완료 ${completed}/${g.count}회`;let box=$('cells');box.replaceChildren();g.dates.forEach((date,i)=>{let b=document.createElement('button');b.className='cell'+(date?' checked':'');b.textContent=date?`${i+1}회 완료\n${fmt(date)}`:`${i+1}`;b.style.whiteSpace='pre-line';bindDateLongPress(b,id,i);b.onclick=e=>{if(!canEdit())return;if(b.suppressClick){e.preventDefault();b.suppressClick=false;return}if(g.dates[i]){if(!confirm('이 완료 기록을 취소하시겠습니까?'))return;g.dates[i]=null}else g.dates[i]=today();save();showDetail(id)};box.appendChild(b)});if(!$('detailDialog').open)$('detailDialog').showModal()}
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
  goal.dates[index]=value;
  save();
  $('completionDateDialog').close();
  showDetail(goal.id);
};
function editCurrent(){if(!canEdit())return;let g=goals.find(x=>x.id===current);if(!g)return;editing=g.id;$('formTitle').textContent='목표 수정';$('name').value=g.name;$('count').value=g.count;$('start').value=g.start;$('end').value=g.end;$('detailDialog').close();$('editDialog').showModal()}function removeCurrent(){if(!canEdit())return;if(!confirm('이 목표와 완료 기록을 모두 삭제하시겠습니까?'))return;goals=goals.filter(x=>x.id!==current);save();$('detailDialog').close()}render();if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
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
