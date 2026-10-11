/** Count the union of approved leave intersections with the saved shift interval. */
export function approvedLeaveMinutesForWindow(requests: ReadonlyArray<{requestType:string;status:string;startAt:Date|null;endAt:Date|null}>, start:Date, end:Date):number {
 const intervals=requests.filter(row=>row.requestType==="leave"&&row.status==="approved"&&row.startAt&&row.endAt)
  .map(row=>[Math.max(start.getTime(),row.startAt!.getTime()),Math.min(end.getTime(),row.endAt!.getTime())] as const)
  .filter(([from,to])=>to>from).sort((left,right)=>left[0]-right[0]);
 if(!intervals.length)return 0;
 let total=0,[from,to]=intervals[0]!;
 for(const interval of intervals.slice(1)){if(interval[0]>to){total+=to-from;[from,to]=interval;}else to=Math.max(to,interval[1]);}
 return Math.floor((total+to-from)/60000);
}
