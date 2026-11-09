/* Pure calculations shared by the page and regression checks. */
(function(root){
  const validQuantity=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
  const quantity=(g,i)=>g.dates[i]&&validQuantity(g.quantities?.[i])?g.quantities[i]:0;
  const ratio=(n,d)=>d>0?Math.round(n/d*1000)/10:0;
  const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
  function stats(g,today){
    const totalDays=Math.max(0,day(g.end)-day(g.start));
    const elapsed=Math.max(0,Math.min(totalDays,day(today)-day(g.start)));
    const completed=new Set(g.dates.filter(Boolean)).size;
    const total=g.dates.reduce((sum,_,i)=>sum+quantity(g,i),0);
    return {totalDays,elapsed,completed,total,periodPercent:totalDays?ratio(elapsed,totalDays):(today>=g.start?100:0),datePercent:ratio(completed,g.count),quantityPercent:ratio(total,g.targetQuantity)};
  }
  function cumulative(g,index){const date=g.dates[index];return date?g.dates.reduce((sum,d,i)=>sum+(d&&d<=date?quantity(g,i):0),0):0;}
  function previousTotal(goal, date) {
    return goal.dates.reduce((sum, recorded, index) =>
      sum + (recorded && recorded < date ? quantity(goal, index) : 0), 0);
  }
  const api={validQuantity,quantity,ratio,stats,cumulative,previousTotal};
  if(typeof module!=='undefined')module.exports=api;else root.GoalMetrics=api;
})(globalThis);
