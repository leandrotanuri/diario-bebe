/*
 * Enviador de lembretes push (Nível 2 — app fechado).
 * Roda no GitHub Actions a cada ~15 min. Para cada dispositivo inscrito
 * (families/{fid}/pushSubs), olha os eventos recentes da família e envia um
 * push se estiver na hora da mamada ou fechando a janela de sono.
 *
 * Segredos (env): FIREBASE_SERVICE_ACCOUNT (JSON), VAPID_PRIVATE, VAPID_SUBJECT.
 */
const admin = require("firebase-admin");
const webpush = require("web-push");

const VAPID_PUBLIC = "BKguBdO2ENxkRojUG8C_tFToB-6ijzOhCD8g_Z0dZqXiIXeiJC1ORqRq2SlGolnknt8Y5okOz9bhjFepEgy8KiQ";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:leandro.tanuri@outlook.com";

if (!VAPID_PRIVATE) { console.error("Faltou o segredo VAPID_PRIVATE."); process.exit(1); }
if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.error("Faltou o segredo FIREBASE_SERVICE_ACCOUNT."); process.exit(1); }

webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const H = 3600000;
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), rm = m % 60;
  return h + "h" + (rm ? " " + String(rm).padStart(2, "0") + "min" : "");
}
function ageDays(birth) { if (!birth) return null; const b = new Date(birth + "T00:00:00"); const d = Math.floor((Date.now() - b.getTime()) / 86400000); return d < 0 ? 0 : d; }
function wakeWindow(days) {
  if (days < 28) return [40, 60];
  const w = days / 7;
  if (w < 8) return [60, 90]; if (w < 13) return [75, 105]; if (w < 17) return [90, 120];
  const mo = days / 30.44;
  if (mo < 5) return [105, 135]; if (mo < 6) return [120, 150]; if (mo < 7) return [135, 165];
  if (mo < 9) return [150, 180]; if (mo < 12) return [165, 210]; if (mo < 15) return [180, 240];
  if (mo < 18) return [210, 270]; return [240, 300];
}
function feedDefaultInterval(days) { const mo = days / 30.44; if (mo < 1) return 2.5 * H; if (mo < 4) return 3 * H; if (mo < 6) return 3.5 * H; return 4 * H; }
function computeFeedInterval(feeds, birth) { // feeds mais novo primeiro
  const gaps = [];
  for (let k = 0; k < feeds.length - 1 && k < 6; k++) { const g = feeds[k].ts - feeds[k + 1].ts; if (g > 0 && g <= 6 * H) gaps.push(g); }
  if (gaps.length) return Math.max(20 * 60000, gaps.reduce((a, b) => a + b, 0) / gaps.length);
  return birth ? feedDefaultInterval(ageDays(birth)) : 3 * H;
}

async function main() {
  const subsSnap = await db.collectionGroup("pushSubs").get();
  const now = Date.now();
  let sent = 0, checked = 0;

  for (const doc of subsSnap.docs) {
    const s = doc.data();
    if ((!s.feed && !s.nap) || !s.endpoint || !s.keys) continue;
    checked++;
    const famRef = doc.ref.parent.parent; // families/{fid}

    // eventos recentes + settings da família
    const [evSnap, setSnap] = await Promise.all([
      famRef.collection("events").orderBy("ts", "desc").limit(40).get(),
      famRef.collection("meta").doc("settings").get(),
    ]);
    const events = evSnap.docs.map((d) => d.data());
    const settings = setSnap.exists ? setSnap.data() : {};
    const birth = settings.birth || null;
    const name = (settings.name || "o bebê").trim() || "o bebê";

    const openFeed = events.find((e) => e.type === "feed" && !e.endTs);
    const openSleep = events.find((e) => e.type === "sleep" && !e.endTs);
    const updates = {};
    let payload = null;

    // MAMADA (prioridade)
    if (s.feed && !openFeed) {
      const feeds = events.filter((e) => e.type === "feed");
      const lf = feeds[0];
      if (lf) {
        const ref = lf.endTs || lf.ts;
        const iv = s.feedIntervalMin ? s.feedIntervalMin * 60000 : computeFeedInterval(feeds, birth);
        if (now - ref >= iv && s.lastSentFeedRef !== ref) {
          payload = { title: "🍼 Hora da mamada?", body: `Já faz ${fmtDur(now - ref)} que ${name} mamou.`, tag: "feed-reminder" };
          updates.lastSentFeedRef = ref;
        }
      }
    }
    // SONECA (se não houver push de mamada nesta rodada)
    if (!payload && s.nap && birth && !openSleep && !openFeed) {
      const ls = events.find((e) => e.type === "sleep" && e.endTs);
      if (ls) {
        const win = wakeWindow(ageDays(birth));
        const awake = now - ls.endTs;
        if (awake >= win[1] * 60000 && s.lastSentNapRef !== ls.endTs) {
          payload = { title: "😴 Janela de sono", body: `${name} está acordado há ${fmtDur(awake)} — pode estar na hora da soneca.`, tag: "nap-reminder" };
          updates.lastSentNapRef = ls.endTs;
        }
      }
    }

    if (!payload) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
      sent++;
      await doc.ref.set(updates, { merge: true });
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) { await doc.ref.delete(); console.log("Inscrição removida (expirada):", famRef.id); }
      else console.error("Falha ao enviar:", famRef.id, code || err.message);
    }
  }
  console.log(`OK — ${subsSnap.size} inscrições, ${checked} ativas, ${sent} push enviados.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
