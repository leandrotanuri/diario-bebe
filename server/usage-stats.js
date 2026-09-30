/*
 * Contagem de uso (fase de testes).
 * Roda no GitHub Actions (1x por dia ou na mão). Lê os eventos de todas as
 * famílias e escreve um resumo no "Summary" da rodada do Actions.
 *
 * O repositório é PÚBLICO: o relatório nunca mostra o id completo da família
 * (ele funciona como senha no link) nem o nome do bebê — só a inicial.
 *
 * Segredos (env): FIREBASE_SERVICE_ACCOUNT (JSON).
 */
const fs = require("fs");
const admin = require("firebase-admin");

if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error("Faltou o segredo FIREBASE_SERVICE_ACCOUNT."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const DAY = 86400000;
const TZ = "America/Sao_Paulo";
const TYPES = { feed: "🍼", pee: "💧", poop: "💩", sleep: "😴", note: "📝", measure: "📏" };

const dayKey = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ }); // AAAA-MM-DD
const fmtDate = (ts) => new Date(ts).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function ago(ts) {
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return "há " + h + "h";
  return "há " + Math.floor(h / 24) + "d";
}

async function main() {
  const now = Date.now();
  const last7 = new Set(), last14 = new Set();
  for (let i = 0; i < 14; i++) { const k = dayKey(now - i * DAY); if (i < 7) last7.add(k); last14.add(k); }

  const [evSnap, subsSnap] = await Promise.all([
    db.collectionGroup("events").get(),
    db.collectionGroup("pushSubs").get(),
  ]);

  const fams = new Map();
  const fam = (id) => {
    if (!fams.has(id)) fams.set(id, { id, total: 0, week: 0, days7: new Set(), days14: new Set(), allDays: new Set(), first: Infinity, last: 0, types: {}, push: 0 });
    return fams.get(id);
  };

  for (const d of evSnap.docs) {
    const famRef = d.ref.parent.parent;
    if (!famRef || famRef.parent.id !== "families") continue;
    const e = d.data();
    if (e.example || typeof e.ts !== "number") continue;
    const f = fam(famRef.id);
    const k = dayKey(e.ts);
    f.total++;
    f.allDays.add(k);
    f.first = Math.min(f.first, e.ts);
    f.last = Math.max(f.last, e.ts);
    if (last14.has(k)) f.days14.add(k);
    if (last7.has(k)) { f.days7.add(k); f.week++; f.types[e.type] = (f.types[e.type] || 0) + 1; }
  }
  for (const d of subsSnap.docs) {
    const famRef = d.ref.parent.parent;
    if (famRef && fams.has(famRef.id)) fams.get(famRef.id).push++;
  }

  // inicial do nome do bebê (só pra você reconhecer quem é quem)
  await Promise.all([...fams.values()].map(async (f) => {
    const s = await db.doc("families/" + f.id + "/meta/settings").get();
    const n = ((s.exists && s.data().name) || "").trim();
    f.label = (n ? n[0].toUpperCase() + "…" : "?") + " `" + f.id.slice(0, 4) + "`";
  }));

  const list = [...fams.values()].sort((a, b) => b.last - a.last);
  const active7 = list.filter((f) => f.days7.size > 0).length;
  const engaged = list.filter((f) => f.days7.size >= 4).length;

  const lines = [];
  lines.push("# 📊 Uso do Mamei");
  lines.push("_Gerado em " + fmtDate(now) + " (horário de Brasília)_");
  lines.push("");
  lines.push("| Famílias com registro | Ativas nos últimos 7 dias | Usando ≥4 dias/semana |");
  lines.push("|:-:|:-:|:-:|");
  lines.push(`| **${list.length}** | **${active7}** | **${engaged}** |`);
  lines.push("");
  lines.push("## Por família");
  lines.push("| Família | Último registro | Dias ativos (7d) | Dias ativos (14d) | Registros (7d) | Tipos (7d) | Total | Usando desde | Avisos |");
  lines.push("|---|---|:-:|:-:|:-:|---|:-:|---|:-:|");
  for (const f of list) {
    const types = Object.entries(f.types).sort((a, b) => b[1] - a[1]).map(([t, c]) => (TYPES[t] || t) + c).join(" ") || "—";
    lines.push(`| ${f.label} | ${ago(f.last)} | ${f.days7.size}/7 | ${f.days14.size}/14 | ${f.week} | ${types} | ${f.total} | ${fmtDate(f.first).slice(0, 5)} (${f.allDays.size} dias) | ${f.push ? "🔔" : "—"} |`);
  }
  if (!list.length) lines.push("| _nenhum registro ainda_ | | | | | | | | |");
  lines.push("");
  lines.push("**Como ler:** \"Dias ativos (7d)\" é o sinal principal — quantos dos últimos 7 dias tiveram pelo menos 1 registro. " +
    "Família com 5/7 ou mais tá usando de verdade; caindo pra 1–2/7 é hora de perguntar o que aconteceu.");

  const md = lines.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
}
main().catch((e) => { console.error(e); process.exit(1); });
