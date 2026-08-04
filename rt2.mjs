import { createClient } from "@supabase/supabase-js";
const c = createClient("https://clfcbkmjzcsvgylnsbvm.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsZmNia21qemNzdmd5bG5zYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjU2MzUsImV4cCI6MjA5Mzc0MTYzNX0.hbmB5Cfd5DJhcR0HIlowI54959rP1P8Z9PBU3XC9Gzk");
const ch1 = c.channel("shifts-changes");
ch1.on("broadcast",{event:"*"},(m)=>console.log("A got",JSON.stringify(m))).subscribe(s=>console.log("A",s));
setTimeout(()=>{
  const ch2 = c.channel("shifts-changes");
  ch2.on("broadcast",{event:"*"},(m)=>console.log("B got",JSON.stringify(m))).subscribe(s=>console.log("B",s));
},3000);
setTimeout(()=>process.exit(0),25000);
