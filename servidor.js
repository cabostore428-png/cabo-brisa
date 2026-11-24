const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookie = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const ADMIN = process.env.ADMIN_TOKEN || 'troque-este-token';
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || 'cabo.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, zap TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, senha TEXT NOT NULL,
  criado_em INTEGER NOT NULL, total_gasto REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, expira INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, segredo TEXT NOT NULL,
  usuario_id INTEGER, itens TEXT NOT NULL, subtotal REAL NOT NULL,
  entrega REAL NOT NULL, desconto REAL NOT NULL, total REAL NOT NULL,
  endereco TEXT NOT NULL, status TEXT NOT NULL, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY, usuario_id INTEGER, nome TEXT, nota INTEGER NOT NULL,
  texto TEXT NOT NULL, pedido TEXT, verificado INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cupons (
  codigo TEXT PRIMARY KEY, valor REAL NOT NULL, validade INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS estoque (chave TEXT PRIMARY KEY, valor REAL NOT NULL);
CREATE TABLE IF NOT EXISTS lotes (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, foto TEXT, origem TEXT, entrada TEXT,
  aparencia TEXT, cheiro TEXT, preco_g REAL NOT NULL, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS diario (
  id INTEGER PRIMARY KEY, texto TEXT NOT NULL, criado_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversas (
  id INTEGER PRIMARY KEY, usuario_id INTEGER, aberta_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY, conversa_id INTEGER NOT NULL, de TEXT NOT NULL,
  texto TEXT NOT NULL, criado_em INTEGER NOT NULL
);
`);

db.prepare("INSERT OR IGNORE INTO estoque (chave, valor) VALUES ('maconha', 0)").run();
db.prepare("INSERT OR IGNORE INTO estoque (chave, valor) VALUES ('cocaina', 0)").run();

if (!db.prepare('SELECT COUNT(*) c FROM lotes').get().c) {
  db.prepare(`INSERT INTO lotes (nome, foto, origem, entrada, aparencia, cheiro, preco_g)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'Prensado do lote 12', 'lote1.jpg', 'Cabo Frio', 'pré-venda',
    'Bloco compacto, marrom escuro, sem mofo', 'Terra e madeira', 5);
  db.prepare('INSERT INTO diario (texto, criado_em) VALUES (?, ?)')
    .run('Reposição a caminho. A pré-venda segue aberta.', Date.now());
}

const PRECOS = { maconha: 5, cocaina: 40 };
const KITS = { kit1: { preco: 45, maconha: 10 }, kit2: { preco: 80, maconha: 20 } };
const MINIMO = 20;
const GRATIS_ACIMA = 70;
const FRETE = { cabofrio: 5, vizinha: 12, fora: 15 };

const app = express();
app.use(express.json());
app.use(cookie());

app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && /^https:\/\/(www\.)?cabostore\.de$/.test(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

async function notificar(texto) {
  const tok = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT;
  if (!tok || !chat) return;
  try {
    await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML' })
    });
  } catch (e) {}
}

function usuarioDoReq(req) {
  const t = req.cookies.cb_sessao;
  if (!t) return null;
  const s = db.prepare('SELECT * FROM sessoes WHERE token = ?').get(t);
  if (!s || s.expira < Date.now()) return null;
  return db.prepare('SELECT id, nome, zap, email, total_gasto FROM usuarios WHERE id = ?').get(s.usuario_id);
}

const tentativas = new Map();
function limitar(chave, max, janela) {
  const agora = Date.now();
  const r = tentativas.get(chave) || { n: 0, t: agora };
  if (agora - r.t > janela) { r.n = 0; r.t = agora; }
  r.n++;
  tentativas.set(chave, r);
  return r.n <= max;
}

function entrarComSessao(res, usuario_id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?, ?, ?)')
    .run(token, usuario_id, Date.now() + 30 * 86400000);
  res.cookie('cb_sessao', token, {
    httpOnly: true, sameSite: 'lax', secure: !!process.env.HTTPS, maxAge: 30 * 86400000
  });
}

function exigirAdmin(req, res, next) {
  if (req.query.admin !== ADMIN) return res.status(403).json({ erro: 'sem acesso' });
  next();
}

app.post('/api/cadastro', async (req, res) => {
  const { nome, zap, email, senha } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'faltou dado' });
  if (senha.length < 6) return res.status(400).json({ erro: 'senha curta' });
  if (!limitar('cad' + email, 5, 3600000)) return res.status(429).json({ erro: 'tente depois' });

  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase());
  if (existe) return res.status(409).json({ erro: 'e-mail já cadastrado' });

  const hash = await bcrypt.hash(senha, 10);
  const r = db.prepare('INSERT INTO usuarios (nome, zap, email, senha, criado_em) VALUES (?, ?, ?, ?, ?)')
    .run(nome.trim(), (zap || '').replace(/\D/g, ''), email.toLowerCase(), hash, Date.now());

  entrarComSessao(res, r.lastInsertRowid);
  res.json({ ok: true });
});

app.post('/api/entrar', async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'faltou dado' });
  if (!limitar('ent' + email, 8, 900000)) return res.status(429).json({ erro: 'muitas tentativas' });

  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());
  if (!u) return res.status(401).json({ erro: 'e-mail ou senha errados' });
  if (!await bcrypt.compare(senha, u.senha)) return res.status(401).json({ erro: 'e-mail ou senha errados' });

  entrarComSessao(res, u.id);
  res.json({ ok: true });
});

app.post('/api/sair', (req, res) => {
  const t = req.cookies.cb_sessao;
  if (t) db.prepare('DELETE FROM sessoes WHERE token = ?').run(t);
  res.clearCookie('cb_sessao');
  res.json({ ok: true });
});

app.get('/api/eu', (req, res) => {
  const u = usuarioDoReq(req);
  if (!u) return res.json({ logado: false });
  const pedidos = db.prepare('SELECT codigo, segredo, total, status, criado_em FROM pedidos WHERE usuario_id = ? ORDER BY id DESC LIMIT 20').all(u.id);
  res.json({ logado: true, nome: u.nome, total_gasto: u.total_gasto, pedidos });
});

app.get('/api/estado', (req, res) => {
  const e = Object.fromEntries(db.prepare('SELECT chave, valor FROM estoque').all().map(r => [r.chave, r.valor]));
  res.json(e);
});

app.get('/api/lotes', (req, res) => {
  res.json(db.prepare('SELECT * FROM lotes WHERE ativo = 1 ORDER BY id DESC').all());
});

app.get('/api/lote/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM lotes WHERE id = ? AND ativo = 1').get(req.params.id);
  if (!l) return res.status(404).json({ erro: 'lote não encontrado' });
  res.json(l);
});

app.get('/api/diario', (req, res) => {
  res.json(db.prepare('SELECT texto, criado_em FROM diario ORDER BY id DESC LIMIT 30').all());
});

app.get('/api/ranking', (req, res) => {
  const linhas = db.prepare(`SELECT nome, total_gasto FROM usuarios
    WHERE total_gasto > 0 ORDER BY total_gasto DESC LIMIT 20`).all();
  res.json(linhas.map((l, i) => {
    const partes = l.nome.trim().split(/\s+/);
    return {
      pos: i + 1,
      nome: partes[0] + (partes[1] ? ' ' + partes[1][0] + '.' : ''),
      total: l.total_gasto
    };
  }));
});

app.post('/api/cupom', (req, res) => {
  const usados = db.prepare("SELECT COUNT(*) c FROM cupons WHERE codigo NOT LIKE 'CB-EGG-%'").get().c;
  if (usados >= 5) return res.json({ esgotado: true });

  const codigo = 'CB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const validade = Date.now() + 60 * 86400000;
  db.prepare('INSERT INTO cupons (codigo, valor, validade) VALUES (?, 5, ?)').run(codigo, validade);
  res.json({ codigo, validade });
});

app.post('/api/cupom/validar', (req, res) => {
  const codigo = String(req.body.codigo || '').toUpperCase();
  const c = db.prepare('SELECT * FROM cupons WHERE codigo = ?').get(codigo);
  if (!c) return res.json({ estado: 'naoexiste' });
  if (c.usado) return res.json({ estado: 'usado' });
  if (c.validade < Date.now()) return res.json({ estado: 'vencido' });
  res.json({ estado: 'ok' });
});

app.post('/api/cupom/egg', (req, res) => {
  const chave = String(req.body.chave || '').slice(0, 12).toUpperCase();
  if (!chave) return res.status(400).json({ erro: 'sem chave' });
  const codigo = 'CB-EGG-' + chave;
  if (!db.prepare('SELECT codigo FROM cupons WHERE codigo = ?').get(codigo)) {
    db.prepare('INSERT INTO cupons (codigo, valor, validade) VALUES (?, 5, ?)')
      .run(codigo, Date.now() + 60 * 86400000);
  }
  res.json({ codigo });
});

function zonaDoCep(cep) {
  const p = parseInt(String(cep).replace(/\D/g, '').slice(0, 5), 10);
  if (p >= 28900 && p <= 28929) return { zona: 'Cabo Frio', frete: FRETE.cabofrio };
  if ([28930, 28940, 28950, 28960].includes(p)) return { zona: 'cidade vizinha', frete: FRETE.vizinha };
  return { zona: 'fora da área', frete: FRETE.fora };
}

app.post('/api/pedido', (req, res) => {
  const { itens, amostra, cep, endereco, cupom } = req.body || {};
  if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ erro: 'carrinho vazio' });
  if (!endereco) return res.status(400).json({ erro: 'sem endereço' });

  const disp = Object.fromEntries(db.prepare('SELECT chave, valor FROM estoque').all().map(r => [r.chave, r.valor]));
  const consumido = { maconha: 0, cocaina: 0 };
  let subtotal = 0;

  for (const it of itens) {
    if (it.kit && KITS[it.kit]) {
      subtotal += KITS[it.kit].preco;
      consumido.maconha += KITS[it.kit].maconha;
    } else if (PRECOS[it.id] && it.g > 0) {
      subtotal += it.g * PRECOS[it.id];
      consumido[it.id] += it.g;
    }
  }
  if (amostra) consumido.maconha += 1;

  if (consumido.maconha > disp.maconha) return res.status(409).json({ erro: 'estoque de maconha mudou', ...disp });
  if (consumido.cocaina > disp.cocaina) return res.status(409).json({ erro: 'estoque de cocaina mudou', ...disp });
  if (!amostra && subtotal < MINIMO) return res.status(400).json({ erro: 'abaixo do mínimo' });

  const { zona, frete } = zonaDoCep(cep);
  const gratis = subtotal >= GRATIS_ACIMA;
  const taxa = gratis ? 0 : frete;

  let desconto = 0;
  if (cupom) {
    const c = db.prepare('SELECT * FROM cupons WHERE codigo = ? AND usado = 0 AND validade > ?').get(cupom, Date.now());
    if (c) { desconto = c.valor; db.prepare('UPDATE cupons SET usado = 1 WHERE codigo = ?').run(cupom); }
  }
  desconto = Math.min(desconto, subtotal + taxa);
  const total = Math.max(0, subtotal + taxa - desconto);

  const codigo = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3) + Math.floor(10 + Math.random() * 89);
  const segredo = crypto.randomBytes(3).toString('hex');
  const u = usuarioDoReq(req);

  db.prepare(`INSERT INTO pedidos (codigo, segredo, usuario_id, itens, subtotal, entrega, desconto, total, endereco, status, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aguardando pix', ?)`).run(
    codigo, segredo, u ? u.id : null, JSON.stringify({ itens, amostra }), subtotal, taxa, desconto, total,
    JSON.stringify({ endereco, zona }), Date.now());

  db.prepare("UPDATE estoque SET valor = valor - ? WHERE chave = 'maconha'").run(consumido.maconha);
  db.prepare("UPDATE estoque SET valor = valor - ? WHERE chave = 'cocaina'").run(consumido.cocaina);

  notificar('Pedido ' + codigo + '\nR$ ' + total.toFixed(2) + '\n' + endereco);

  res.json({ codigo, segredo, subtotal, entrega: taxa, desconto, total, zona });
});

app.get('/api/pedido/:codigo', (req, res) => {
  const p = db.prepare('SELECT codigo, segredo, itens, total, endereco, status, criado_em FROM pedidos WHERE codigo = ?').get(req.params.codigo.toUpperCase());
  if (!p) return res.status(404).json({ erro: 'não achei' });
  if (p.segredo !== req.query.s && !usuarioDoReq(req)) return res.status(403).json({ erro: 'link inválido' });
  res.json(p);
});

app.get('/api/avaliacoes', (req, res) => {
  res.json(db.prepare('SELECT nome, nota, texto, verificado, criado_em FROM avaliacoes ORDER BY id DESC LIMIT 40').all());
});

app.post('/api/avaliacoes', (req, res) => {
  const { nota, texto, pedido } = req.body || {};
  if (!nota || !texto) return res.status(400).json({ erro: 'faltou dado' });
  const u = usuarioDoReq(req);
  const verificado = !!(pedido && db.prepare('SELECT 1 FROM pedidos WHERE codigo = ?').get(String(pedido).toUpperCase()));
  db.prepare('INSERT INTO avaliacoes (usuario_id, nome, nota, texto, pedido, verificado, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(u ? u.id : null, u ? u.nome.split(' ')[0] : null, nota, texto.slice(0, 240), pedido || null, verificado ? 1 : 0, Date.now());
  res.json({ ok: true, verificado });
});

app.post('/api/chat/abrir', (req, res) => {
  const u = usuarioDoReq(req);
  if (u) {
    const aberta = db.prepare('SELECT id FROM conversas WHERE usuario_id = ? ORDER BY id DESC LIMIT 1').get(u.id);
    if (aberta) return res.json({ id: aberta.id });
  }
  const r = db.prepare('INSERT INTO conversas (usuario_id, aberta_em) VALUES (?, ?)').run(u ? u.id : null, Date.now());
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/chat/:id', (req, res) => {
  res.json(db.prepare('SELECT de, texto, criado_em FROM mensagens WHERE conversa_id = ? AND id > ? ORDER BY id')
    .all(req.params.id, Number(req.query.desde) || 0));
});

app.post('/api/chat/:id', (req, res) => {
  const { texto, de } = req.body || {};
  if (!texto) return res.status(400).json({ erro: 'vazio' });
  const r = db.prepare('INSERT INTO mensagens (conversa_id, de, texto, criado_em) VALUES (?, ?, ?, ?)')
    .run(req.params.id, de === 'loja' ? 'loja' : 'cliente', texto.slice(0, 500), Date.now());
  if (de !== 'loja') notificar('Nova mensagem (conversa ' + req.params.id + ')\n' + texto.slice(0, 300));
  res.json({ id: r.lastInsertRowid });
});

app.get('/api/chat', exigirAdmin, (req, res) => {
  res.json(db.prepare(`SELECT c.id, c.aberta_em,
    (SELECT texto FROM mensagens WHERE conversa_id = c.id ORDER BY id DESC LIMIT 1) ultima
    FROM conversas c ORDER BY c.id DESC LIMIT 50`).all());
});

app.post('/api/admin/estoque', exigirAdmin, (req, res) => {
  for (const k of ['maconha', 'cocaina']) {
    if (typeof req.body[k] === 'number') db.prepare('UPDATE estoque SET valor = ? WHERE chave = ?').run(req.body[k], k);
  }
  res.json({ ok: true });
});

app.get('/api/admin/pedidos', exigirAdmin, (req, res) => {
  res.json(db.prepare('SELECT codigo, status, total, endereco, criado_em FROM pedidos ORDER BY id DESC LIMIT 60').all());
});

app.post('/api/admin/status', exigirAdmin, (req, res) => {
  const p = db.prepare('SELECT usuario_id, total, status FROM pedidos WHERE codigo = ?').get(req.body.codigo);
  if (!p) return res.status(404).json({ erro: 'pedido não existe' });
  db.prepare('UPDATE pedidos SET status = ? WHERE codigo = ?').run(req.body.status, req.body.codigo);
  if (req.body.status === 'entregue' && p.status !== 'entregue' && p.usuario_id) {
    db.prepare('UPDATE usuarios SET total_gasto = total_gasto + ? WHERE id = ?').run(p.total, p.usuario_id);
  }
  res.json({ ok: true });
});

app.post('/api/admin/diario', exigirAdmin, (req, res) => {
  if (!req.body.texto) return res.status(400).json({ erro: 'vazio' });
  db.prepare('INSERT INTO diario (texto, criado_em) VALUES (?, ?)').run(String(req.body.texto).slice(0, 300), Date.now());
  res.json({ ok: true });
});

app.post('/api/admin/lote', exigirAdmin, (req, res) => {
  const { nome, foto, origem, entrada, aparencia, cheiro, preco_g } = req.body || {};
  if (!nome || !preco_g) return res.status(400).json({ erro: 'faltou dado' });
  const r = db.prepare(`INSERT INTO lotes (nome, foto, origem, entrada, aparencia, cheiro, preco_g)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(nome, foto || null, origem || null, entrada || null, aparencia || null, cheiro || null, Number(preco_g));
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.listen(PORT, () => console.log('Cabo Brisa em http://localhost:' + PORT));