/** Coalesce overlapping refreshes; one trailing read preserves post-write freshness. */
export class RefreshGate {
 private pending: Promise<void>|null=null;
 private again=false;
 run(read:()=>Promise<void>):Promise<void>{
  if(this.pending){this.again=true;return this.pending;}
  this.pending=(async()=>{do{this.again=false;await read();}while(this.again);})().finally(()=>{this.pending=null;});
  return this.pending;
 }
}
