import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const DEFAULT_CATS = ["Groceries","Food & Dining","Transportation","Healthcare","Entertainment","Shopping","Utilities","Education","Personal Care","Health Supplements","Baby Care","Rent","Insurance","Subscriptions","Travel","Fees & Charges","Other"];
const ESSENTIAL_CATS = ["Groceries","Healthcare","Utilities","Education","Transportation","Rent","Insurance","Baby Care"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const FULL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COLORS = ["#7c3aed","#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6","#f97316","#84cc16"];
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const TT = { background:"#1a1a2e", border:"1px solid #2a2a3a", borderRadius:8, color:"#eeeef8", fontSize:12 };
const fmt = v => `₹${Number(v).toLocaleString("en-IN")}`;
const EMPTY = { users:[], expenses:[], items:[], maps:[], currentUser:null };

// ── STORAGE ───────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const r = await window.storage.get("kharchi_v3");
    if (r?.value) return { ...EMPTY, ...JSON.parse(r.value) };
  } catch(e) { console.log("load err:", e); }
  return { ...EMPTY };
}
async function saveData(d) {
  try { await window.storage.set("kharchi_v3", JSON.stringify(d)); } catch(e) { console.log("save err:", e); }
}

// ── OCR ───────────────────────────────────────────────────────────────────────
async function ocrBill(base64, mediaType, maps, cats) {
  const today = new Date().toISOString().slice(0,10);
  const prompt = `Analyze this bill/receipt image. Return ONLY valid JSON, no markdown, no extra text.

{"merchant":"name","amount":0.00,"date":"YYYY-MM-DD","expense_type":"variable","is_essential":false,"is_recurring":false,"items":[{"name":"item","price":0.00,"category":"cat"}]}

RULES:
- merchant: store/platform name (Amazon, DHBVN, Swiggy, DMart, Zomato etc)
- amount: final Grand Total / You Pay as a plain number (no ₹)
- date: scan ENTIRE image for any date. Amazon shows "Order placed Mon, 23 February 2026" at bottom. Convert any format to YYYY-MM-DD. Only use "${today}" if truly no date found.
- expense_type: "fixed" for electricity/rent/subscriptions, else "variable"
- is_essential: true for groceries/utilities/healthcare/transport/rent
- is_recurring: true for electricity/rent/subscriptions only
- items: list EVERY line item including ALL fees. Delivery fee, handling fee, marketplace fee, convenience fee, platform fee, GST, taxes → capture each separately with category "Fees & Charges". If no items visible, one item with total.
- category from: ${[...cats, "Fees & Charges"].join(", ")}. delivery/handling/marketplace/convenience/platform fee=Fees & Charges, Amazon shopping=Shopping, baby formula=Baby Care, electricity=Utilities, food delivery=Food & Dining, medicine=Healthcare, protein/supplements=Health Supplements. For unknown items use your intelligence to pick the best category, never use Other if something better fits.`;

  const res = await fetch("/api/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-3-haiku-20240307",
      max_tokens:1000,
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:mediaType.startsWith("image/")?mediaType:"image/jpeg",data:base64}},
        {type:"text",text:prompt}
      ]}]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  const raw = d.content?.[0]?.text || "";
  if (!raw) throw new Error("Empty response");
  const clean = raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
  let p;
  try { p = JSON.parse(clean); }
  catch { const m = clean.match(/\{[\s\S]*\}/); if(!m) throw new Error("No JSON in response"); p = JSON.parse(m[0]); }
  if (!Array.isArray(p.items)||!p.items.length) p.items=[{name:p.merchant||"Bill",price:p.amount||0,category:"Other"}];
  if (typeof p.amount==="string") p.amount=parseFloat(p.amount.replace(/[^0-9.]/g,""))||0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date||"")) p.date=today;
  p.items = p.items.map(item => {
    const map = maps.find(m => m.k===item.name.toLowerCase());
    return map ? {...item,category:map.cat,learned:true} : {...item,learned:false};
  });
  return p;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#080810;--sf:#10101a;--sf2:#18182a;--sf3:#20203a;--bd:#252538;--bd2:#2e2e50;--ac:#7c3aed;--ac2:#a78bfa;--tx:#eeeef8;--tx2:#8888a8;--tx3:#505068;--gr:#10b981;--rd:#f43f5e;--am:#f59e0b;--r:12px;--rs:8px}
body{background:var(--bg);color:var(--tx);font-family:'DM Sans',sans-serif;font-size:14px;line-height:1.5}
.app{display:flex;min-height:100vh}
.sb{width:220px;background:var(--sf);border-right:1px solid var(--bd);padding:24px 12px;display:flex;flex-direction:column;gap:2px;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;z-index:100}
.logo{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;padding:0 8px 24px;letter-spacing:-.5px}
.logo em{color:var(--ac2);font-style:normal}
.nl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);padding:14px 8px 4px;font-weight:700}
.nb{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--rs);cursor:pointer;color:var(--tx2);font-size:13px;font-weight:500;transition:all .15s;border:none;background:none;width:100%;text-align:left}
.nb:hover{background:var(--sf2);color:var(--tx)}.nb.on{background:linear-gradient(135deg,#3d1d8a,#1e1260);color:var(--ac2)}
.ni{font-size:15px;width:18px;text-align:center;flex-shrink:0}
.sbf{margin-top:auto;padding-top:16px;border-top:1px solid var(--bd)}
.up{padding:10px 8px;border-radius:var(--rs);background:var(--sf2)}
.un{font-weight:600;font-size:13px}.ue{font-size:11px;color:var(--tx3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.main{margin-left:220px;flex:1;padding:28px 32px;min-height:100vh}
.ph{margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.pt{font-family:'Syne',sans-serif;font-size:26px;font-weight:700;letter-spacing:-.3px}
.ps{color:var(--tx2);font-size:13px;margin-top:3px}
.card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);padding:20px}
.ct{font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.cv{font-family:'Syne',sans-serif;font-size:26px;font-weight:700}
.cs{font-size:12px;color:var(--tx3);margin-top:3px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:20px}
.gm{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.fl{font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px}
.fi{background:var(--sf2);border:1px solid var(--bd);border-radius:var(--rs);padding:9px 12px;color:var(--tx);font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border .15s;width:100%}
.fi:focus{border-color:var(--ac);background:var(--sf3)}.fi::placeholder{color:var(--tx3)}
select.fi{cursor:pointer}.fie{border-color:var(--rd)!important}
.em{font-size:11px;color:var(--rd);margin-top:2px}
.cbg{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;background:var(--sf2);border-radius:var(--rs);border:1px solid var(--bd)}
.cbr{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.cbr input{width:15px;height:15px;accent-color:var(--ac);cursor:pointer}
.cbr span{font-size:13px;color:var(--tx2)}
.btn{padding:9px 18px;border-radius:var(--rs);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.bp{background:var(--ac);color:#fff}.bp:hover{background:#6d28d9;transform:translateY(-1px)}.bp:disabled{opacity:.5;cursor:not-allowed;transform:none}
.bg{background:var(--sf2);color:var(--tx2);border:1px solid var(--bd)}.bg:hover{border-color:var(--ac2);color:var(--tx)}
.bdr{background:#2a1020;color:var(--rd);border:1px solid #3d1a2a}.bdr:hover{background:#3d1a2a}
.bsm{padding:5px 12px;font-size:12px}.bfl{width:100%;justify-content:center}
.br{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}
.badge{padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap}
.bpu{background:#3d1d8a25;color:var(--ac2);border:1px solid #3d1d8a40}
.bgr{background:#10b98115;color:var(--gr);border:1px solid #10b98125}
.bam{background:#f59e0b15;color:var(--am);border:1px solid #f59e0b25}
.bgy{background:#ffffff08;color:var(--tx3);border:1px solid var(--bd)}
.blr{background:#10b98110;color:var(--gr);border:1px solid #10b98130;font-size:10px;padding:1px 7px}
.tbar{display:flex;gap:3px;background:var(--sf2);padding:3px;border-radius:var(--rs);margin-bottom:22px;flex-wrap:wrap}
.tbtn{padding:7px 16px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;color:var(--tx2);transition:all .15s;border:none;background:none}
.tbtn.on{background:var(--sf);color:var(--tx);box-shadow:0 1px 4px #00000060}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
thead tr{border-bottom:1px solid var(--bd2)}
th{padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700}
td{padding:11px 12px;border-bottom:1px solid #13131f;vertical-align:middle}
tr:hover td{background:#ffffff03}tr:last-child td{border-bottom:none}
.tn{text-align:right;font-family:'Syne',sans-serif;font-weight:700;color:var(--ac2)}
.aw{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.ag{position:absolute;border-radius:50%;pointer-events:none}
.ac{background:var(--sf);border:1px solid var(--bd);border-radius:18px;padding:40px;width:420px;position:relative;z-index:1}
.al{font-family:'Syne',sans-serif;font-size:30px;font-weight:800;margin-bottom:4px}
.al em{color:var(--ac2);font-style:normal}.as{color:var(--tx2);font-size:14px;margin-bottom:28px}
.dv{height:1px;background:var(--bd);margin:18px 0}
.dz{border:2px dashed var(--bd2);border-radius:var(--r);padding:52px 24px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:16px}
.dz:hover,.dz.ov{border-color:var(--ac);background:#7c3aed08}
.di{font-size:44px;margin-bottom:14px;display:block}
.dt{font-size:15px;font-weight:500;margin-bottom:4px}.ds{font-size:12px;color:var(--tx3)}
.ig{display:grid;grid-template-columns:1fr auto 180px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--bd)}
.ig:last-child{border-bottom:none}
.spi{font-size:13px;color:var(--tx2);background:#1a1a2e;border:1px solid #3d1d8a40;border-radius:var(--rs);padding:12px 14px;margin-bottom:14px;line-height:1.6}
.spi strong{color:var(--ac2)}
.spin{text-align:center;padding:52px}
.sp{display:inline-block;font-size:32px;animation:sp 1s linear infinite;margin-bottom:12px}
@keyframes sp{to{transform:rotate(360deg)}}
.ai{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--bd)}
.ai:last-child{border-bottom:none}
.ar{width:26px;height:26px;border-radius:50%;background:var(--sf2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--tx3);flex-shrink:0}
.ain{flex:1;min-width:0}
.an{font-size:13px;font-weight:500}.am2{font-size:11px;color:var(--tx3);margin-top:1px}
.aa{font-family:'Syne',sans-serif;font-weight:700;font-size:15px;color:var(--ac2);white-space:nowrap}
.mc{background:var(--sf);border:1px solid var(--bd);border-radius:var(--rs);padding:12px 14px}
.ml{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--tx3);font-weight:700}
.ma{font-family:'Syne',sans-serif;font-size:17px;font-weight:700;margin:4px 0 2px}
.mn{font-size:10px;color:var(--tx3)}
.tu{color:var(--rd);font-size:11px;font-weight:600}.td2{color:var(--gr);font-size:11px;font-weight:600}.tf{color:var(--tx3);font-size:11px}
.pb{height:5px;background:var(--sf2);border-radius:3px;overflow:hidden;margin-top:6px}
.pbf{height:100%;border-radius:3px;transition:width .3s}
.empty{text-align:center;padding:48px 20px}
.ei{font-size:40px;margin-bottom:12px}.et{color:var(--tx3);font-size:14px}
.toast{position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--sf2);border:1px solid var(--bd2);border-radius:var(--rs);padding:11px 18px;font-size:13px;color:var(--tx);box-shadow:0 8px 24px #00000080;animation:tin .2s ease}
@keyframes tin{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
.toast.success{border-color:#10b98140;color:var(--gr)}.toast.error{border-color:#f43f5e40;color:var(--rd)}
.bk{display:inline-flex;align-items:center;gap:6px;color:var(--tx2);font-size:13px;font-weight:500;background:var(--sf2);border:1px solid var(--bd);padding:6px 14px;border-radius:var(--rs);cursor:pointer;transition:all .15s;margin-bottom:18px}
.bk:hover{color:var(--tx);border-color:var(--ac2)}
.bqc{background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);overflow:hidden;margin-bottom:10px}
.bqh{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;transition:background .15s}
.bqh:hover{background:var(--sf2)}
.bqs{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.bqs.pend{background:#1a1a2e;border:1px solid var(--bd2)}
.bqs.proc{background:#2a1a50;border:1px solid var(--ac)}
.bqs.rev{background:#1a2a1a;border:1px solid #10b98150}
.bqs.done{background:#0d2010;border:1px solid #10b98130}
.bqs.err{background:#2a0e0e;border:1px solid #f43f5e30}
.bqb{border-top:1px solid var(--bd);padding:14px 16px;background:var(--sf2)}
.bqir{display:grid;grid-template-columns:1fr auto 170px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd)}
.bqir:last-child{border-bottom:none}
.bpb{height:4px;background:var(--sf2);border-radius:2px;overflow:hidden;margin-bottom:20px}
.bpbf{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--ac),var(--ac2));transition:width .4s}
.bsum{background:linear-gradient(135deg,#1a1a2e,#0d0d1a);border:1px solid #3d1d8a40;border-radius:var(--r);padding:20px;margin-bottom:16px}
.brm{background:none;border:none;color:var(--tx3);cursor:pointer;font-size:16px;padding:4px;line-height:1;flex-shrink:0}
.brm:hover{color:var(--rd)}
.sep{height:1px;background:var(--bd);margin:16px 0}
.fx{display:flex}.fc{display:flex;align-items:center}.fb{display:flex;justify-content:space-between;align-items:center}
.g8{gap:8px}.g12{gap:12px}
.muted{color:var(--tx2)}.dim{color:var(--tx3)}.bold{font-weight:700}
.sy{font-family:'Syne',sans-serif}
.mt4{margin-top:4px}.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.mb4{margin-bottom:4px}.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}.mb20{margin-bottom:20px}
@media(max-width:900px){.sb{display:none}.main{margin-left:0;padding:16px}.g4{grid-template-columns:repeat(2,1fr)}.g2{grid-template-columns:1fr}.fr{grid-template-columns:1fr}.gm{grid-template-columns:repeat(4,1fr)}}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
`;

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type="default", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast ${type}`}>{msg}</div>;
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [data,  setData]  = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [page,  setPage]  = useState("dashboard");
  const [toast, setToast] = useState(null);

  useEffect(() => { loadData().then(d => { setData(d); setReady(true); }); }, []);

  const showToast = useCallback((msg, type="default") => setToast({ msg, type }), []);
  const update = useCallback((patch) => {
    setData(prev => { const next={...prev,...patch}; saveData(next); return next; });
  }, []);

  if (!ready) return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080810",color:"#8888a8",fontFamily:"DM Sans,sans-serif",flexDirection:"column",gap:12}}>
        <div className="sp" style={{fontSize:32}}>⟳</div>
        <div>Loading Kharchi…</div>
      </div>
    </>
  );

  if (!data.currentUser) return (
    <>
      <style>{CSS}</style>
      <Auth data={data} update={update} toast={showToast} />
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </>
  );

  const myExp   = data.expenses.filter(e => e.uid === data.currentUser.id);
  const myItems = data.items.filter(i => i.uid === data.currentUser.id);
  const nav = [
    {id:"dashboard",ic:"⬡",lb:"Dashboard"},
    {id:"add",ic:"＋",lb:"Add Expense"},
    {id:"expenses",ic:"≡",lb:"All Expenses"},
    {id:"analysis",ic:"◎",lb:"Analysis"},
    {id:"trends",ic:"↗",lb:"Trends"},
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="sb">
          <div className="logo">Kharchi<em>.</em></div>
          <div className="nl">Menu</div>
          {nav.map(n => (
            <button key={n.id} className={`nb ${page===n.id?"on":""}`} onClick={()=>setPage(n.id)}>
              <span className="ni">{n.ic}</span>{n.lb}
            </button>
          ))}
          <div className="sbf">
            <div className="up mb8">
              <div className="un">{data.currentUser.name}</div>
              <div className="ue">{data.currentUser.email}</div>
            </div>
            <button className="nb" onClick={()=>update({currentUser:null})}>
              <span className="ni">⏻</span>Logout
            </button>
          </div>
        </nav>
        <main className="main">
          {page==="dashboard" && <Dashboard exp={myExp} items={myItems} setPage={setPage} />}
          {page==="add"       && <AddExpense data={data} update={update} toast={showToast} setPage={setPage} />}
          {page==="expenses"  && <ExpenseList data={data} update={update} toast={showToast} />}
          {page==="analysis"  && <Analysis exp={myExp} items={myItems} data={data} update={update} toast={showToast} />}
          {page==="trends"    && <Trends exp={myExp} items={myItems} />}
        </main>
      </div>
      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </>
  );
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function Auth({ data, update, toast }) {
  const [login, setLogin] = useState(true);
  const [f, setF] = useState({name:"",email:"",password:""});
  const submit = () => {
    if (!f.email||!f.password) return toast("Fill all fields","error");
    if (login) {
      const u = data.users.find(u=>u.email===f.email&&u.password===f.password);
      if (!u) return toast("Invalid credentials","error");
      update({currentUser:u});
    } else {
      if (!f.name) return toast("Name required","error");
      if (data.users.find(u=>u.email===f.email)) return toast("Email exists","error");
      const u={id:uid(),name:f.name,email:f.email,password:f.password};
      update({users:[...data.users,u],currentUser:u});
      toast("Welcome to Kharchi!","success");
    }
  };
  return (
    <div className="aw">
      <div className="ag" style={{width:500,height:500,top:-200,left:-200,background:"radial-gradient(circle,#4f1b9018 0%,transparent 70%)"}}/>
      <div className="ag" style={{width:400,height:400,bottom:-150,right:-150,background:"radial-gradient(circle,#6366f115 0%,transparent 70%)"}}/>
      <div className="ac">
        <div className="al">Kharchi<em>.</em></div>
        <div className="as">{login?"Track every rupee. Know your patterns.":"Start your expense journey today."}</div>
        {!login&&<div className="fg"><label className="fl">Full Name</label><input className="fi" placeholder="Rahul Sharma" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>}
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" placeholder="you@example.com" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
        <div className="fg"><label className="fl">Password</label><input className="fi" type="password" placeholder="••••••••" value={f.password} onChange={e=>setF({...f,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
        <button className="btn bp bfl mt8" onClick={submit}>{login?"Sign In →":"Create Account →"}</button>
        <div className="dv"/>
        <p style={{textAlign:"center",fontSize:13,color:"var(--tx2)"}}>
          {login?"No account? ":"Have one? "}
          <span style={{color:"var(--ac2)",cursor:"pointer",fontWeight:600}} onClick={()=>setLogin(!login)}>{login?"Sign up free":"Sign in"}</span>
        </p>
        <p className="dim mt12" style={{textAlign:"center",fontSize:11}}>Any email + password to register</p>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ exp, items, setPage }) {
  const now=new Date(), thisM=now.getMonth(), thisY=now.getFullYear();
  const total=exp.reduce((s,e)=>s+e.amount,0);
  const fixed=exp.filter(e=>e.etype==="fixed").reduce((s,e)=>s+e.amount,0);
  const disc=exp.filter(e=>!e.essential).reduce((s,e)=>s+e.amount,0);
  const mAmt=exp.filter(e=>{const d=new Date(e.date);return d.getMonth()===thisM&&d.getFullYear()===thisY;}).reduce((s,e)=>s+e.amount,0);
  const pieD=[{name:"Fixed",value:fixed},{name:"Variable",value:total-fixed}];
  const catD=Object.entries(exp.reduce((a,e)=>{a[e.cat]=(a[e.cat]||0)+e.amount;return a;},{})).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,7);
  const recent=[...exp].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  return (
    <div>
      <div className="ph">
        <div><div className="pt">Dashboard</div><div className="ps">Your financial snapshot</div></div>
        <button className="btn bp" onClick={()=>setPage("add")}>＋ Add Expense</button>
      </div>
      <div className="g4">
        {[{lb:"Total All-Time",v:total,c:"var(--ac2)",s:"all expenses"},{lb:"This Month",v:mAmt,c:"var(--gr)",s:FULL_MONTHS[thisM]+" "+thisY},{lb:"Fixed Expenses",v:fixed,c:"var(--am)",s:total>0?`${Math.round(fixed/total*100)}% of total`:"—"},{lb:"Discretionary",v:disc,c:"var(--rd)",s:"non-essential"}].map((s,i)=>(
          <div key={i} className="card" style={{borderTop:`2px solid ${s.c}`}}>
            <div className="ct">{s.lb}</div><div className="cv" style={{color:s.c}}>{fmt(s.v)}</div><div className="cs">{s.s}</div>
          </div>
        ))}
      </div>
      <div className="g2">
        <div className="card">
          <div className="ct mb12">Fixed vs Variable</div>
          {total>0?<ResponsiveContainer width="100%" height={200}><PieChart><Pie data={pieD} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#505068"}}>{pieD.map((_,i)=><Cell key={i} fill={["#7c3aed","#4f46e5"][i]}/>)}</Pie><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/></PieChart></ResponsiveContainer>:<div className="empty"><div className="et">No data yet</div></div>}
        </div>
        <div className="card">
          <div className="ct mb12">Top Categories</div>
          {catD.length>0?<ResponsiveContainer width="100%" height={200}><BarChart data={catD} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#252538" horizontal={false}/><XAxis type="number" tick={{fill:"#8888a8",fontSize:11}} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`}/><YAxis type="category" dataKey="name" tick={{fill:"#8888a8",fontSize:11}} width={90}/><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/><Bar dataKey="value" radius={[0,4,4,0]}>{catD.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>:<div className="empty"><div className="et">No data yet</div></div>}
        </div>
      </div>
      <div className="card">
        <div className="fb mb12"><div className="ct">Recent Expenses</div><button className="btn bg bsm" onClick={()=>setPage("expenses")}>View All →</button></div>
        {recent.length===0?<div className="empty"><div className="ei">💸</div><div className="et">No expenses yet!</div></div>:(
          <div className="tw"><table>
            <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Type</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
            <tbody>{recent.map(e=>(
              <tr key={e.id}>
                <td className="dim" style={{whiteSpace:"nowrap"}}>{new Date(e.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"})}</td>
                <td className="bold">{e.merchant||e.desc||"—"}</td>
                <td><span className="badge bpu">{e.cat}</span></td>
                <td><span className={`badge ${e.etype==="fixed"?"bam":"bgy"}`}>{e.etype}</span></td>
                <td className="tn">{fmt(e.amount)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// ── ADD EXPENSE ───────────────────────────────────────────────────────────────
const EF={amount:"",cat:"",customCat:"",etype:"variable",desc:"",date:new Date().toISOString().slice(0,10),merchant:"",essential:false,recurring:false};

function AddExpense({ data, update, toast, setPage }) {
  const [tab,   setTab]   = useState("manual");
  const [form,  setForm]  = useState(EF);
  const [errs,  setErrs]  = useState({});
  const [stage, setStage] = useState("idle");
  const [ocr,   setOcr]   = useState(null);
  const [drag,  setDrag]  = useState(false);

  const myExp   = data.expenses.filter(e=>e.uid===data.currentUser.id);
  const maps    = data.maps.filter(m=>m.uid===data.currentUser.id);
  const allCats = [...new Set([...DEFAULT_CATS,...myExp.map(e=>e.cat)])];
  const sf=(k,v)=>{setForm(f=>({...f,[k]:v}));setErrs(e=>({...e,[k]:undefined}));};

  const validate=()=>{
    const e={};
    if(!form.amount||parseFloat(form.amount)<=0) e.amount="Enter valid amount";
    if(!(form.cat==="__c__"?form.customCat.trim():form.cat)) e.cat="Select a category";
    if(!form.date) e.date="Date required";
    setErrs(e); return !Object.keys(e).length;
  };

  const saveManual=()=>{
    if(!validate()) return;
    const cat=form.cat==="__c__"?form.customCat.trim():form.cat;
    update({expenses:[...data.expenses,{id:uid(),uid:data.currentUser.id,amount:parseFloat(form.amount),cat,etype:form.etype,desc:form.desc.trim(),date:form.date,merchant:form.merchant.trim(),essential:form.essential,recurring:form.recurring,created:new Date().toISOString()}]});
    toast("Expense saved ✓","success"); setForm(EF); setErrs({}); setPage("expenses");
  };

  const handleFile=async(file)=>{
    if(!file) return; setStage("processing");
    try {
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
      const result=await ocrBill(b64,file.type||"image/jpeg",maps,allCats);
      setOcr(result); setStage("review");
    } catch(e) {
      const msg = e.message.includes("401") ? "Invalid API key — check VITE_ANTHROPIC_KEY in Vercel Settings" :
                  e.message.includes("403") ? "API key not authorised" :
                  e.message.includes("API 4") ? "API error: "+e.message :
                  "Scan failed: "+e.message;
      toast(msg, "error");
      setStage("idle");
    }
  };

  const saveBill=()=>{
    const groups=ocr.items.reduce((a,i)=>{if(!a[i.category])a[i.category]=[];a[i.category].push(i);return a;},{});
    const newExp=[],newItems=[],newMaps=[...data.maps];
    Object.entries(groups).forEach(([cat,ci])=>{
      const amt=ci.reduce((s,i)=>s+i.price,0),eid=uid();
      newExp.push({id:eid,uid:data.currentUser.id,amount:amt,cat,etype:ocr.expense_type,desc:`${ocr.merchant} — ${cat}`,date:ocr.date,merchant:ocr.merchant,essential:ESSENTIAL_CATS.includes(cat),recurring:ocr.is_recurring,created:new Date().toISOString()});
      ci.forEach(item=>{
        newItems.push({id:uid(),eid,uid:data.currentUser.id,name:item.name,price:item.price,cat,created:new Date().toISOString()});
        const idx=newMaps.findIndex(m=>m.uid===data.currentUser.id&&m.k===item.name.toLowerCase());
        if(idx>=0) newMaps[idx]={...newMaps[idx],cat,n:newMaps[idx].n+1};
        else newMaps.push({id:uid(),uid:data.currentUser.id,k:item.name.toLowerCase(),cat,n:1});
      });
    });
    update({expenses:[...data.expenses,...newExp],items:[...data.items,...newItems],maps:newMaps});
    toast(`${newExp.length} expense${newExp.length>1?"s":""} saved ✓`,"success");
    setStage("idle"); setOcr(null); setPage("expenses");
  };

  const splits=ocr?new Set(ocr.items.map(i=>i.category)).size:0;

  return (
    <div>
      <button className="bk" onClick={()=>setPage("dashboard")}>← Dashboard</button>
      <div className="ph"><div><div className="pt">Add Expense</div><div className="ps">Upload a bill or enter manually</div></div></div>
      <div className="tbar">
        <button className={`tbtn ${tab==="manual"?"on":""}`} onClick={()=>{setTab("manual");setStage("idle");setOcr(null);}}>✏️ Manual</button>
        <button className={`tbtn ${tab==="upload"?"on":""}`} onClick={()=>setTab("upload")}>📷 Upload Bill</button>
        <button className={`tbtn ${tab==="bulk"?"on":""}`} onClick={()=>{setTab("bulk");setStage("idle");setOcr(null);}}>📦 Bulk Upload</button>
      </div>

      {tab==="manual"&&(
        <div className="card" style={{maxWidth:580}}>
          <div className="fr"><div className="fg"><label className="fl">Amount (₹) *</label><input className={`fi ${errs.amount?"fie":""}`} type="number" min="0" placeholder="0.00" value={form.amount} onChange={e=>sf("amount",e.target.value)}/>{errs.amount&&<div className="em">{errs.amount}</div>}</div><div className="fg"><label className="fl">Date *</label><input className={`fi ${errs.date?"fie":""}`} type="date" value={form.date} onChange={e=>sf("date",e.target.value)}/>{errs.date&&<div className="em">{errs.date}</div>}</div></div>
          <div className="fg"><label className="fl">Category *</label><select className={`fi ${errs.cat?"fie":""}`} value={form.cat} onChange={e=>sf("cat",e.target.value)}><option value="">— Select —</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}<option value="__c__">＋ Custom…</option></select>{errs.cat&&<div className="em">{errs.cat}</div>}</div>
          {form.cat==="__c__"&&<div className="fg"><label className="fl">Custom Category</label><input className="fi" placeholder="e.g. Gaming, Pet Care…" value={form.customCat} onChange={e=>sf("customCat",e.target.value)}/></div>}
          <div className="fg"><label className="fl">Description</label><input className="fi" placeholder="What was this for?" value={form.desc} onChange={e=>sf("desc",e.target.value)}/></div>
          <div className="fr"><div className="fg"><label className="fl">Merchant</label><input className="fi" placeholder="Store / vendor" value={form.merchant} onChange={e=>sf("merchant",e.target.value)}/></div><div className="fg"><label className="fl">Type</label><select className="fi" value={form.etype} onChange={e=>sf("etype",e.target.value)}><option value="variable">Variable</option><option value="fixed">Fixed</option></select></div></div>
          <div className="cbg"><label className="cbr"><input type="checkbox" checked={form.essential} onChange={e=>sf("essential",e.target.checked)}/><span>✅ Essential</span></label><label className="cbr"><input type="checkbox" checked={form.recurring} onChange={e=>sf("recurring",e.target.checked)}/><span>🔄 Recurring</span></label></div>
          <div className="br"><button className="btn bp" onClick={saveManual}>Save →</button><button className="btn bg" onClick={()=>{setForm(EF);setErrs({});}}>Clear</button></div>
        </div>
      )}

      {tab==="upload"&&stage==="idle"&&(
        <div style={{maxWidth:580}}>
          <div className={`dz ${drag?"ov":""}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}} onClick={()=>document.getElementById("bup").click()}>
            <input id="bup" type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            <span className="di">📄</span><div className="dt">Drop bill here or click to browse</div><div className="ds mt4">PNG, JPG, WEBP, PDF supported</div>
          </div>
          <div style={{fontSize:12,color:"var(--tx3)",padding:"10px 14px",background:"var(--sf2)",borderRadius:"var(--rs)",border:"1px solid var(--bd)"}}>⚡ <strong style={{color:"var(--tx2)"}}>AI OCR:</strong> Claude Vision reads your actual bill — amounts, items, dates extracted directly.</div>
        </div>
      )}

      {tab==="upload"&&stage==="processing"&&(
        <div className="card" style={{maxWidth:560,textAlign:"center",padding:52}}>
          <div className="sp">⟳</div><div className="muted">Scanning bill with AI…</div>
        </div>
      )}

      {tab==="upload"&&stage==="review"&&ocr&&(
        <div style={{maxWidth:640}}>
          <button className="bk" onClick={()=>{setStage("idle");setOcr(null);}}>← Upload different bill</button>
          <div className="card mb12">
            <div className="fb mb16"><div className="ct">📋 Review Extracted Details</div><span className="badge bgr">✓ AI Read</span></div>
            <div className="fr"><div className="fg" style={{marginBottom:0}}><label className="fl">Amount (₹)</label><input className="fi" type="number" value={ocr.amount} onChange={e=>setOcr({...ocr,amount:parseFloat(e.target.value)||0})}/></div><div className="fg" style={{marginBottom:0}}><label className="fl">Bill Date</label><input className="fi" type="date" value={ocr.date} onChange={e=>setOcr({...ocr,date:e.target.value})}/></div></div>
            <div className="fr mt8"><div className="fg" style={{marginBottom:0}}><label className="fl">Merchant</label><input className="fi" value={ocr.merchant} onChange={e=>setOcr({...ocr,merchant:e.target.value})}/></div><div className="fg" style={{marginBottom:0}}><label className="fl">Type</label><select className="fi" value={ocr.expense_type} onChange={e=>setOcr({...ocr,expense_type:e.target.value})}><option value="variable">Variable</option><option value="fixed">Fixed</option></select></div></div>
          </div>
          <div className="card mb12">
            <div className="fb mb12"><div className="ct">Line Items</div><span className="badge bgy">{ocr.items.length} items</span></div>
            {ocr.items.map((item,idx)=>(
              <div key={idx} className="ig">
                <div><div style={{fontSize:13,fontWeight:500}}>{item.name}</div>{item.learned&&<span className="badge blr" style={{display:"inline-block",marginTop:4}}>✓ Learned</span>}</div>
                <div style={{fontSize:13,fontWeight:700,color:"var(--ac2)",whiteSpace:"nowrap"}}>₹{item.price}</div>
                <select className="fi" style={{padding:"6px 10px",fontSize:12}} value={item.category} onChange={e=>{const it=[...ocr.items];it[idx]={...it[idx],category:e.target.value,learned:false};setOcr({...ocr,items:it});}}>
                  {allCats.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="spi">{splits>1?<>📂 Will create <strong>{splits} expenses</strong> by category.</>:<>✅ Single category — <strong>1 expense</strong>.</>}</div>
          {splits>1&&<div className="card mb12" style={{background:"var(--sf2)"}}><div className="ct mb8">Split Preview</div>{Object.entries(ocr.items.reduce((a,i)=>{a[i.category]=(a[i.category]||0)+i.price;return a;},{})).map(([cat,amt])=><div key={cat} className="fb" style={{padding:"7px 0",borderBottom:"1px solid var(--bd)",fontSize:13}}><span className="badge bpu">{cat}</span><span className="sy bold" style={{color:"var(--ac2)"}}>{fmt(amt)}</span></div>)}</div>}
          <div className="br"><button className="btn bp" onClick={saveBill}>✓ Confirm & Save</button><button className="btn bg" onClick={()=>{setStage("idle");setOcr(null);}}>Cancel</button></div>
        </div>
      )}

      {tab==="bulk"&&<BulkUpload data={data} update={update} toast={toast} setPage={setPage} allCats={allCats} maps={maps}/>}
    </div>
  );
}

// ── BULK UPLOAD ───────────────────────────────────────────────────────────────
function BulkUpload({ data, update, toast, setPage, allCats, maps }) {
  const [queue,  setQueue]  = useState([]);
  const [drag,   setDrag]   = useState(false);
  const [saving, setSaving] = useState(false);

  const processFile = async (id, fileObj) => {
    setQueue(q=>q.map(f=>f.id===id?{...f,status:"processing"}:f));
    try {
      const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(fileObj);});
      const ocr=await ocrBill(b64,fileObj.type||"image/jpeg",maps,allCats);
      setQueue(q=>q.map(f=>f.id===id?{...f,status:"review",ocr,expanded:true}:f));
    } catch(e) {
      setQueue(q=>q.map(f=>f.id===id?{...f,status:"error",errMsg:e.message}:f));
    }
  };

  const addFiles=(files)=>{
    const entries=Array.from(files).filter(f=>f.type.startsWith("image/")||f.type==="application/pdf").map(f=>({id:uid(),fileObj:f,name:f.name,status:"pending",ocr:null,expanded:false}));
    if(!entries.length) return toast("Only images/PDFs accepted","error");
    setQueue(q=>[...q,...entries]);
    entries.reduce((chain,e,i)=>chain.then(()=>new Promise(res=>{setTimeout(()=>processFile(e.id,e.fileObj).finally(res),i===0?50:600);})),Promise.resolve());
  };

  const updateOcr=(id,k,v)=>setQueue(q=>q.map(f=>f.id===id?{...f,ocr:{...f.ocr,[k]:v}}:f));
  const updateItemCat=(fid,idx,cat)=>setQueue(q=>q.map(f=>{if(f.id!==fid)return f;const it=[...f.ocr.items];it[idx]={...it[idx],category:cat,learned:false};return{...f,ocr:{...f.ocr,items:it}};}));
  const toggle=(id)=>setQueue(q=>q.map(f=>f.id===id?{...f,expanded:!f.expanded}:f));
  const remove=(id)=>setQueue(q=>q.filter(f=>f.id!==id));
  const skip=(id)=>setQueue(q=>q.map(f=>f.id===id?{...f,status:"skipped",expanded:false}:f));

  const readyQ=queue.filter(f=>f.status==="review");
  const doneQ=queue.filter(f=>f.status==="done");
  const scanning=queue.filter(f=>f.status==="processing").length;
  const pending=queue.filter(f=>f.status==="pending").length;
  const prog=queue.length>0?Math.round(((doneQ.length+queue.filter(f=>f.status==="skipped").length)/queue.length)*100):0;

  const saveAll=()=>{
    if(!readyQ.length) return;
    setSaving(true);
    const newExp=[],newItems=[],newMaps=[...data.maps];
    readyQ.forEach(({ocr})=>{
      const groups=ocr.items.reduce((a,i)=>{if(!a[i.category])a[i.category]=[];a[i.category].push(i);return a;},{});
      Object.entries(groups).forEach(([cat,ci])=>{
        const amt=ci.reduce((s,i)=>s+i.price,0),eid=uid();
        newExp.push({id:eid,uid:data.currentUser.id,amount:amt,cat,etype:ocr.expense_type,desc:`${ocr.merchant} — ${cat}`,date:ocr.date,merchant:ocr.merchant,essential:ESSENTIAL_CATS.includes(cat),recurring:ocr.is_recurring,created:new Date().toISOString()});
        ci.forEach(item=>{
          newItems.push({id:uid(),eid,uid:data.currentUser.id,name:item.name,price:item.price,cat,created:new Date().toISOString()});
          const idx=newMaps.findIndex(m=>m.uid===data.currentUser.id&&m.k===item.name.toLowerCase());
          if(idx>=0) newMaps[idx]={...newMaps[idx],cat,n:newMaps[idx].n+1};
          else newMaps.push({id:uid(),uid:data.currentUser.id,k:item.name.toLowerCase(),cat,n:1});
        });
      });
    });
    update({expenses:[...data.expenses,...newExp],items:[...data.items,...newItems],maps:newMaps});
    setQueue(q=>q.map(f=>f.status==="review"?{...f,status:"done",expanded:false}:f));
    setSaving(false);
    toast(`✓ ${newExp.length} expenses from ${readyQ.length} bills saved`,"success");
  };

  const sIcon=s=>({pending:"⏳",processing:"⟳",review:"✎",done:"✓",skipped:"–",error:"!"}[s]||"?");
  const sLabel=s=>({pending:"Queued",processing:"Scanning…",review:"Review",done:"Saved",skipped:"Skipped",error:"Error"}[s]||s);
  const sCls=s=>({pending:"pend",processing:"proc",review:"rev",done:"done",error:"err"}[s]||"pend");

  const apiKeyMissing = !window.ANTHROPIC_API_KEY || window.ANTHROPIC_API_KEY === "YOUR_API_KEY_HERE" || window.ANTHROPIC_API_KEY.length < 10;

  return (
    <div style={{maxWidth:820}}>
      {apiKeyMissing&&(
        <div style={{background:"#2a0e0e",border:"1px solid #f43f5e60",borderRadius:"var(--rs)",padding:"12px 16px",marginBottom:16,fontSize:13}}>
          <div style={{color:"var(--rd)",fontWeight:700,marginBottom:4}}>⚠️ API Key Missing</div>
          <div style={{color:"var(--tx2)"}}>Bill scanning won't work without an Anthropic API key. Add <code style={{background:"#ffffff10",padding:"1px 6px",borderRadius:4}}>VITE_ANTHROPIC_KEY</code> in your Vercel project → Settings → Environment Variables, then redeploy.</div>
        </div>
      )}
      <div className={`dz ${drag?"ov":""}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);}} onClick={()=>document.getElementById("blk").click()}>
        <input id="blk" type="file" accept="image/*,.pdf" multiple style={{display:"none"}} onChange={e=>{addFiles(e.target.files);e.target.value="";}}/>
        <span className="di">📦</span><div className="dt">Drop multiple bills or click to browse</div><div className="ds mt4">Scanned one-by-one with AI — dates, amounts, items extracted</div>
      </div>
      {!queue.length&&<div style={{fontSize:12,color:"var(--tx3)",padding:"10px 14px",background:"var(--sf2)",borderRadius:"var(--rs)",border:"1px solid var(--bd)"}}>⚡ <strong style={{color:"var(--tx2)"}}>Bulk AI OCR:</strong> Upload old bills — each scanned sequentially, review categories, save all at once.</div>}

      {queue.length>0&&(
        <div className="mb16">
          <div className="fb mb8" style={{fontSize:12,color:"var(--tx2)"}}>
            <span>
              {scanning>0&&<span style={{color:"var(--ac2)",marginRight:10}}>⟳ Scanning {scanning}…</span>}
              {readyQ.length>0&&<span style={{color:"var(--am)",marginRight:10}}>✎ {readyQ.length} ready</span>}
              {doneQ.length>0&&<span style={{color:"var(--gr)",marginRight:10}}>✓ {doneQ.length} saved</span>}
              {pending>0&&<span style={{color:"var(--tx3)"}}>⏳ {pending} queued</span>}
            </span>
            <span>{prog}%</span>
          </div>
          <div className="bpb"><div className="bpbf" style={{width:`${prog}%`}}/></div>
        </div>
      )}

      {readyQ.length>0&&!saving&&(
        <div className="bsum mb16">
          <div className="fb">
            <div><div className="sy bold" style={{fontSize:16}}>{readyQ.length} bill{readyQ.length>1?"s":""} ready</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:3}}>Review categories then save all</div></div>
            <div className="fc g8"><button className="btn bp" onClick={saveAll}>✓ Save All {readyQ.length}</button><button className="btn bg bsm" onClick={()=>readyQ.forEach(f=>skip(f.id))}>Skip All</button></div>
          </div>
        </div>
      )}

      {!readyQ.length&&doneQ.length>0&&!scanning&&(
        <div className="fb mb16 card" style={{background:"#0d1f0e",border:"1px solid #10b98130"}}>
          <div><div style={{fontWeight:700,color:"var(--gr)"}}>✓ All done! {doneQ.length} bill{doneQ.length>1?"s":""} saved.</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:3}}>Categories learned for future uploads.</div></div>
          <button className="btn bg bsm" onClick={()=>setPage("expenses")}>View Expenses →</button>
        </div>
      )}

      {queue.map(f=>(
        <div key={f.id} className="bqc">
          <div className="bqh" onClick={()=>f.status==="review"&&toggle(f.id)}>
            <div className={`bqs ${sCls(f.status)}`} style={f.status==="processing"?{animation:"sp 1s linear infinite"}:{}}>{sIcon(f.status)}</div>
            <div style={{flex:1,fontSize:13,fontWeight:500,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
            {f.status==="review"&&f.ocr&&<div className="fc g8" style={{marginRight:8}}><span className="badge bpu">{f.ocr.merchant}</span><span className="badge bam sy">{fmt(f.ocr.amount)}</span><span style={{fontSize:11,color:"var(--tx3)"}}>{new Set(f.ocr.items.map(i=>i.category)).size} cat</span></div>}
            {f.status==="done"&&f.ocr&&<span className="badge bgr" style={{marginRight:8}}>✓ {f.ocr.merchant}</span>}
            {f.status==="error"&&<button className="btn bg bsm" style={{marginRight:8,color:"var(--am)",fontSize:11}} onClick={e=>{e.stopPropagation();processFile(f.id,f.fileObj);}}>↻ Retry</button>}
            <div style={{fontSize:11,color:f.status==="error"?"var(--rd)":"var(--tx3)",whiteSpace:"nowrap",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>{f.status==="error"&&f.errMsg?f.errMsg:sLabel(f.status)}</div>
            {f.status!=="done"&&f.status!=="processing"&&<button className="brm" onClick={e=>{e.stopPropagation();remove(f.id);}}>✕</button>}
            {f.status==="review"&&<span style={{fontSize:11,color:"var(--tx3)",marginLeft:6}}>{f.expanded?"▲":"▼"}</span>}
          </div>
          {f.status==="review"&&f.expanded&&f.ocr&&(
            <div className="bqb">
              <div className="fr mb12">
                <div className="fg" style={{marginBottom:0}}><label className="fl">Amount</label><input className="fi" type="number" value={f.ocr.amount} onChange={e=>updateOcr(f.id,"amount",parseFloat(e.target.value)||0)}/></div>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Date</label><input className="fi" type="date" value={f.ocr.date} onChange={e=>updateOcr(f.id,"date",e.target.value)}/></div>
              </div>
              <div className="fr mb12">
                <div className="fg" style={{marginBottom:0}}><label className="fl">Merchant</label><input className="fi" value={f.ocr.merchant} onChange={e=>updateOcr(f.id,"merchant",e.target.value)}/></div>
                <div className="fg" style={{marginBottom:0}}><label className="fl">Type</label><select className="fi" value={f.ocr.expense_type} onChange={e=>updateOcr(f.id,"expense_type",e.target.value)}><option value="variable">Variable</option><option value="fixed">Fixed</option></select></div>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Items — {f.ocr.items.length}</div>
              {f.ocr.items.map((item,idx)=>(
                <div key={idx} className="bqir">
                  <div><div style={{fontSize:13,fontWeight:500}}>{item.name}</div>{item.learned&&<span className="badge blr" style={{marginTop:3,display:"inline-block"}}>✓ Learned</span>}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--ac2)",whiteSpace:"nowrap"}}>₹{item.price}</div>
                  <select className="fi" style={{padding:"5px 8px",fontSize:12}} value={item.category} onChange={e=>updateItemCat(f.id,idx,e.target.value)}>{allCats.map(c=><option key={c} value={c}>{c}</option>)}</select>
                </div>
              ))}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                {Object.entries(f.ocr.items.reduce((a,i)=>{a[i.category]=(a[i.category]||0)+i.price;return a;},{})).map(([cat,amt])=>(
                  <span key={cat} style={{fontSize:12,padding:"3px 10px",borderRadius:20,background:"var(--sf3)",border:"1px solid var(--bd2)",color:"var(--tx2)"}}>{cat}: <strong style={{color:"var(--ac2)"}}>{fmt(amt)}</strong></span>
                ))}
              </div>
              <div className="br mt12">
                <button className="btn bg bsm" onClick={()=>toggle(f.id)}>Collapse ▲</button>
                <button className="btn bg bsm" style={{color:"var(--rd)"}} onClick={()=>skip(f.id)}>Skip</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {readyQ.length>1&&(
        <div style={{position:"sticky",bottom:20,zIndex:50,marginTop:16}}>
          <div className="card fb" style={{background:"#1a1030",border:"1px solid #3d1d8a50"}}>
            <div style={{fontSize:13,color:"var(--tx2)"}}><strong style={{color:"var(--ac2)"}}>{readyQ.length} bills</strong> ready</div>
            <button className="btn bp" onClick={saveAll} disabled={saving}>{saving?"⟳ Saving…":`✓ Save All ${readyQ.length}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EXPENSE LIST ──────────────────────────────────────────────────────────────
function ExpenseList({ data, update, toast }) {
  const [catF,setCatF]=useState(""), [typeF,setTypeF]=useState(""), [search,setSearch]=useState("");
  const myExp=data.expenses.filter(e=>e.uid===data.currentUser.id);
  const allCats=[...new Set(myExp.map(e=>e.cat))];
  const filtered=myExp.filter(e=>(!catF||e.cat===catF)&&(!typeF||e.etype===typeF)&&(!search||`${e.desc} ${e.merchant} ${e.cat}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total=filtered.reduce((s,e)=>s+e.amount,0);
  const del=id=>{update({expenses:data.expenses.filter(e=>e.id!==id),items:data.items.filter(i=>i.eid!==id)});toast("Deleted","success");};
  return (
    <div>
      <div className="ph"><div><div className="pt">All Expenses</div><div className="ps">{filtered.length} entries · {fmt(total)}</div></div></div>
      <div className="fc g8 mb16" style={{flexWrap:"wrap"}}>
        <input className="fi" style={{width:200}} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="fi" style={{width:"auto"}} value={catF} onChange={e=>setCatF(e.target.value)}><option value="">All Categories</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select className="fi" style={{width:"auto"}} value={typeF} onChange={e=>setTypeF(e.target.value)}><option value="">All Types</option><option value="fixed">Fixed</option><option value="variable">Variable</option></select>
      </div>
      {!filtered.length?<div className="card empty"><div className="ei">📭</div><div className="et">No expenses found</div></div>:(
        <div className="card">
          <div className="tw"><table>
            <thead><tr><th>Date</th><th>Merchant</th><th>Description</th><th>Category</th><th>Type</th><th>Essential</th><th style={{textAlign:"right"}}>Amount</th><th></th></tr></thead>
            <tbody>{filtered.map(e=>(
              <tr key={e.id}>
                <td className="dim" style={{whiteSpace:"nowrap"}}>{new Date(e.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"})}</td>
                <td className="bold">{e.merchant||"—"}</td>
                <td className="muted">{e.desc||"—"}</td>
                <td><span className="badge bpu">{e.cat}</span></td>
                <td><span className={`badge ${e.etype==="fixed"?"bam":"bgy"}`}>{e.etype}</span></td>
                <td>{e.essential?<span className="badge bgr">Yes</span>:<span className="badge bgy">No</span>}</td>
                <td className="tn">{fmt(e.amount)}</td>
                <td><button className="btn bdr bsm" onClick={()=>del(e.id)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="fb mt16" style={{paddingTop:16,borderTop:"1px solid var(--bd)"}}><span className="muted">Total:</span><span className="sy bold" style={{fontSize:18,color:"var(--ac2)"}}>{fmt(total)}</span></div>
        </div>
      )}
    </div>
  );
}

// ── ANALYSIS ──────────────────────────────────────────────────────────────────
// Smart auto-category suggestions via Claude
async function suggestCategory(itemName, existingCats) {
  try {
    const res = await fetch("/api/claude", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-3-haiku-20240307", max_tokens:50,
        messages:[{role:"user",content:`What single category best fits this item: "${itemName}"? Choose from: ${existingCats.join(", ")}. Reply with ONLY the category name, nothing else.`}]
      })
    });
    const d = await res.json();
    return d.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}

function Analysis({ exp, items, data, update, toast }) {
  const [tab, setTab] = useState("fv");
  const [selCat, setSelCat] = useState(null); // for drill-down
  const [selMerchant, setSelMerchant] = useState(null); // for merchant drill-down
  const [editingCats, setEditingCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [renamingCat, setRenamingCat] = useState(null); // {old, val}
  const [suggestLoading, setSuggestLoading] = useState(null);

  const allCats = [...new Set([...DEFAULT_CATS, ...exp.map(e=>e.cat)])].sort();

  const total = exp.reduce((s,e)=>s+e.amount,0);
  const fixed = exp.filter(e=>e.etype==="fixed").reduce((s,e)=>s+e.amount,0);
  const ess   = exp.filter(e=>e.essential).reduce((s,e)=>s+e.amount,0);
  const disc  = total-ess;

  // Fees analysis
  const feeItems = items.filter(i=>i.cat==="Fees & Charges");
  const feeExp   = exp.filter(e=>e.cat==="Fees & Charges");
  const feeTotal = feeItems.reduce((s,i)=>s+i.price,0) || feeExp.reduce((s,e)=>s+e.amount,0);
  const feeByMerchant = Object.values(
    feeItems.reduce((a,i)=>{
      const e = exp.find(ex=>ex.id===i.eid);
      const m = e?.merchant||"Unknown";
      if(!a[m]) a[m]={merchant:m,total:0,count:0};
      a[m].total+=i.price; a[m].count++;
      return a;
    },{})
  ).sort((a,b)=>b.total-a.total);
  const feeByType = Object.values(
    feeItems.reduce((a,i)=>{
      const k = i.name.toLowerCase().includes("delivery")?"Delivery Fees":
                i.name.toLowerCase().includes("handling")?"Handling Fees":
                i.name.toLowerCase().includes("marketplace")||i.name.toLowerCase().includes("market")?"Marketplace Fees":
                i.name.toLowerCase().includes("convenience")?"Convenience Fees":
                i.name.toLowerCase().includes("gst")||i.name.toLowerCase().includes("tax")?"Taxes & GST":
                "Other Fees";
      if(!a[k]) a[k]={type:k,total:0,count:0};
      a[k].total+=i.price; a[k].count++;
      return a;
    },{})
  ).sort((a,b)=>b.total-a.total);

  // Category data
  const catD = Object.entries(
    exp.reduce((a,e)=>{a[e.cat]=(a[e.cat]||0)+e.amount;return a;},{})
  ).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  // Item-wise under selected category
  const catItems = selCat ? Object.values(
    items.filter(i=>i.cat===selCat).reduce((a,i)=>{
      const k=i.name.toLowerCase();
      if(!a[k]) a[k]={name:i.name,count:0,total:0,avgPrice:0};
      a[k].count++; a[k].total+=i.price;
      return a;
    },{})
  ).map(i=>({...i,avgPrice:Math.round(i.total/i.count)})).sort((a,b)=>b.total-a.total) : [];

  // Also include expenses in that category that have no items
  const catExpTotal = selCat ? exp.filter(e=>e.cat===selCat).reduce((s,e)=>s+e.amount,0) : 0;

  const itemFreq = Object.values(
    items.reduce((a,i)=>{const k=i.name.toLowerCase();if(!a[k])a[k]={name:i.name,count:0,total:0,cat:i.cat};a[k].count++;a[k].total+=i.price;return a;},{})
  ).sort((a,b)=>b.total-a.total);

  const discG = Object.values(
    exp.filter(e=>!e.essential).reduce((a,e)=>{const k=e.merchant||e.desc||e.cat;if(!a[k])a[k]={name:k,count:0,total:0};a[k].count++;a[k].total+=e.amount;return a;},{})
  ).filter(g=>g.count>=2||g.total>500).sort((a,b)=>b.total-a.total);

  const recG = Object.values(
    exp.filter(e=>e.recurring).reduce((a,e)=>{const k=e.desc||e.merchant;if(!a[k])a[k]={name:k,count:0,total:0};a[k].count++;a[k].total+=e.amount;return a;},{})
  ).sort((a,b)=>b.total-a.total);

  // Merchant analysis data
  const merchantD = Object.values(
    exp.reduce((a,e)=>{
      const m = e.merchant||e.desc||"Unknown";
      if(!a[m]) a[m]={merchant:m,total:0,count:0,cats:[]};
      a[m].total+=e.amount; a[m].count++;
      if(!a[m].cats.includes(e.cat)) a[m].cats.push(e.cat);
      return a;
    },{})
  ).sort((a,b)=>b.total-a.total);

  // Category management
  const renameCategory = (oldCat, newCat) => {
    if (!newCat.trim() || newCat===oldCat) return;
    const newExp   = data.expenses.map(e=>e.cat===oldCat?{...e,cat:newCat}:e);
    const newItems = data.items.map(i=>i.cat===oldCat?{...i,cat:newCat}:i);
    const newMaps  = data.maps.map(m=>m.cat===oldCat?{...m,cat:newCat}:m);
    update({expenses:newExp,items:newItems,maps:newMaps});
    toast(`"${oldCat}" renamed to "${newCat}"`, "success");
    setRenamingCat(null);
    if(selCat===oldCat) setSelCat(newCat);
  };

  const deleteCategory = (cat) => {
    const count = exp.filter(e=>e.cat===cat).length;
    if (count>0) { toast(`Move or reassign ${count} expenses first`, "error"); return; }
    toast(`Category "${cat}" removed`, "success");
    setRenamingCat(null);
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    if (allCats.includes(newCatName.trim())) { toast("Category already exists","error"); return; }
    // Add a dummy map entry so it persists
    update({maps:[...data.maps,{id:uid(),uid:data.currentUser.id,k:"__cat__"+newCatName.trim().toLowerCase(),cat:newCatName.trim(),n:0,isCustomCat:true}]});
    toast(`Category "${newCatName.trim()}" added`,"success");
    setNewCatName("");
  };

  const autoSuggestForItem = async (itemName) => {
    setSuggestLoading(itemName);
    const suggested = await suggestCategory(itemName, allCats);
    setSuggestLoading(null);
    if (suggested && allCats.includes(suggested)) {
      // Apply to all items with this name
      const newItems = data.items.map(i=>i.name.toLowerCase()===itemName.toLowerCase()?{...i,cat:suggested}:i);
      const newMaps  = data.maps.map(m=>m.k===itemName.toLowerCase()?{...m,cat:suggested}:m);
      const noMap    = !data.maps.find(m=>m.k===itemName.toLowerCase());
      update({items:newItems,maps:noMap?[...newMaps,{id:uid(),uid:data.currentUser.id,k:itemName.toLowerCase(),cat:suggested,n:1}]:newMaps});
      toast(`"${itemName}" → ${suggested}`,"success");
    } else {
      toast("Could not determine category","error");
    }
  };

  const tabs = [
    {id:"fv",lb:"Fixed vs Variable"},
    {id:"cats",lb:"Categories"},
    {id:"items",lb:"Item-wise"},
    {id:"fees",lb:"Fees & Charges"},
    {id:"waste",lb:"Wasteful"},
    {id:"fizul",lb:"Fizul Kharchi"},
    {id:"rec",lb:"Recurring"},
    {id:"merchant",lb:"Merchants"},
    {id:"catmgr",lb:"⚙ Manage Cats"},
  ];

  return (
    <div>
      <div className="ph"><div><div className="pt">Analysis</div><div className="ps">Deep dive into spending</div></div></div>
      <div className="tbar">{tabs.map(t=><button key={t.id} className={`tbtn ${tab===t.id?"on":""}`} onClick={()=>{setTab(t.id);if(t.id!=="cats")setSelCat(null);}}>{t.lb}</button>)}</div>

      {/* FIXED VS VARIABLE */}
      {tab==="fv"&&<div className="g2">
        <div className="card">{total>0?<ResponsiveContainer width="100%" height={280}><PieChart><Pie data={[{name:"Fixed",value:fixed},{name:"Variable",value:total-fixed}]} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#505068"}}><Cell fill="#7c3aed"/><Cell fill="#4f46e5"/></Pie><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/></PieChart></ResponsiveContainer>:<div className="empty"><div className="et">No data</div></div>}</div>
        <div className="card"><div className="ct mb16">Breakdown</div>{[{lb:"Fixed",v:fixed,c:"#7c3aed"},{lb:"Variable",v:total-fixed,c:"#4f46e5"},{lb:"Total",v:total,c:"var(--tx)"}].map(r=><div key={r.lb} style={{padding:"14px 0",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:600,color:r.c}}>{r.lb}</div><div style={{fontSize:12,color:"var(--tx3)",marginTop:2}}>{total>0?(r.v/total*100).toFixed(1):0}%</div></div><div className="sy bold" style={{fontSize:20,color:r.c}}>{fmt(r.v)}</div></div>)}</div>
      </div>}

      {/* CATEGORIES + DRILL-DOWN */}
      {tab==="cats"&&(
        <div>
          {!selCat ? (
            <div className="g2">
              <div className="card">
                <div className="ct mb12">Spending by Category <span className="dim" style={{fontSize:11,textTransform:"none",letterSpacing:0}}>(click to drill down)</span></div>
                {!catD.length?<div className="empty"><div className="et">No data</div></div>:(
                  <div>
                    {catD.map((c,i)=>(
                      <div key={i} className="ai" style={{cursor:"pointer"}} onClick={()=>setSelCat(c.name)}>
                        <div className="ar" style={{background:COLORS[i%COLORS.length]+"22",color:COLORS[i%COLORS.length],fontWeight:800}}>{i+1}</div>
                        <div className="ain">
                          <div className="an">{c.name}</div>
                          <div style={{marginTop:4,height:4,background:"var(--sf3)",borderRadius:2,overflow:"hidden",width:"100%"}}>
                            <div style={{height:"100%",width:`${(c.value/catD[0].value)*100}%`,background:COLORS[i%COLORS.length],borderRadius:2}}/>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div className="aa" style={{color:COLORS[i%COLORS.length]}}>{fmt(c.value)}</div>
                          <div style={{fontSize:11,color:"var(--tx3)"}}>{total>0?(c.value/total*100).toFixed(1):0}%</div>
                        </div>
                        <span style={{fontSize:12,color:"var(--tx3)",marginLeft:4}}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <div className="ct mb12">Category Distribution</div>
                {catD.length>0?<ResponsiveContainer width="100%" height={Math.max(280,catD.length*38)}><BarChart data={catD} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#252538" horizontal={false}/><XAxis type="number" tick={{fill:"#8888a8",fontSize:11}} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`}/><YAxis type="category" dataKey="name" tick={{fill:"#8888a8",fontSize:11}} width={130}/><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/><Bar dataKey="value" radius={[0,4,4,0]}>{catD.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>:<div className="empty"><div className="et">No data</div></div>}
              </div>
            </div>
          ) : (
            <div>
              <button className="bk" onClick={()=>setSelCat(null)}>← All Categories</button>
              <div className="ph">
                <div>
                  <div className="pt">{selCat}</div>
                  <div className="ps">Item-wise breakdown · {fmt(catExpTotal)} total</div>
                </div>
                <span className="badge bpu" style={{fontSize:13,padding:"6px 16px"}}>{catD.find(c=>c.name===selCat)?.value>0 ? `${((catD.find(c=>c.name===selCat)?.value||0)/total*100).toFixed(1)}% of all spending`:""}</span>
              </div>
              {!catItems.length ? (
                <div className="card empty"><div className="ei">📦</div><div className="et">No itemized data for this category yet</div></div>
              ) : (
                <div className="card">
                  <div className="fb mb12"><div className="ct">{catItems.length} unique items in {selCat}</div><span className="dim" style={{fontSize:12}}>{items.filter(i=>i.cat===selCat).length} total purchases</span></div>
                  <div className="tw"><table>
                    <thead><tr><th>#</th><th>Item</th><th>Times Ordered</th><th>Avg Price</th><th style={{textAlign:"right"}}>Total Spent</th><th>% of Category</th></tr></thead>
                    <tbody>{catItems.map((item,i)=>(
                      <tr key={i}>
                        <td className="dim">{i+1}</td>
                        <td className="bold">{item.name}</td>
                        <td><span className="badge bgy">{item.count}×</span></td>
                        <td className="muted">{fmt(item.avgPrice)}</td>
                        <td className="tn">{fmt(item.total)}</td>
                        <td>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{flex:1,height:4,background:"var(--sf3)",borderRadius:2,overflow:"hidden",minWidth:60}}>
                              <div style={{height:"100%",width:`${catExpTotal>0?(item.total/catExpTotal*100):0}%`,background:"var(--ac)",borderRadius:2}}/>
                            </div>
                            <span className="dim" style={{fontSize:11,whiteSpace:"nowrap"}}>{catExpTotal>0?(item.total/catExpTotal*100).toFixed(1):0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ITEM-WISE GLOBAL */}
      {tab==="items"&&(
        <div className="card">
          <div className="fb mb16">
            <div className="ct">All Items — Ordered by Total Spend</div>
            <span className="badge bgy">{itemFreq.length} unique items</span>
          </div>
          {!itemFreq.length?<div className="empty"><div className="et">Upload bills to track items</div></div>:(
            <div className="tw"><table>
              <thead><tr><th>#</th><th>Item</th><th>Category</th><th>Times</th><th style={{textAlign:"right"}}>Total</th><th>Avg/order</th><th>AI Fix</th></tr></thead>
              <tbody>{itemFreq.map((item,i)=>(
                <tr key={i}>
                  <td className="dim">{i+1}</td>
                  <td className="bold">{item.name}</td>
                  <td><span className="badge bpu">{item.cat}</span></td>
                  <td><span className="badge bgy">{item.count}×</span></td>
                  <td className="tn">{fmt(item.total)}</td>
                  <td className="muted">{fmt(Math.round(item.total/item.count))}</td>
                  <td>
                    <button className="btn bg bsm" style={{fontSize:10,padding:"3px 8px",color:"var(--ac2)"}} onClick={()=>autoSuggestForItem(item.name)} disabled={suggestLoading===item.name}>
                      {suggestLoading===item.name?"⟳":"🤖 Re-cat"}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {/* FEES & CHARGES */}
      {tab==="fees"&&(
        <div>
          <div className="g2 mb16">
            <div className="card" style={{borderTop:"2px solid var(--rd)"}}>
              <div className="ct">Total Fees Paid</div>
              <div className="cv" style={{color:"var(--rd)"}}>{fmt(feeTotal)}</div>
              <div className="cs">{total>0?`${(feeTotal/total*100).toFixed(1)}% of all spending`:""}</div>
            </div>
            <div className="card" style={{borderTop:"2px solid var(--am)"}}>
              <div className="ct">Fee Transactions</div>
              <div className="cv" style={{color:"var(--am)"}}>{feeItems.length}</div>
              <div className="cs">across {feeByMerchant.length} merchants</div>
            </div>
          </div>

          {feeTotal===0 ? (
            <div className="card empty"><div className="ei">🎉</div><div className="et">No fee data yet. Upload bills with delivery/marketplace fees to track them.</div></div>
          ) : (
            <div className="g2">
              <div className="card">
                <div className="ct mb16">By Fee Type</div>
                {feeByType.map((f,i)=>(
                  <div key={i} className="ai">
                    <div className="ar" style={{background:"#f43f5e18",color:"var(--rd)",fontSize:10}}>₹</div>
                    <div className="ain">
                      <div className="an">{f.type}</div>
                      <div className="am2">{f.count} charges</div>
                      <div style={{marginTop:4,height:3,background:"var(--sf3)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(f.total/feeTotal)*100}%`,background:"var(--rd)",borderRadius:2}}/>
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div className="aa" style={{color:"var(--rd)"}}>{fmt(f.total)}</div>
                      <div style={{fontSize:11,color:"var(--tx3)"}}>{(f.total/feeTotal*100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
                {feeTotal>0&&<div style={{marginTop:16,padding:12,background:"#f43f5e08",border:"1px solid #f43f5e20",borderRadius:8,fontSize:12,color:"var(--tx3)"}}>
                  💡 You paid <strong style={{color:"var(--rd)"}}>{fmt(feeTotal)}</strong> in fees. Prefer platforms with zero-fee delivery (Amazon Prime, BigBasket Smart) to save this.
                </div>}
              </div>
              <div className="card">
                <div className="ct mb16">By Merchant</div>
                {feeByMerchant.length>0?feeByMerchant.map((m,i)=>(
                  <div key={i} className="ai">
                    <div className="ar">{i+1}</div>
                    <div className="ain">
                      <div className="an">{m.merchant}</div>
                      <div className="am2">{m.count} fee charges</div>
                    </div>
                    <div className="aa" style={{color:"var(--am)"}}>{fmt(m.total)}</div>
                  </div>
                )):<div className="empty"><div className="et">No merchant fee data</div></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* WASTEFUL */}
      {tab==="waste"&&<div className="card"><div className="ct mb16">Wasteful Spending</div>{!discG.length?<div className="empty"><div className="et">No wasteful patterns 🎉</div></div>:discG.map((g,i)=><div key={i} className="ai"><div className="ar">{i+1}</div><div className="ain"><div className="an">{g.name}</div><div className="am2">{g.count} occurrences</div></div><div><div className="aa" style={{color:"var(--rd)"}}>{fmt(g.total)}</div><div style={{fontSize:11,color:"var(--tx3)",textAlign:"right"}}>avg {fmt(Math.round(g.total/g.count))}</div></div></div>)}</div>}

      {/* FIZUL KHARCHI */}
      {tab==="fizul"&&<div className="g2">
        <div className="card">{total>0?<ResponsiveContainer width="100%" height={240}><PieChart><Pie data={[{name:"Essential",value:ess},{name:"Discretionary",value:disc}]} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={{stroke:"#505068"}}><Cell fill="#10b981"/><Cell fill="#f43f5e"/></Pie><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/></PieChart></ResponsiveContainer>:<div className="empty"><div className="et">No data</div></div>}</div>
        <div className="card"><div className="ct mb16">Fizul Kharchi</div>{[{lb:"Essential ✓",v:ess,c:"var(--gr)"},{lb:"Discretionary ⚠",v:disc,c:"var(--rd)"}].map(r=><div key={r.lb} style={{padding:"16px 0",borderBottom:"1px solid var(--bd)"}}><div className="fb"><span className="muted">{r.lb}</span><span className="sy bold" style={{fontSize:20,color:r.c}}>{fmt(r.v)}</span></div><div className="pb mt8"><div className="pbf" style={{width:total>0?`${r.v/total*100}%`:"0%",background:r.c}}/></div><div style={{marginTop:4,fontSize:12,color:"var(--tx3)"}}>{total>0?(r.v/total*100).toFixed(1):0}%</div></div>)}{disc>0&&<div style={{marginTop:16,padding:12,background:"#f43f5e10",border:"1px solid #f43f5e30",borderRadius:8,fontSize:13,color:"var(--rd)"}}>💡 Save ₹{Math.round(disc*0.3).toLocaleString("en-IN")}/mo by cutting 30% discretionary</div>}</div>
      </div>}

      {/* RECURRING */}
      {tab==="rec"&&<div className="card"><div className="ct mb16">Recurring Expenses</div>{!recG.length?<div className="empty"><div className="et">Mark expenses as recurring to track here</div></div>:recG.map((g,i)=><div key={i} className="ai"><div className="ar">🔄</div><div className="ain"><div className="an">{g.name}</div><div className="am2">{g.count} times</div></div><div className="aa">{fmt(g.total)}</div></div>)}</div>}

      {/* MERCHANT ANALYSIS */}
      {tab==="merchant"&&(
        <div>
          {!selMerchant?(
            <div>
              <div className="g2 mb16">
                <div className="card" style={{borderTop:"2px solid var(--ac2)"}}>
                  <div className="ct">Unique Merchants</div>
                  <div className="cv" style={{color:"var(--ac2)"}}>{merchantD.length}</div>
                  <div className="cs">stores and platforms</div>
                </div>
                <div className="card" style={{borderTop:"2px solid var(--gr)"}}>
                  <div className="ct">Top Merchant</div>
                  <div className="cv" style={{color:"var(--gr)",fontSize:18}}>{merchantD[0]?.merchant||"—"}</div>
                  <div className="cs">{merchantD[0]?fmt(merchantD[0].total):"no data yet"}</div>
                </div>
              </div>
              <div className="g2">
                <div className="card">
                  <div className="ct mb12">All Merchants <span className="dim" style={{fontSize:11,textTransform:"none",letterSpacing:0}}>(click to drill down)</span></div>
                  {!merchantD.length?<div className="empty"><div className="et">No merchant data yet</div></div>:(
                    <div>{merchantD.map((m,i)=>(
                      <div key={i} className="ai" style={{cursor:"pointer"}} onClick={()=>setSelMerchant(m.merchant)}>
                        <div className="ar" style={{background:COLORS[i%COLORS.length]+"22",color:COLORS[i%COLORS.length],fontWeight:800,fontSize:11}}>{i+1}</div>
                        <div className="ain">
                          <div className="an">{m.merchant}</div>
                          <div style={{fontSize:11,color:"var(--tx3)",marginTop:1}}>{m.count} orders &nbsp;·&nbsp; {m.cats.slice(0,3).map(c=><span key={c} className="badge bgy" style={{marginRight:3,fontSize:9,padding:"1px 5px"}}>{c}</span>)}</div>
                          <div style={{marginTop:5,height:3,background:"var(--sf3)",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:merchantD[0].total>0?`${(m.total/merchantD[0].total)*100}%`:"0%",background:COLORS[i%COLORS.length],borderRadius:2}}/>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div className="aa" style={{color:COLORS[i%COLORS.length]}}>{fmt(m.total)}</div>
                          <div style={{fontSize:11,color:"var(--tx3)"}}>{total>0?(m.total/total*100).toFixed(1):0}%</div>
                        </div>
                        <span style={{fontSize:13,color:"var(--tx3)",marginLeft:6}}>›</span>
                      </div>
                    ))}</div>
                  )}
                </div>
                <div className="card">
                  <div className="ct mb12">Spend Distribution</div>
                  {merchantD.length>0
                    ?<ResponsiveContainer width="100%" height={Math.max(280,merchantD.length*40)}><BarChart data={merchantD.map(m=>({name:m.merchant,value:m.total}))} layout="vertical" margin={{left:10}}><CartesianGrid strokeDasharray="3 3" stroke="#252538" horizontal={false}/><XAxis type="number" tick={{fill:"#8888a8",fontSize:11}} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`}/><YAxis type="category" dataKey="name" tick={{fill:"#8888a8",fontSize:11}} width={100}/><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/><Bar dataKey="value" radius={[0,4,4,0]}>{merchantD.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>
                    :<div className="empty"><div className="et">No data</div></div>}
                </div>
              </div>
            </div>
          ):(()=>{
            const mData=merchantD.find(m=>m.merchant===selMerchant);
            if(!mData) return null;
            const mExps=exp.filter(e=>(e.merchant||e.desc||"Unknown")===selMerchant).sort((a,b)=>new Date(b.date)-new Date(a.date));
            const mItemsRaw=items.filter(i=>{const e=exp.find(ex=>ex.id===i.eid);return(e?.merchant||e?.desc||"Unknown")===selMerchant;});
            const mItemsAgg=Object.values(mItemsRaw.reduce((a,i)=>{const k=i.name.toLowerCase();if(!a[k])a[k]={name:i.name,count:0,total:0,cat:i.cat};a[k].count++;a[k].total+=i.price;return a;},{})).sort((a,b)=>b.total-a.total);
            const mCats=Object.entries(mExps.reduce((a,e)=>{a[e.cat]=(a[e.cat]||0)+e.amount;return a;},{})).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
            const mFees=mItemsRaw.filter(i=>i.cat==="Fees & Charges").reduce((s,i)=>s+i.price,0);
            const firstDate=mExps.length>0?new Date(mExps[mExps.length-1].date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
            const lastDate=mExps.length>0?new Date(mExps[0].date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
            return (
              <div>
                <button className="bk" onClick={()=>setSelMerchant(null)}>← All Merchants</button>
                <div className="ph">
                  <div><div className="pt">{selMerchant}</div><div className="ps">First order: {firstDate} &nbsp;·&nbsp; Last: {lastDate}</div></div>
                  <div style={{textAlign:"right"}}>
                    <div className="sy bold" style={{fontSize:24,color:"var(--ac2)"}}>{fmt(mData.total)}</div>
                    <div style={{fontSize:12,color:"var(--tx3)"}}>{total>0?(mData.total/total*100).toFixed(1):0}% of all spending</div>
                  </div>
                </div>
                <div className="g4 mb16">
                  {[
                    {lb:"Total Spent",   v:fmt(mData.total),                        c:"var(--ac2)"},
                    {lb:"Orders",        v:mData.count,                             c:"var(--tx)"},
                    {lb:"Avg per Order", v:fmt(Math.round(mData.total/mData.count)),c:"var(--am)"},
                    {lb:"Fees Paid",     v:fmt(mFees),                              c:"var(--rd)"},
                  ].map((s,i)=>(
                    <div key={i} className="card" style={{borderTop:`2px solid ${s.c}`}}>
                      <div className="ct">{s.lb}</div>
                      <div className="sy bold mt4" style={{fontSize:18,color:s.c}}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div className="g2 mb16">
                  <div className="card">
                    <div className="ct mb12">Categories at {selMerchant}</div>
                    {mCats.map((c,i)=>(
                      <div key={i} className="ai">
                        <div className="ar" style={{background:COLORS[i%COLORS.length]+"22",color:COLORS[i%COLORS.length]}}>{i+1}</div>
                        <div className="ain">
                          <div className="an">{c.name}</div>
                          <div style={{marginTop:4,height:3,background:"var(--sf3)",borderRadius:2,overflow:"hidden"}}>
                            <div style={{height:"100%",width:mData.total>0?`${(c.value/mData.total)*100}%`:"0%",background:COLORS[i%COLORS.length],borderRadius:2}}/>
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div className="aa" style={{color:COLORS[i%COLORS.length]}}>{fmt(c.value)}</div>
                          <div style={{fontSize:11,color:"var(--tx3)"}}>{(c.value/mData.total*100).toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <div className="ct mb12">Items at {selMerchant}</div>
                    {!mItemsAgg.length
                      ?<div className="empty"><div className="et">No itemised data</div></div>
                      :<div className="tw"><table>
                        <thead><tr><th>#</th><th>Item</th><th>Cat</th><th>×</th><th style={{textAlign:"right"}}>Total</th></tr></thead>
                        <tbody>{mItemsAgg.map((item,i)=>(
                          <tr key={i}>
                            <td className="dim">{i+1}</td>
                            <td className="bold" style={{fontSize:12}}>{item.name}</td>
                            <td><span className="badge bpu" style={{fontSize:9}}>{item.cat}</span></td>
                            <td><span className="badge bgy">{item.count}×</span></td>
                            <td className="tn">{fmt(item.total)}</td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    }
                  </div>
                </div>
                <div className="card">
                  <div className="ct mb12">Full Order History</div>
                  <div className="tw"><table>
                    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                    <tbody>{mExps.map(e=>(
                      <tr key={e.id}>
                        <td className="dim" style={{whiteSpace:"nowrap"}}>{new Date(e.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"2-digit"})}</td>
                        <td><span className="badge bpu">{e.cat}</span></td>
                        <td className="muted">{e.desc||"—"}</td>
                        <td className="tn">{fmt(e.amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* CATEGORY MANAGER */}
      {tab==="catmgr"&&(
        <div style={{maxWidth:620}}>
          <div className="card mb16">
            <div className="ct mb12">Add New Category</div>
            <div className="fc g8">
              <input className="fi" placeholder="e.g. Pet Care, Gaming, Home Decor…" value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()} style={{flex:1}}/>
              <button className="btn bp bsm" onClick={addCategory}>＋ Add</button>
            </div>
            <div style={{fontSize:11,color:"var(--tx3)",marginTop:8}}>💡 New categories will be available in all dropdowns and the OCR auto-categoriser immediately.</div>
          </div>

          <div className="card">
            <div className="fb mb16">
              <div className="ct">All Categories</div>
              <span className="badge bgy">{allCats.length} categories</span>
            </div>
            {allCats.map(cat=>{
              const count = exp.filter(e=>e.cat===cat).length;
              const total = exp.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0);
              const isRenaming = renamingCat?.old===cat;
              return (
                <div key={cat} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--bd)"}}>
                  <div style={{flex:1}}>
                    {isRenaming ? (
                      <div className="fc g8">
                        <input className="fi" style={{flex:1,padding:"5px 10px",fontSize:13}} value={renamingCat.val} onChange={e=>setRenamingCat({...renamingCat,val:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")renameCategory(cat,renamingCat.val);if(e.key==="Escape")setRenamingCat(null);}} autoFocus/>
                        <button className="btn bp bsm" onClick={()=>renameCategory(cat,renamingCat.val)}>Save</button>
                        <button className="btn bg bsm" onClick={()=>setRenamingCat(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="fc g8">
                        <span className="badge bpu">{cat}</span>
                        <span style={{fontSize:11,color:"var(--tx3)"}}>{count} expenses · {fmt(total)}</span>
                      </div>
                    )}
                  </div>
                  {!isRenaming&&(
                    <div className="fc g8">
                      <button className="btn bg bsm" style={{fontSize:11}} onClick={()=>setRenamingCat({old:cat,val:cat})}>✏ Rename</button>
                      {count===0&&<button className="btn bdr bsm" style={{fontSize:11}} onClick={()=>deleteCategory(cat)}>✕</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRENDS ────────────────────────────────────────────────────────────────────
function Trends({ exp, items }) {
  const curY=new Date().getFullYear();
  const [year,setYear]=useState(curY), [catF,setCatF]=useState(""), [itemF,setItemF]=useState("");
  const allYears=[...new Set([curY,...exp.map(e=>new Date(e.date).getFullYear())])].sort((a,b)=>b-a);
  const allCats=[...new Set(exp.map(e=>e.cat))];
  let filt=exp.filter(e=>new Date(e.date).getFullYear()===year);
  if(catF) filt=filt.filter(e=>e.cat===catF);
  if(itemF){const ids=new Set(items.filter(i=>i.name.toLowerCase().includes(itemF.toLowerCase())).map(i=>i.eid));filt=filt.filter(e=>ids.has(e.id));}
  const monthly=MONTHS.map((m,idx)=>{const me=filt.filter(e=>new Date(e.date).getMonth()===idx);return{month:m,total:me.reduce((s,e)=>s+e.amount,0),count:me.length};});
  const mwc=monthly.map((m,i)=>{if(i===0||monthly[i-1].total===0)return{...m,change:null,trend:"flat"};const p=((m.total-monthly[i-1].total)/monthly[i-1].total)*100;return{...m,change:p,trend:p>5?"up":p<-5?"down":"flat"};});
  const tTotal=monthly.reduce((s,m)=>s+m.total,0), nz=monthly.filter(m=>m.total>0);
  const avg=nz.length>0?tTotal/nz.length:0, high=[...monthly].sort((a,b)=>b.total-a.total)[0], low=nz.length>0?[...nz].sort((a,b)=>a.total-b.total)[0]:null;
  const topItems=Object.values(items.filter(i=>{const e=exp.find(e=>e.id===i.eid);return e&&new Date(e.date).getFullYear()===year;}).reduce((a,i)=>{const k=i.name.toLowerCase();if(!a[k])a[k]={name:i.name,count:0,total:0};a[k].count++;a[k].total+=i.price;return a;},{})).sort((a,b)=>b.count-a.count).slice(0,5);
  return (
    <div>
      <div className="ph"><div><div className="pt">Month-on-Month Trends</div><div className="ps">Track spending over time</div></div></div>
      <div className="fc g8 mb20" style={{flexWrap:"wrap"}}>
        <select className="fi" style={{width:"auto"}} value={year} onChange={e=>setYear(parseInt(e.target.value))}>{allYears.map(y=><option key={y} value={y}>{y}</option>)}</select>
        <select className="fi" style={{width:"auto"}} value={catF} onChange={e=>setCatF(e.target.value)}><option value="">All Categories</option>{allCats.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input className="fi" style={{width:200}} placeholder="Filter by item…" value={itemF} onChange={e=>setItemF(e.target.value)}/>
      </div>
      <div className="g4 mb20">
        {[{lb:"Total Spent",v:fmt(tTotal),c:"var(--ac2)"},{lb:"Monthly Avg",v:fmt(Math.round(avg)),c:"var(--tx)"},{lb:"Highest",v:high?.total>0?`${high.month} · ${fmt(high.total)}`:"—",c:"var(--rd)"},{lb:"Lowest",v:low?`${low.month} · ${fmt(low.total)}`:"—",c:"var(--gr)"}].map((c,i)=>(
          <div key={i} className="card"><div className="ct">{c.lb}</div><div className="sy bold mt4" style={{fontSize:16,color:c.c}}>{c.v}</div></div>
        ))}
      </div>
      <div className="card mb20">
        <div className="ct mb16">Monthly Spending — {year}</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={mwc}><CartesianGrid strokeDasharray="3 3" stroke="#252538"/><XAxis dataKey="month" tick={{fill:"#8888a8",fontSize:12}}/><YAxis tick={{fill:"#8888a8",fontSize:11}} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`}/><Tooltip contentStyle={TT} formatter={v=>fmt(v)}/><Line type="monotone" dataKey="total" stroke="#7c3aed" strokeWidth={2.5} dot={{fill:"#7c3aed",r:4}} activeDot={{r:6,fill:"#a78bfa"}}/></LineChart>
        </ResponsiveContainer>
      </div>
      <div className="gm mb20">
        {mwc.map((m,i)=>(
          <div key={i} className="mc">
            <div className="ml">{m.month}</div>
            <div className="ma">{m.total>0?(m.total>=1000?(m.total/1000).toFixed(1)+"k":m.total):"—"}</div>
            {m.change!==null&&<div className={m.trend==="up"?"tu":m.trend==="down"?"td2":"tf"}>{m.trend==="up"?"🔺":m.trend==="down"?"🔻":"➖"} {Math.abs(m.change).toFixed(0)}%</div>}
            <div className="mn">{m.count} entries</div>
          </div>
        ))}
      </div>
      {topItems.length>0&&<div className="card"><div className="ct mb16">Top Items in {year}</div>{topItems.map((item,i)=><div key={i} className="ai"><div className="ar">{i+1}</div><div className="ain"><div className="an">{item.name}</div><div className="am2">{item.count} times</div></div><div className="aa">{fmt(item.total)}</div></div>)}</div>}
    </div>
  );
}
