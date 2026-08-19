const { useState, useEffect, useMemo, useRef } = React;

/* ===== PARÂMETROS DE BULA (meia-vida, Tmax) ===== */
const MEDS = {
  Semaglutida: { halfLifeH: 168, tmaxH: 48, intervalDays: 7, doses: [0.25, 0.5, 1.0, 1.7, 2.4], vias: ["GLP-1"], marcas: "Ozempic, Wegovy", fonte: "Bula FDA/EMA — meia-vida ~7 dias; Tmax 1–3 dias; equilíbrio em 4–5 semanas." },
  Tirzepatida: { halfLifeH: 120, tmaxH: 24, intervalDays: 7, doses: [2.5, 5, 7.5, 10, 12.5, 15], vias: ["GLP-1", "GIP"], marcas: "Mounjaro, Zepbound", fonte: "Bula FDA — meia-vida ~5 dias; Tmax mediano 24 h (8–72 h); equilíbrio em 4 semanas; acúmulo ~1,6×." },
  Liraglutida: { halfLifeH: 13, tmaxH: 10, intervalDays: 1, doses: [0.6, 1.2, 1.8, 2.4, 3.0], vias: ["GLP-1"], marcas: "Saxenda, Victoza", fonte: "Bula FDA/EMA — meia-vida ~13 h; Tmax 8–12 h; administração diária." },
  Retatrutida: { halfLifeH: null, tmaxH: null, intervalDays: 7, doses: [], vias: ["GLP-1", "GIP", "Glucagon"], marcas: "—", investigacional: true, fonte: "Fármaco em investigação. Sem bula comercial publicada — nenhuma curva é exibida." },
};
const VIAS = {
  "GLP-1": { color: "#16C784", nome: "Receptor GLP-1", efeito: "Aumenta a saciedade, retarda o esvaziamento gástrico e potencializa a secreção de insulina glicose-dependente." },
  GIP: { color: "#8B5CF6", nome: "Receptor GIP", efeito: "Potencializa a resposta insulinotrópica e atua no metabolismo lipídico — a segunda via da tirzepatida." },
  Glucagon: { color: "#F0803B", nome: "Receptor Glucagon", efeito: "Associado a aumento do gasto energético e ao metabolismo hepático de lipídios — a terceira via da retatrutida." },
};
const SITES = ["Abdômen – superior", "Abdômen – inferior", "Coxa esquerda", "Coxa direita", "Braço esquerdo", "Braço direito"];
const dayMs = 86400000, LN2 = Math.log(2);

/* ===== Bateman ===== */
function solveKa(tmaxH, ke) { const f = (ka) => Math.log(ka / ke) / (ka - ke) - tmaxH; let lo = ke * 1.000001, hi = 5; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; }
const PK = {};
for (const [n, m] of Object.entries(MEDS)) { if (m.investigacional) continue; const ke = LN2 / m.halfLifeH; const ka = solveKa(m.tmaxH, ke); const peak = (ka / (ka - ke)) * (Math.exp(-ke * m.tmaxH) - Math.exp(-ka * m.tmaxH)); PK[n] = { ke, ka, peak }; }
function bateman(med, tH, doseMg) { if (tH < 0 || MEDS[med].investigacional) return 0; const { ke, ka, peak } = PK[med]; return ((ka / (ka - ke)) * (Math.exp(-ke * tH) - Math.exp(-ka * tH)) / peak) * doseMg; }
const ssCache = {};
function steadyStatePeak(med, doseMg) { const k = med + doseMg; if (ssCache[k]) return ssCache[k]; const iv = MEDS[med].intervalDays * 24; let best = 0; for (let t = 0; t <= iv; t += 1) { let s = 0; for (let n = 0; n < 60; n++) s += bateman(med, t + n * iv, doseMg); if (s > best) best = s; } ssCache[k] = best || 1; return ssCache[k]; }

const fmt = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
const fmtLong = (d) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
function bmiClass(b) { if (b < 18.5) return { faixa: "Abaixo do peso", color: "#3B82F6" }; if (b < 25) return { faixa: "Peso adequado", color: "#16C784" }; if (b < 30) return { faixa: "Sobrepeso", color: "#F5A623" }; if (b < 35) return { faixa: "Obesidade grau I", color: "#F0803B" }; if (b < 40) return { faixa: "Obesidade grau II", color: "#F0553B" }; return { faixa: "Obesidade grau III", color: "#D6336C" }; }
const actColor = (p) => (p >= 0.8 ? "#16C784" : p >= 0.6 ? "#3B82F6" : p >= 0.4 ? "#F5A623" : "#F0553B");
const actLabel = (p) => (p >= 0.8 ? "Atividade alta" : p >= 0.6 ? "Atividade boa" : p >= 0.4 ? "Atividade moderada" : "Atividade em declínio");
const polar = (cx, cy, r, d) => { const a = ((d - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
const arcPath = (cx, cy, r, a0, a1) => { const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1); return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
const selectable = Object.keys(MEDS).filter((m) => !MEDS[m].investigacional);

/* ===== localStorage ===== */
const K = { profile: "cglp:profile", doses: "cglp:doses", weights: "cglp:weights", remind: "cglp:remind", consent: "cglp:consent" };
const load = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ===== detecção de plataforma / instalação ===== */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/* ===== agendar lembretes locais via service worker ===== */
async function agendarLembretes(nextDate, med, doseMg, vespera) {
  if (!("Notification" in window)) return "unsupported";
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reminders = [];
  const dia = new Date(nextDate); dia.setHours(9, 0, 0, 0);
  if (dia.getTime() > Date.now()) reminders.push({ at: dia.getTime(), body: `Lembrete: aplicação de ${med} ${doseMg} mg prevista para hoje.` });
  if (vespera) { const v = new Date(nextDate.getTime() - dayMs); v.setHours(18, 0, 0, 0); if (v.getTime() > Date.now()) reminders.push({ at: v.getTime(), body: `Sua próxima aplicação de ${med} está prevista para amanhã.` }); }
  const reg = await navigator.serviceWorker.ready;
  reg.active && reg.active.postMessage({ type: "schedule", reminders });
  return "ok";
}

/* ===== SVG line ===== */
function Line({ points, color, w = 320, h = 150, fill = false, dots = true, pct = false }) {
  if (!points.length) return null;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), span = Math.max(...ys) - Math.min(...ys);
  const yLo = pct ? 0 : Math.min(...ys) - span * 0.15 - 0.5, yHi = pct ? 100 : Math.max(...ys) + span * 0.15 + 0.5;
  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (w - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - (y - yLo) / (yHi - yLo || 1)) * (h - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
  const area = `${d} L ${sx(xMax)} ${h - pad.b} L ${sx(xMin)} ${h - pad.b} Z`;
  const ticks = pct ? [0, 50, 100] : [yLo, (yLo + yHi) / 2, yHi];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {ticks.map((t, i) => <text key={i} x={4} y={sy(t) + 3} fontSize="9" fill="#9AAFA7">{pct ? `${t}%` : t.toFixed(0)}</text>)}
      {fill && <path d={area} fill={color} fillOpacity="0.15" />}
      <path d={d} stroke={color} strokeWidth="3" fill="none" />
      {dots && points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="3" fill={color} />)}
      <text x={pad.l} y={h - 4} fontSize="9" fill="#9AAFA7">{points[0].label}</text>
      <text x={w - pad.r} y={h - 4} fontSize="9" fill="#9AAFA7" textAnchor="end">{points[points.length - 1].label}</text>
    </svg>
  );
}

/* ===== Anel ===== */
function WeekRing({ doses }) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const last = doses[doses.length - 1], med = last.med, iv = MEDS[med].intervalDays, cycleH = iv * 24, gip = MEDS[med].vias.includes("GIP"), t0 = last.date.getTime();
  const rel = (t) => doses.reduce((a, d) => a + bateman(d.med, (t - d.date.getTime()) / 3600000, d.doseMg), 0);
  const ssPeak = steadyStatePeak(med, last.doseMg);
  const segs = Array.from({ length: 7 }, (_, i) => { const p = Math.min(1, rel(t0 + ((i + 0.5) * cycleH / 7) * 3600000) / ssPeak); return { p, color: actColor(p) }; });
  const nowPct = Math.min(1, rel(today.getTime()) / ssPeak);
  const dayInCycle = Math.min(6, Math.max(0, Math.floor(((today.getTime() - t0) / 3600000) / (cycleH / 7))));
  const peakSeg = segs.reduce((bi, sg, i, a) => (sg.p > a[bi].p ? i : bi), 0);
  const color = actColor(nowPct), size = 220, cx = 110, cy = 110, r = 88, gap = 6, span = 360 / 7 - gap;
  return (
    <div style={cardStyle("linear-gradient(160deg,#FFFFFF,#F0FBF5)")}>
      <Row><Label>⚡ Curva de referência no ciclo</Label><Pill bg={color + "22"} c={color}>{iv === 1 ? "Ciclo diário" : `Dia ${dayInCycle + 1} de 7`}</Pill></Row>
      <div style={{ textAlign: "center" }}>
        <svg width={size} height={size}>
          {segs.map((seg, i) => {
            const a0 = i * (360 / 7) + gap / 2, hoje = i === dayInCycle;
            const [tx, ty] = polar(cx, cy, r + 22, a0 + span / 2);
            return (<g key={i}>
              <path d={arcPath(cx, cy, r, a0, a0 + span)} stroke="#E6EFE9" strokeWidth="14" fill="none" strokeLinecap="round" />
              <path d={arcPath(cx, cy, r, a0, a0 + span * Math.max(0.06, seg.p))} stroke={seg.color} strokeWidth={hoje ? 16 : 12} fill="none" strokeLinecap="round" opacity={hoje ? 1 : 0.85} />
              {hoje && gip && <path d={arcPath(cx, cy, r + 11, a0, a0 + span * Math.max(0.06, seg.p))} stroke="#8B5CF6" strokeWidth="3" fill="none" strokeLinecap="round" />}
              <text x={tx} y={ty + 3} fontSize="10" fontWeight={hoje ? 700 : 500} fill={hoje ? seg.color : "#93A8A0"} textAnchor="middle">D{i + 1}</text>
            </g>);
          })}
          <text x={cx} y={cy - 6} fontSize="30" fontWeight="700" fill={color} textAnchor="middle" fontFamily="Space Grotesk">{Math.round(nowPct * 100)}%</text>
          <text x={cx} y={cy + 14} fontSize="11" fontWeight="600" fill="#41564F" textAnchor="middle">{actLabel(nowPct)}</text>
          <text x={cx} y={cy + 30} fontSize="9" fill="#93A8A0" textAnchor="middle">do pico de referência</text>
        </svg>
      </div>
      <Row style={{ marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#7A928A" }}>▲ Pico: dia {peakSeg + 1}</span>
        <span style={{ fontSize: 10, color: "#7A928A" }}>▼ Vale: antes da próxima</span>
      </Row>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {[["#16C784", "≥80%"], ["#3B82F6", "60–79%"], ["#F5A623", "40–59%"], ["#F0553B", "<40%"]].map(([c, l]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#5E7A72" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />{l}</span>
        ))}
      </div>
      {gip && <p style={{ fontSize: 10, color: "#7C3AED", marginTop: 6 }}>◗ contorno roxo = via GIP (tirzepatida)</p>}
    </div>
  );
}

/* ===== helpers de estilo ===== */
const cardStyle = (bg) => ({ background: bg || "#fff", borderRadius: 24, padding: 18, marginBottom: 16, boxShadow: "0 6px 18px rgba(22,48,43,.06)" });
const Row = ({ children, style }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...style }}>{children}</div>;
const Label = ({ children }) => <p style={{ fontSize: 12, fontWeight: 600, color: "#5E7A72", marginBottom: 4 }}>{children}</p>;
const Pill = ({ children, bg, c }) => <span style={{ padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: c }}>{children}</span>;
const btnPrimary = { width: "100%", padding: "14px", borderRadius: 999, border: "none", fontWeight: 700, fontSize: 14, color: "#fff", background: "linear-gradient(120deg,#16C784,#1273D6)" };
const inp = { width: "100%", borderRadius: 12, border: "1px solid #E2E8E4", padding: "10px 12px", fontSize: 14 };

/* ===== Consentimento ===== */
function Consent({ onAccept }) {
  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1 className="display" style={{ fontSize: 26 }}>Ciclo GLP</h1>
      <p style={{ color: "#5E7A72", fontSize: 13, margin: "6px 0 20px" }}>Antes de começar, leia com atenção.</p>
      {[["Este app não é um dispositivo médico", "Não diagnostica, trata, cura nem previne qualquer condição. Não substitui consultas, exames ou a orientação do seu médico."],
        ["A curva é uma referência de bula", "O gráfico representa o comportamento médio descrito pelo fabricante nos parâmetros públicos da bula. Não é medida em você nem estima sua concentração individual."],
        ["Nunca ajuste sua dose por conta própria", "A dose e a duração são decididas pelo seu médico. O app apenas registra o que você informa."],
        ["Seus dados ficam no seu aparelho", "Nada é enviado, coletado ou compartilhado. Sem servidor, cadastro ou login. Ao limpar o navegador ou remover o app, os dados são apagados."]
      ].map(([t, d]) => (
        <div key={t} style={{ marginBottom: 16 }}><p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t}</p><p style={{ fontSize: 13, color: "#41564F", lineHeight: 1.5 }}>{d}</p></div>
      ))}
      <button style={btnPrimary} onClick={onAccept}>Li e concordo</button>
    </div>
  );
}

/* ===== Banner de instalação (iOS não tem prompt automático) ===== */
function InstallBanner({ onClose }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#123B33", color: "#fff", padding: "16px 20px calc(16px + env(safe-area-inset-bottom))", zIndex: 60 }}>
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
          {isIOS
            ? <>Para instalar: toque em <b>Compartilhar</b> <span style={{fontSize:15}}>􀈂</span> e depois em <b>Adicionar à Tela de Início</b>. Os lembretes só funcionam depois disso.</>
            : <>Instale o Ciclo GLP na tela inicial para lembretes e acesso rápido.</>}
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>OK</button>
      </div>
    </div>
  );
}

/* ===== Modais ===== */
function Sheet({ children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,59,51,.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px calc(34px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto" }}>{children}</div>
    </div>
  );
}
const Chips = ({ items, val, onPick, fmt }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {items.map((it) => { const on = val === it; return <button key={it} onClick={() => onPick(it)} style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: on ? "1px solid #0E7C5A" : "1px solid #D7E3DD", background: on ? "#0E7C5A" : "#fff", color: on ? "#fff" : "#41564F" }}>{fmt ? fmt(it) : it}</button>; })}
  </div>
);

function ProfileForm({ initial, onSave, onClose, first }) {
  const [p, setP] = useState(initial);
  const bmi = p.weightKg && p.heightCm ? +p.weightKg / Math.pow(+p.heightCm / 100, 2) : null;
  const diario = MEDS[p.med].intervalDays === 1;
  const ok = p.age && p.weightKg && p.heightCm && (diario || p.diaSemana !== undefined && p.diaSemana !== "");
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const body = (
    <>
      <Row><h2 className="display" style={{ fontSize: 20, fontWeight: 700 }}>{first ? "Seu tratamento" : "Editar perfil"}</h2>{!first && <button onClick={onClose} style={{ border: "none", background: "#E4F0E9", borderRadius: 999, width: 32, height: 32 }}>✕</button>}</Row>
      <p style={{ fontSize: 12, color: "#5E7A72", margin: "6px 0 16px" }}>Informe o que foi prescrito pelo seu médico. Pode alterar depois.</p>
      <Label>Princípio ativo</Label>
      <Chips items={selectable} val={p.med} onPick={(m) => setP({ ...p, med: m, doseMg: MEDS[m].doses[0] })} />
      <p style={{ fontSize: 10, color: "#9AAFA7", margin: "6px 0 14px" }}>Referência comercial: {MEDS[p.med].marcas}</p>
      <Label>Dose prescrita</Label>
      <Chips items={MEDS[p.med].doses} val={+p.doseMg} onPick={(d) => setP({ ...p, doseMg: d })} fmt={(d) => d + " mg"} />
      <p style={{ fontSize: 10, color: "#9AAFA7", margin: "6px 0 14px" }}>A dose é definida pelo seu médico. O app apenas registra.</p>

      {!diario && (
        <>
          <Label>Dia da aplicação</Label>
          <Chips items={[0, 1, 2, 3, 4, 5, 6]} val={p.diaSemana} onPick={(d) => setP({ ...p, diaSemana: d })} fmt={(d) => DIAS[d].slice(0, 3)} />
          <p style={{ fontSize: 10, color: "#9AAFA7", margin: "6px 0 14px" }}>O dia da semana em que você costuma aplicar.</p>
        </>
      )}

      <Label>Horário da aplicação</Label>
      <input style={{ ...inp, marginBottom: 4 }} type="time" value={p.horario} onChange={(e) => setP({ ...p, horario: e.target.value })} />
      <p style={{ fontSize: 10, color: "#9AAFA7", margin: "6px 0 14px" }}>{diario ? "O horário em que você aplica todos os dias." : "Ajuda a posicionar a curva com precisão."}</p>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}><Label>Idade</Label><input style={inp} type="number" inputMode="numeric" value={p.age} onChange={(e) => setP({ ...p, age: e.target.value })} placeholder="anos" /></div>
        <div style={{ flex: 1 }}><Label>Sexo</Label>
          <select style={inp} value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value })}><option value="F">Feminino</option><option value="M">Masculino</option><option value="O">Prefiro não dizer</option></select></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1 }}><Label>Peso (kg)</Label><input style={inp} type="number" inputMode="decimal" value={p.weightKg} onChange={(e) => setP({ ...p, weightKg: e.target.value })} placeholder="kg" /></div>
        <div style={{ flex: 1 }}><Label>Altura (cm)</Label><input style={inp} type="number" inputMode="numeric" value={p.heightCm} onChange={(e) => setP({ ...p, heightCm: e.target.value })} placeholder="cm" /></div>
      </div>
      {bmi && <div style={{ background: bmiClass(bmi).color + "18", borderRadius: 14, padding: 12, margin: "14px 0", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 600 }}>IMC</span><span style={{ fontWeight: 700, color: bmiClass(bmi).color }}>{bmi.toFixed(1)} · {bmiClass(bmi).faixa}</span></div>}
      <button style={{ ...btnPrimary, opacity: ok ? 1 : 0.4, marginTop: 8 }} disabled={!ok} onClick={() => onSave({ ...p, age: +p.age, weightKg: +p.weightKg, heightCm: +p.heightCm, doseMg: +p.doseMg })}>{first ? "Começar" : "Salvar alterações"}</button>
    </>
  );
  if (first) return <div style={{ maxWidth: 480, margin: "0 auto", padding: 20 }}>{body}</div>;
  return <Sheet onClose={onClose}>{body}</Sheet>;
}

/* ===== App ===== */
function App() {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [profile, setProfile] = useState(null);
  const [doses, setDoses] = useState([]);
  const [weights, setWeights] = useState([]);
  const [editing, setEditing] = useState(false);
  const [dForm, setDForm] = useState(null);
  const [wForm, setWForm] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const [remind, setRemind] = useState({ on: true, vespera: true });
  const [status, setStatus] = useState("");
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    setConsent(!!load(K.consent));
    const p = load(K.profile);
    if (p) { setProfile(p); setDoses((load(K.doses) || []).map((x) => ({ ...x, date: new Date(x.date) }))); setWeights((load(K.weights) || []).map((x) => ({ ...x, date: new Date(x.date) }))); }
    const rm = load(K.remind); if (rm) setRemind(rm);
    setReady(true);
    if (!isStandalone) setTimeout(() => setBanner(true), 1200);
  }, []);
  useEffect(() => { if (profile) save(K.profile, profile); }, [profile]);
  useEffect(() => { if (profile) save(K.doses, doses); }, [doses, profile]);
  useEffect(() => { if (profile) save(K.weights, weights); }, [weights, profile]);
  useEffect(() => { save(K.remind, remind); }, [remind]);

  const today = useMemo(() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }, []);
  const last = doses.length ? doses[doses.length - 1] : null;
  const nextDate = last ? new Date(last.date.getTime() + MEDS[last.med].intervalDays * dayMs) : null;
  const daysToNext = nextDate ? Math.max(0, Math.ceil((nextDate - today) / dayMs)) : null;

  // reagenda lembretes toda vez que abre / muda a próxima dose / muda preferência
  useEffect(() => {
    (async () => {
      if (!profile || !last || !nextDate) return;
      if (!remind.on) { const reg = await navigator.serviceWorker.ready.catch(() => null); reg && reg.active && reg.active.postMessage({ type: "clear" }); setStatus("Lembretes desativados"); return; }
      const r = await agendarLembretes(nextDate, last.med, last.doseMg, remind.vespera);
      setStatus(r === "ok" ? `Lembrete ativo para ${fmtLong(nextDate)}` : r === "denied" ? "Permissão de notificação negada" : "Notificações indisponíveis neste navegador");
    })();
  }, [remind, profile, nextDate ? nextDate.getTime() : 0]);

  if (!ready) return null;
  if (!consent) return <Consent onAccept={() => { save(K.consent, true); setConsent(true); }} />;
  if (!profile) return <ProfileForm first initial={{ med: "Semaglutida", doseMg: 0.5, age: "", weightKg: "", heightCm: "", sex: "F", diaSemana: "", horario: "09:00" }} onSave={(p) => {
    setProfile(p);
    // ancora a primeira dose na aplicação mais recente que corresponde ao dia/horário escolhidos
    const [hh, mm] = (p.horario || "09:00").split(":").map(Number);
    const base = new Date(); base.setHours(hh || 9, mm || 0, 0, 0);
    if (MEDS[p.med].intervalDays === 1) {
      // diária: última dose = hoje no horário (ou ontem, se ainda não deu a hora)
      if (base.getTime() > Date.now()) base.setDate(base.getDate() - 1);
      setDoses([{ id: 1, date: base, med: p.med, doseMg: p.doseMg, site: SITES[0], pain: 2 }]);
    } else {
      // semanal: recua até o dia da semana escolhido (a aplicação mais recente)
      let diff = (base.getDay() - p.diaSemana + 7) % 7;
      base.setDate(base.getDate() - diff);
      if (base.getTime() > Date.now()) base.setDate(base.getDate() - 7);
      setDoses([{ id: 1, date: base, med: p.med, doseMg: p.doseMg, site: SITES[0], pain: 2 }]);
    }
    setWeights([{ id: 1, date: new Date(), kg: p.weightKg }]);
  }} />;

  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2), c = bmiClass(bmi);
  const ssPeak = last ? steadyStatePeak(last.med, last.doseMg) : 1;
  const relNow = last ? doses.reduce((a, d) => a + bateman(d.med, (today - d.date.getTime()) / 3600000, d.doseMg), 0) : 0;
  const nowPct = Math.min(100, (relNow / ssPeak) * 100);
  const curvePts = [];
  if (last) for (let t = today.getTime() - 28 * dayMs; t <= today.getTime(); t += dayMs) { const rel = doses.reduce((a, d) => a + bateman(d.med, (t - d.date.getTime()) / 3600000, d.doseMg), 0); curvePts.push({ x: t, y: Math.min(100, (rel / ssPeak) * 100), label: fmt(new Date(t)) }); }
  const wStart = weights.length ? weights[0].kg : profile.weightKg;
  const wDiff = weights.length ? +(weights[weights.length - 1].kg - wStart).toFixed(1) : 0;
  const weightPts = weights.map((w) => ({ x: w.date.getTime(), y: w.kg, label: fmt(w.date) }));

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 96px", background: "linear-gradient(180deg,#EAF7F0,#F2F6FD 55%,#FDF4EC)", minHeight: "100vh" }}>
      <Row style={{ marginBottom: 14 }}>
        <div><p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#4F8A72", fontWeight: 600 }}>Ciclo GLP</p><h1 className="display" style={{ fontSize: 24, fontWeight: 700 }}>Meu acompanhamento</h1></div>
        <button onClick={() => setEditing(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "none", borderRadius: 999, padding: "6px 12px 6px 6px", boxShadow: "0 3px 8px rgba(22,48,43,.05)" }}>
          <span style={{ width: 32, height: 32, borderRadius: 16, background: "linear-gradient(135deg,#16C784,#1273D6)", display: "inline-block" }} />
          <span style={{ textAlign: "left" }}><span style={{ fontSize: 11, fontWeight: 600, display: "block" }}>Perfil</span><span style={{ fontSize: 9, color: "#7A928A" }}>IMC {bmi.toFixed(1)}</span></span>
        </button>
      </Row>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
        {[`${profile.age} anos`, `${profile.weightKg} kg`, `${profile.heightCm} cm`, `${profile.med} ${profile.doseMg} mg`].map((t, i) => (
          <span key={i} style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 500, padding: "6px 12px", borderRadius: 999, background: "#fff", color: "#41564F", boxShadow: "0 3px 8px rgba(22,48,43,.05)" }}>{t}</span>
        ))}
      </div>

      {/* IMC */}
      <div style={cardStyle("linear-gradient(155deg,#FFFFFF,#EEF4FE)")}>
        <Label>🩺 Índice de massa corporal</Label>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, margin: "6px 0" }}>
          <span className="display" style={{ fontSize: 34, fontWeight: 800, color: c.color }}>{bmi.toFixed(1)}</span>
          <Pill bg={c.color} c="#fff">{c.faixa}</Pill>
        </div>
        <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", marginBottom: 4 }}>
          {["#3B82F6", "#16C784", "#F5A623", "#F0803B", "#F0553B", "#D6336C"].map((col, i) => <div key={i} style={{ flex: 1, background: col, opacity: c.color === col ? 1 : 0.28 }} />)}
        </div>
        <p style={{ fontSize: 11, color: "#41564F", lineHeight: 1.4, marginTop: 8 }}>Cálculo peso/altura² com as faixas da OMS. É uma medida populacional; a interpretação clínica cabe ao seu médico.</p>
      </div>

      {/* Peso */}
      {weights.length > 1 ? (
        <div style={cardStyle("linear-gradient(155deg,#FFFFFF,#F0FBF5)")}>
          <Row><Label>📉 Evolução de peso</Label><button onClick={() => setWForm({ kg: profile.weightKg, date: new Date().toISOString().slice(0, 10) })} style={{ border: "none", background: "#16C78418", color: "#0E7C5A", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999 }}>+ Pesagem</button></Row>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, margin: "6px 0" }}>
            <span className="display" style={{ fontSize: 36, fontWeight: 800, color: wDiff <= 0 ? "#16C784" : "#F0553B" }}>{wDiff > 0 ? "+" : "−"}{Math.abs(wDiff).toFixed(1).replace(".", ",")}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: wDiff <= 0 ? "#16C784" : "#F0553B", marginBottom: 6 }}>kg</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#7A928A", marginBottom: 6 }}>desde o início</span>
          </div>
          <Line points={weightPts} color={wDiff <= 0 ? "#16C784" : "#F0553B"} fill />
        </div>
      ) : (
        <button onClick={() => setWForm({ kg: profile.weightKg, date: new Date().toISOString().slice(0, 10) })} style={{ ...cardStyle("#fff"), width: "100%", border: "none", color: "#0E7C5A", fontWeight: 600 }}>+ Registrar primeira pesagem</button>
      )}

      {/* Próxima dose */}
      {nextDate && (
        <div style={cardStyle("linear-gradient(120deg,#0E7C5A,#1273D6)")}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#fff" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(255,255,255,.16)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span className="display" style={{ fontSize: 22, fontWeight: 800 }}>{daysToNext}</span><span style={{ fontSize: 10, opacity: 0.9 }}>{daysToNext === 1 ? "dia" : "dias"}</span>
            </div>
            <div>
              <p style={{ fontSize: 12, opacity: 0.8 }}>🔔 Próxima aplicação prevista</p>
              <p className="display" style={{ fontSize: 16, fontWeight: 700 }}>{fmtLong(nextDate)}</p>
              <p style={{ fontSize: 11, opacity: 0.8 }}>Última: {last.med} {last.doseMg} mg</p>
            </div>
          </div>
        </div>
      )}

      {/* Lembretes */}
      {last && (
        <div style={cardStyle()}>
          <Row><Label>🔔 Lembretes de dose</Label>
            <button onClick={() => setRemind((r) => ({ ...r, on: !r.on }))} style={{ width: 48, height: 28, borderRadius: 999, border: "none", background: remind.on ? "#16C784" : "#D7E3DD", position: "relative", cursor: "pointer" }}>
              <span style={{ position: "absolute", top: 3, left: remind.on ? 23 : 3, width: 22, height: 22, borderRadius: 11, background: "#fff", transition: "left .15s" }} />
            </button>
          </Row>
          {remind.on && (
            <button onClick={() => setRemind((r) => ({ ...r, vespera: !r.vespera }))} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, background: "none", border: "none", padding: 0 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, border: remind.vespera ? "none" : "1.5px solid #B7C9C1", background: remind.vespera ? "#16C784" : "transparent", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{remind.vespera ? "✓" : ""}</span>
              <span style={{ fontSize: 13, color: "#41564F" }}>Avisar também na véspera (18h)</span>
            </button>
          )}
          {!!status && <p style={{ fontSize: 11, color: "#5E7A72", marginTop: 10 }}>{status}</p>}
          {isIOS && !isStandalone && <p style={{ fontSize: 10, color: "#B0731F", marginTop: 6 }}>No iPhone, os lembretes só funcionam com o app adicionado à Tela de Início.</p>}
        </div>
      )}

      {last && <WeekRing doses={doses} />}

      {/* Curva */}
      {last && (
        <div style={cardStyle()}>
          <Row>
            <div><Label>Atividade relativa hoje</Label><p className="display" style={{ fontSize: 24, fontWeight: 800, color: "#1273D6" }}>{Math.round(nowPct)}<span style={{ fontSize: 13 }}>% do pico</span></p></div>
            <button onClick={() => setShowSource(true)} style={{ border: "none", background: "#E4F0E9", color: "#0E7C5A", fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 999 }}>📖 Fonte</button>
          </Row>
          <Line points={curvePts} color="#1273D6" dots={false} pct />
          <p style={{ fontSize: 10, color: "#9AAFA7", marginTop: 4, lineHeight: 1.4 }}>Curva média da população, a partir dos parâmetros da bula ({MEDS[last.med].halfLifeH}h de meia-vida, Tmax {MEDS[last.med].tmaxH}h). Não representa sua concentração individual e não é medida em você.</p>
        </div>
      )}

      {/* Mecanismo */}
      {last && (
        <div style={cardStyle(MEDS[last.med].vias.length > 1 ? "linear-gradient(150deg,#F1FBF6,#F3EEFE)" : "linear-gradient(150deg,#F1FBF6,#FFFFFF)")}>
          <Row><Label>🎯 Mecanismo de ação</Label><Pill bg={MEDS[last.med].vias.length > 1 ? "#8B5CF622" : "#16C78422"} c={MEDS[last.med].vias.length > 1 ? "#7C3AED" : "#0E7C5A"}>{MEDS[last.med].vias.length > 1 ? "Agonista duplo" : "Agonista único"}</Pill></Row>
          <p style={{ fontWeight: 600, marginTop: 4 }}>{last.med}</p>
          <p style={{ fontSize: 10, color: "#9AAFA7", marginBottom: 8 }}>{MEDS[last.med].marcas}</p>
          {MEDS[last.med].vias.map((v) => (
            <div key={v} style={{ marginBottom: 8 }}>
              <span style={{ display: "inline-block", padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: VIAS[v].color, marginBottom: 4 }}>{VIAS[v].nome}</span>
              <p style={{ fontSize: 11, color: "#41564F", lineHeight: 1.4 }}>{VIAS[v].efeito}</p>
            </div>
          ))}
        </div>
      )}

      {/* Retatrutida */}
      <div style={cardStyle("linear-gradient(150deg,#F1FBF6,#FDF0E6)")}>
        <Row><Label>📚 Conteúdo educativo</Label><Pill bg="#F0803B22" c="#B0731F">Em investigação</Pill></Row>
        <p style={{ fontWeight: 600, margin: "4px 0" }}>Retatrutida · agonista triplo</p>
        <p style={{ fontSize: 11, color: "#41564F", lineHeight: 1.45, marginBottom: 8 }}>Molécula em investigação que adiciona a via do glucagon às duas da tirzepatida. Não possui registro sanitário nem bula comercial publicada — por isso nenhuma curva é exibida e ela não pode ser selecionada.</p>
        <div style={{ display: "flex", gap: 8 }}>{MEDS.Retatrutida.vias.map((v) => <span key={v} style={{ padding: "4px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", background: VIAS[v].color }}>{v}</span>)}</div>
      </div>

      {/* Histórico */}
      <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#4F8A72", fontWeight: 600, marginBottom: 8 }}>Histórico</p>
      {[...doses].reverse().slice(0, 6).map((d) => (
        <div key={d.id} style={{ background: "#fff", borderRadius: 18, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><p style={{ fontWeight: 600, fontSize: 14 }}>{d.med} · {d.doseMg} mg</p><p style={{ fontSize: 11, color: "#7A928A" }}>{fmtLong(d.date)} · {d.site}</p></div>
          <span style={{ fontSize: 11, color: "#7A928A" }}>dor {d.pain}/10</span>
        </div>
      ))}

      {/* Aviso */}
      <div style={{ background: "#FFF4E5", borderRadius: 16, padding: 12, marginTop: 12 }}>
        <p style={{ fontSize: 10, color: "#8A5A00", lineHeight: 1.5 }}>Este aplicativo não é um dispositivo médico e não diagnostica, trata ou previne qualquer condição. É um registro pessoal de doses e material educativo baseado em informação pública de bula. Não substitui consultas, exames ou orientação do seu médico. Nunca ajuste a dose por conta própria.</p>
      </div>

      {/* FAB */}
      <button onClick={() => setDForm({ med: profile.med, doseMg: profile.doseMg, site: SITES[0], pain: 2, date: new Date().toISOString().slice(0, 10) })}
        style={{ position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", border: "none", background: "linear-gradient(120deg,#16C784,#1273D6)", color: "#fff", fontWeight: 700, fontSize: 14, padding: "13px 24px", borderRadius: 999, boxShadow: "0 8px 20px rgba(14,124,90,.35)", zIndex: 40 }}>
        + Registrar dose
      </button>

      {editing && <ProfileForm initial={{ ...profile }} onSave={(p) => { setProfile(p); setEditing(false); }} onClose={() => setEditing(false)} />}

      {dForm && <Sheet onClose={() => setDForm(null)}>
        <Row><h2 className="display" style={{ fontSize: 18, fontWeight: 700 }}>Registrar dose</h2><button onClick={() => setDForm(null)} style={{ border: "none", background: "#E4F0E9", borderRadius: 999, width: 32, height: 32 }}>✕</button></Row>
        <div style={{ margin: "12px 0" }}><Label>Princípio ativo</Label><Chips items={selectable} val={dForm.med} onPick={(m) => setDForm({ ...dForm, med: m, doseMg: MEDS[m].doses[0] })} /></div>
        <div style={{ marginBottom: 12 }}><Label>Dose aplicada</Label><Chips items={MEDS[dForm.med].doses} val={+dForm.doseMg} onPick={(d) => setDForm({ ...dForm, doseMg: d })} fmt={(d) => d + " mg"} /></div>
        <div style={{ marginBottom: 12 }}><Label>Data</Label><input style={inp} type="date" value={dForm.date} onChange={(e) => setDForm({ ...dForm, date: e.target.value })} /></div>
        <div style={{ marginBottom: 4 }}><Label>Local da aplicação</Label><Chips items={SITES} val={dForm.site} onPick={(st) => setDForm({ ...dForm, site: st })} /></div>
        <p style={{ fontSize: 10, color: "#9AAFA7", marginBottom: 12 }}>A bula indica exposição semelhante em abdômen, coxa e braço. O registro serve para o rodízio.</p>
        <Label>Dor na aplicação: {dForm.pain}/10</Label>
        <input type="range" min="0" max="10" value={dForm.pain} onChange={(e) => setDForm({ ...dForm, pain: +e.target.value })} style={{ width: "100%", accentColor: "#16C784", marginBottom: 16 }} />
        <button style={btnPrimary} onClick={() => { setDoses((p) => [...p, { id: Date.now(), date: new Date(dForm.date + "T" + (profile.horario || "09:00") + ":00"), med: dForm.med, doseMg: +dForm.doseMg, site: dForm.site, pain: +dForm.pain }].sort((a, b) => a.date - b.date)); setDForm(null); }}>Salvar dose</button>
      </Sheet>}

      {wForm && <Sheet onClose={() => setWForm(null)}>
        <Row><h2 className="display" style={{ fontSize: 18, fontWeight: 700 }}>Registrar pesagem</h2><button onClick={() => setWForm(null)} style={{ border: "none", background: "#E4F0E9", borderRadius: 999, width: 32, height: 32 }}>✕</button></Row>
        <div style={{ margin: "12px 0" }}><Label>Peso (kg)</Label><input style={inp} type="number" inputMode="decimal" value={wForm.kg} onChange={(e) => setWForm({ ...wForm, kg: e.target.value })} /></div>
        <div style={{ marginBottom: 16 }}><Label>Data</Label><input style={inp} type="date" value={wForm.date} onChange={(e) => setWForm({ ...wForm, date: e.target.value })} /></div>
        <button style={{ ...btnPrimary, opacity: wForm.kg ? 1 : 0.4 }} disabled={!wForm.kg} onClick={() => { const kg = +wForm.kg; setWeights((p) => [...p, { id: Date.now(), date: new Date(wForm.date + "T09:00:00"), kg }].sort((a, b) => a.date - b.date)); setProfile((p) => ({ ...p, weightKg: kg })); setWForm(null); }}>Salvar pesagem</button>
      </Sheet>}

      {showSource && <Sheet onClose={() => setShowSource(false)}>
        <Row><h2 className="display" style={{ fontSize: 18, fontWeight: 700 }}>De onde vem a curva</h2><button onClick={() => setShowSource(false)} style={{ border: "none", background: "#E4F0E9", borderRadius: 999, width: 32, height: 32 }}>✕</button></Row>
        <p style={{ fontSize: 12, color: "#41564F", lineHeight: 1.5, margin: "12px 0 10px" }}>A curva usa o modelo farmacocinético clássico de um compartimento com absorção de primeira ordem (função de Bateman). As duas constantes derivam de dados públicos e obrigatórios da bula:</p>
        <p style={{ fontSize: 12, color: "#41564F", marginBottom: 4 }}>• ke (eliminação) = ln2 ÷ meia-vida</p>
        <p style={{ fontSize: 12, color: "#41564F", marginBottom: 10 }}>• ka (absorção) resolvida a partir do Tmax</p>
        <p style={{ fontSize: 12, color: "#41564F", lineHeight: 1.5, marginBottom: 14 }}>O eixo é normalizado em % do pico no estado de equilíbrio. É a representação do comportamento médio descrito pelo fabricante — não uma medição, nem uma estimativa da sua concentração plasmática.</p>
        {selectable.map((m) => <div key={m} style={{ background: "#F4FAF7", borderRadius: 12, padding: 10, marginBottom: 8 }}><p style={{ fontSize: 12, fontWeight: 700 }}>{m}</p><p style={{ fontSize: 10, color: "#5E7A72", marginTop: 2 }}>{MEDS[m].fonte}</p></div>)}
      </Sheet>}

      {banner && <InstallBanner onClose={() => setBanner(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
