// Server Gudang Roastery - tanpa library tambahan, hanya butuh Node.js 16+
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os");
const PORT = +process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "data.json");
const BACKUP_DIR = path.join(DATA_DIR, "backup");
fs.mkdirSync(BACKUP_DIR, { recursive: true });

let D = { g: [], r: [], s: [], min: 20, rev: 0 };
try { D = Object.assign(D, JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch (e) {}

const pad = n => String(n).padStart(2, "0");
const localDate = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

function save() {
  D.rev++;
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(D));
  fs.renameSync(tmp, FILE);
  try { fs.copyFileSync(FILE, path.join(BACKUP_DIR, "data-" + localDate() + ".json")); } catch (e) {}
}

const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const gStock = g => g.kg - sum(D.r.filter(r => r.g === g.id), r => r.in);
const rRem = r => r.out - sum(D.s.filter(s => s.r === r.id), s => s.kg);
const str = (v, max = 100) => String(v == null ? "" : v).trim().slice(0, max);
const num = v => (v === "" || v == null ? NaN : Number(v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fail = (msg, code = 400) => { const e = new Error(msg); e.code = code; throw e; };
const kgs = n => (Math.round(n * 100) / 100) + " kg";

function validDate(d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) fail("Tanggal tidak valid."); return d; }

const handlers = {
  g(b) {
    const o = { id: uid(), date: validDate(b.date), farmer: str(b.farmer), origin: str(b.origin), kg: num(b.kg), price: num(b.price), by: str(b.by, 40) };
    if (!o.farmer) fail("Nama petani wajib diisi.");
    if (!(o.kg > 0)) fail("Berat harus lebih dari 0.");
    if (!(o.price >= 0)) fail("Harga tidak valid.");
    D.g.push(o);
  },
  r(b) {
    const g = D.g.find(x => x.id === b.g);
    if (!g) fail("Pilih lot green bean dulu.");
    const o = { id: uid(), date: validDate(b.date), g: g.id, in: num(b.in), out: num(b.out), profile: str(b.profile, 40), by: str(b.by, 40) };
    if (!o.profile) fail("Profile roast wajib diisi.");
    if (!(o.in > 0) || !(o.out > 0)) fail("Kg harus lebih dari 0.");
    if (o.in > gStock(g) + 1e-9) fail("Stok lot hanya " + kgs(gStock(g)) + ".");
    if (o.out > o.in) fail("Hasil roast tidak boleh melebihi kg green bean yang di-roast.");
    D.r.push(o);
  },
  s(b) {
    const r = D.r.find(x => x.id === b.r);
    if (!r) fail("Pilih batch roast dulu.");
    const o = { id: uid(), date: validDate(b.date), r: r.id, customer: str(b.customer), kg: num(b.kg), price: num(b.price), by: str(b.by, 40) };
    if (!(o.kg > 0)) fail("Berat harus lebih dari 0.");
    if (!(o.price >= 0)) fail("Harga tidak valid.");
    if (o.kg > rRem(r) + 1e-9) fail("Stok batch hanya " + kgs(rRem(r)) + ".");
    D.s.push(o);
  }
};

function remove(t, id) {
  if (!["g", "r", "s"].includes(t)) fail("Data tidak dikenal.", 404);
  if (t === "g" && D.r.some(r => r.g === id)) fail("Lot ini sudah dipakai di roast. Hapus roast-nya dulu.");
  if (t === "r" && D.s.some(s => s.r === id)) fail("Batch ini sudah ada penjualan. Hapus penjualannya dulu.");
  D[t] = D[t].filter(x => x.id !== id);
}

function send(res, code, obj, type) {
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(type ? obj : JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((ok, no) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 100000) { no(new Error("Data terlalu besar.")); req.destroy(); } });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(new Error("Format data salah.")); } });
  });
}

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && (url === "/" || url === "/index.html"))
      return send(res, 200, fs.readFileSync(path.join(__dirname, "public", "index.html")), "text/html; charset=utf-8");
    if (req.method === "GET" && url === "/api/data") return send(res, 200, D);
    const m = url.match(/^\/api\/(g|r|s)(?:\/([\w-]+))?$/);
    if (req.method === "POST" && m && !m[2]) { handlers[m[1]](await readBody(req)); save(); return send(res, 200, D); }
    if (req.method === "DELETE" && m && m[2]) { remove(m[1], m[2]); save(); return send(res, 200, D); }
    if (req.method === "PUT" && url === "/api/min") {
      const b = await readBody(req); const v = num(b.min);
      if (!(v >= 0)) fail("Batas minimum tidak valid.");
      D.min = v; save(); return send(res, 200, D);
    }
    send(res, 404, { error: "Tidak ditemukan." });
  } catch (e) { send(res, e.code || 400, { error: e.message }); }
}).listen(PORT, "0.0.0.0", () => {
  console.log("\nServer Gudang Roastery berjalan. Biarkan jendela ini tetap terbuka.\n");
  console.log("Buka di PC ini:   http://localhost:" + PORT);
  const ips = [];
  Object.values(os.networkInterfaces()).forEach(l => l.forEach(i => { if (i.family === "IPv4" && !i.internal) ips.push(i.address); }));
  ips.forEach(ip => console.log("Buka di PC lain:  http://" + ip + ":" + PORT));
  console.log("\nData disimpan di: " + FILE + "\n");
});
