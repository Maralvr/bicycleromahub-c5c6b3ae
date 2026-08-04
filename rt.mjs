import { createClient } from "@supabase/supabase-js";
const c = createClient("https://clfcbkmjzcsvgylnsbvm.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk");
const got=[];
for (const tag of ["A","B"]) {
  c.channel("shifts-changes").on("broadcast",{event:"shift_change"},(m)=>{got.push([tag,JSON.stringify(m.payload)])}).subscribe((s)=>console.log(tag,s));
}
await new Promise(r=>setTimeout(r,15000));
console.log("received:", got);
process.exit(0);
