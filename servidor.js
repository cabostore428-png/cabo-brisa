const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(__dirname, file);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('nao achado'); }
    res.writeHead(200);
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('rodando na porta ' + PORT));

/* ===== Cabo Brisa — script completo v9 ===== */

var CHAVE = 'cabo-brisa-carrinho-9';
var CHAVE_CUPOM = 'cb-cupom';
var CHAVE_MEU = 'cb-meu-codigo';
var CHAVE_AVAL = 'cb-avaliacoes';
var CHAVE_AVAL_TRAVA = 'cb-aval-trava';
var CHAVE_ESPERA = 'cb-espera';
var CHAVE_AMOSTRA = 'cb-amostra-usada';
var CHAVE_PERFIL = 'cb-perfil';
var CHAVE_CHAT = 'cb-chat';
var CHAVE_SOM = 'cb-som';

var MINIMO = 20;
var GRATIS_ACIMA = 70;
var MEU_WHATS = '5522981551818';
var MEU_TELEGRAM = 'cabobrisa';
var CUPOM_VALOR = 5;
var INDICACAO_VALOR = 2;
var NL = String.fromCharCode(10);

var API = '';

var PRODUTOS = {
  maconha: { nome: 'Prensado', desde: 'lote prensado, 5 g no mínimo', precoG: 5, min: 5, passo: 5, foto: 'lote1.jpg' },
  cocaina: { nome: 'Cocaína', desde: 'pó, 1 g no mínimo', precoG: 10, min: 1, passo: 1, foto: 'po1.jpg' }
};

var KITS = {
  kit1: { nome: 'Kit 10 g', g: 10, preco: 45 },
  kit2: { nome: 'Kit 20 g', g: 20, preco: 80 }
};

var ESTOQUE = { maconha: 0, cocaina: 0 };

var cart = [];
var frete = null;
var zonaFrete = '';
var descontoCupom = 0;
var descontoIndicacao = 0;
var codigoIndicador = '';
var notaAtual = 0;
var codigoAtual = '';
var enderecoAtual = '';
var remoto = false;
var conta = null;
var modoConta = 'entrar';
var chatId = 0;
var chatUltimo = 0;
var chatTimer = null;
var somLigado = true;
var audioCtx = null;
var codigoPendente = '';
var navegando = false;

function url(p) { return API + p; }
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function numero(n) { return String(n).replace('.', ','); }
function formatar(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
function ler(c, padrao) { try { var v = JSON.parse(localStorage.getItem(c)); return v == null ? padrao : v; } catch (e) { return padrao; } }
function gravar(c, v) { try { localStorage.setItem(c, JSON.stringify(v)); } catch (e) {} }

/* ---------- som ---------- */

function tocar(freq, dur, tipo) {
  if (!somLigado) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = tipo || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

function somClique() {
  var base = [520, 610, 470, 690, 560, 640][Math.floor(Math.random() * 6)];
  tocar(base + Math.random() * 40, 0.08, 'square');
}
function somAdicionar() { tocar(440, 0.09); setTimeout(function () { tocar(660, 0.11); }, 70); }
function somErro() { tocar(220, 0.16, 'sawtooth'); }

function alternarSom() {
  somLigado = !somLigado;
  gravar(CHAVE_SOM, somLigado);
  document.getElementById('btnSom').textContent = somLigado ? 'Som' : 'Mudo';
  var a = document.getElementById('ambiente');
  if (somLigado) { a.play().catch(function () {}); tocar(600, 0.1); }
  else a.pause();
}

function iniciarAmbiente() {
  var a = document.getElementById('ambiente');
  a.volume = 0;
  a.play().then(function () {
    var v = 0;
    var t = setInterval(function () {
      v += 0.03;
      a.volume = Math.min(0.28, v);
      if (v >= 0.28) clearInterval(t);
    }, 120);
  }).catch(function () {});
}

/* ---------- cardápio ---------- */

function montarCards() {
  var alvo = document.getElementById('cards');
  var html = '';
  for (var id in PRODUTOS) {
    var p = PRODUTOS[id];
    html += '<div class="card">'
      + '<div class="foto"><img src="' + p.foto + '" alt="' + esc(p.nome) + '" loading="lazy"></div>'
      + '<div class="corpo">'
      + '<h3>' + esc(p.nome) + '</h3>'
      + '<p class="desde">' + esc(p.desde) + '</p>'
      + '<p class="preco">' + formatar(p.precoG) + ' <span>/ g</span></p>'
      + '<div class="controles">'
      + '<input id="q-' + id + '" type="number" min="' + p.min + '" step="' + p.passo + '" value="' + p.min + '">'
      + '<span class="un">g</span>'
      + '</div>'
      + '<button class="botao" onclick="adicionar(\'' + id + '\')">Adicionar</button>'
      + '<div id="espera-' + id + '" style="margin-top:9px"></div>'
      + '</div></div>';
  }
  alvo.innerHTML = html;

  for (var k in PRODUTOS) {
    var caixa = document.getElementById('espera-' + k);
    if (!caixa) continue;
    caixa.innerHTML = '<div class="espera">'
      + '<input id="zap-' + k + '" inputmode="tel" maxlength="16" placeholder="WhatsApp se faltar">'
      + '<button class="botao secundario" style="width:auto;padding:9px 13px;font-size:10px" onclick="avisar(\'' + k + '\')">Avisar</button>'
      + '</div>';
  }
}

function montarKits() {
  var alvo = document.getElementById('kits');
  var html = '';
  for (var k in KITS) {
    html += '<div class="kit">'
      + '<p class="nome">' + esc(KITS[k].nome) + '</p>'
      + '<p class="valor">' + formatar(KITS[k].preco) + '</p>'
      + '<p class="eco">sai a ' + formatar(KITS[k].preco / KITS[k].g) + ' o grama</p>'
      + '<button class="botao secundario" onclick="adicionarKit(\'' + k + '\')">Levar</button>'
      + '</div>';
  }
  alvo.innerHTML = html;
}

/* ---------- carrinho ---------- */

function carregar() {
  var c = ler(CHAVE, []);
  cart = Array.isArray(c) ? c : [];
}

function salvar() { gravar(CHAVE, cart); }

function alternarCarrinho() {
  document.getElementById('carrinho').classList.toggle('aberta');
  somClique();
}

function adicionar(id) {
  var p = PRODUTOS[id];
  var campo = document.getElementById('q-' + id);
  var g = Math.max(p.min, Number(campo.value) || p.min);

  for (var i = 0; i < cart.length; i++) {
    if (cart[i].id === id && !cart[i].brinde && !cart[i].kit) {
      cart[i].g += g; somAdicionar(); salvar(); render(); return;
    }
  }
  cart.push({ id: id, g: g });
  somAdicionar(); salvar(); render();
}

function adicionarKit(k) {
  cart.push({ id: 'maconha', kit: k, g: KITS[k].g });
  somAdicionar(); salvar(); render();
}

function remover(i) {
  cart.splice(i, 1);
  somClique(); salvar(); render();
}

function subtotalAtual() {
  var s = 0;
  for (var i = 0; i < cart.length; i++) {
    var it = cart[i];
    if (it.brinde) continue;
    if (it.kit && KITS[it.kit]) s += KITS[it.kit].preco;
    else s += it.g * PRODUTOS[it.id].precoG;
  }
  return s;
}

function temBrinde() {
  for (var i = 0; i < cart.length; i++) if (cart[i].brinde) return true;
  return false;
}

function consumo() {
  var m = 0, c = 0;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].id === 'maconha') m += cart[i].g;
    if (cart[i].id === 'cocaina') c += cart[i].g;
  }
  return { maconha: m, cocaina: c };
}

function limpar() {
  cart = [];
  descontoCupom = 0;
  descontoIndicacao = 0;
  codigoIndicador = '';
  codigoPendente = '';
  var cup = document.getElementById('cupom');
  if (cup) cup.value = '';
  salvar(); render();
}

function render() {
  var alvo = document.getElementById('itens');
  var html = '';
  for (var i = 0; i < cart.length; i++) {
    var it = cart[i], nome, preco;
    if (it.brinde) { nome = it.g + ' g de ' + PRODUTOS[it.id].nome + ' (amostra)'; preco = 'grátis'; }
    else if (it.kit && KITS[it.kit]) { nome = KITS[it.kit].nome; preco = formatar(KITS[it.kit].preco); }
    else { nome = it.g + ' g de ' + PRODUTOS[it.id].nome; preco = formatar(it.g * PRODUTOS[it.id].precoG); }

    html += '<div class="item"><span class="nome">' + esc(nome) + '</span>'
      + '<span class="preco">' + preco + '</span>'
      + '<button onclick="remover(' + i + ')" aria-label="remover">✕</button></div>';
  }
  alvo.innerHTML = html;

  var subtotal = subtotalAtual();
  var gratis = subtotal >= GRATIS_ACIMA;
  var taxa = gratis ? 0 : (frete || 0);
  var base = subtotal + taxa;
  var desc = Math.min(descontoCupom + descontoIndicacao, base);
  var total = Math.max(0, base - desc);

  document.getElementById('subtotal').textContent = formatar(subtotal);
  document.getElementById('entrega').textContent = gratis ? 'grátis' : (frete === null ? '—' : formatar(taxa));
  document.getElementById('total').textContent = formatar(total);
  document.getElementById('contador').textContent = cart.length;
  document.getElementById('vazio').style.display = cart.length ? 'none' : 'block';
  document.getElementById('linhaDesconto').style.display = desc > 0 ? 'flex' : 'none';
  document.getElementById('desconto').textContent = '- ' + formatar(desc);

  atualizarLinks();
}

function calcularFrete() {
  var cep = document.getElementById('cep').value.replace(/\D/g, '');
  var msg = document.getElementById('freteMsg');

  if (cep.length !== 8) { msg.textContent = 'CEP com 8 dígitos.'; somErro(); return; }

  var p = Number(cep.slice(0, 5));
  if (p >= 28900 && p <= 28929) { zonaFrete = 'Cabo Frio'; frete = 5; }
  else if (p >= 28930 && p <= 28949) { zonaFrete = 'Cabo Frio (interior)'; frete = 8; }
  else if (p >= 28950 && p <= 28959) { zonaFrete = 'Armação dos Búzios'; frete = 12; }
  else { zonaFrete = ''; frete = null; }

  if (frete === null) { msg.textContent = 'Fora da área de entrega.'; somErro(); }
  else { msg.textContent = zonaFrete + ' · entrega ' + formatar(frete); tocar(700, 0.09); }

  render();
}

/* ---------- cupom e indicação ---------- */

function aplicarCupom() {
  var campo = document.getElementById('cupom');
  var v = campo.value.trim().toUpperCase();
  if (!v) return;

  if (v === meuCodigo()) { somErro(); return; }

  fetch(url('/api/cupom/' + encodeURIComponent(v)), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.valido) { descontoCupom = CUPOM_VALOR; tocar(760, 0.12); }
      else { descontoCupom = 0; somErro(); }
      render();
    })
    .catch(function () { descontoCupom = CUPOM_VALOR; render(); });
}

function aplicarIndicacao() {
  var campo = document.getElementById('indicacao');
  var v = campo.value.trim().toUpperCase();
  if (!v || v === meuCodigo()) { somErro(); return; }
  descontoIndicacao = INDICACAO_VALOR;
  codigoIndicador = v;
  tocar(680, 0.1);
  render();
}

/* ---------- amostra ---------- */

function marcarAmostra(ligado) {
  var usada = ler(CHAVE_AMOSTRA, false);
  if (usada && ligado) { document.getElementById('amostraCheck').checked = false; return; }

  if (ligado) {
    if (!temBrinde()) cart.push({ id: 'maconha', g: 1, brinde: true });
    tocar(820, 0.1);
  } else {
    for (var i = 0; i < cart.length; i++) if (cart[i].brinde) { cart.splice(i, 1); break; }
    somClique();
  }
  salvar(); render();
}

function atualizarAmostra() {
  var usada = ler(CHAVE_AMOSTRA, false);
  var check = document.getElementById('amostraCheck');
  var estado = document.getElementById('amostraEstado');
  if (usada) {
    check.checked = false;
    check.disabled = true;
    estado.innerHTML = '<p class="usada">Você já usou a amostra. <button class="liberar" onclick="liberarAmostra()">liberar</button></p>';
  } else {
    check.disabled = false;
    estado.innerHTML = '';
  }
}

function liberarAmostra() {
  gravar(CHAVE_AMOSTRA, false);
  atualizarAmostra();
}

/* ---------- baseados ---------- */

function calcularBaseado() {
  var g = Number(document.getElementById('calcG').value) || 0;
  document.getElementById('calcSaida').textContent = Math.floor(g / 5);
}

/* ---------- perfil ---------- */

function montarPerfil() {
  var p = ler(CHAVE_PERFIL, {});
  document.getElementById('pNome').value = p.nome || '';
  document.getElementById('pZap').value = p.zap || '';
  document.getElementById('perfil').classList.add('mostrar');
}

function salvarPerfil() {
  var z = document.getElementById('pZap');
  mascaraZap(z);
  gravar(CHAVE_PERFIL, {
    nome: document.getElementById('pNome').value.trim(),
    zap: z.value.trim()
  });
  atualizarLinks();
}

function mascaraZap(el) {
  var v = el.value.replace(/\D/g, '').slice(0, 11);
  el.value = v.length > 6 ? '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7) : v;
}

/* ---------- ranking ---------- */

function carregarRanking() {
  fetch(url('/api/ranking'), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (lista) {
      var alvo = document.getElementById('listaRanking');
      if (!Array.isArray(lista) || !lista.length) { alvo.innerHTML = '<p class="rank-vazio">Ninguém no ranking ainda.</p>'; return; }
      var html = '';
      for (var i = 0; i < lista.length; i++) {
        html += '<div class="rank-item"><span class="pos">' + (i + 1) + '</span>'
          + '<span>' + esc(lista[i].nome) + '</span><span class="g">' + lista[i].g + ' g</span></div>';
      }
      alvo.innerHTML = html;
    }).catch(function () {});
}

/* ---------- diário ---------- */

function carregarDiario() {
  fetch(url('/api/diario'), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (lista) {
      var alvo = document.getElementById('listaDiario');
      if (!Array.isArray(lista) || !lista.length) { alvo.innerHTML = '<p class="rank-vazio">Nada registrado ainda.</p>'; return; }
      var html = '';
      for (var i = 0; i < lista.length; i++) {
        html += '<div class="diario-item"><span class="quando">' + esc(lista[i].quando || '') + '</span>'
          + '<p>' + esc(lista[i].texto) + '</p></div>';
      }
      alvo.innerHTML = html;
    }).catch(function () {});
}

/* ---------- avaliações ---------- */

function nota(n) {
  notaAtual = n;
  var b = document.getElementById('estrelas').querySelectorAll('button');
  for (var i = 0; i < b.length; i++) b[i].className = i < n ? 'on' : '';
  somClique();
}

function enviarAval() {
  var texto = document.getElementById('comentario').value.trim();
  var pedido = document.getElementById('pedidoAval').value.trim().toUpperCase();
  if (!notaAtual) { alert('Escolha uma nota.'); return; }
  if (texto.length < 3) { alert('Escreva um comentário.'); return; }

  var trava = parseInt(localStorage.getItem(CHAVE_AVAL_TRAVA) || '0', 10);
  if (Date.now() - trava < 30000) { alert('Espere 30 segundos entre uma avaliação e outra.'); return; }

  var lista = ler(CHAVE_AVAL, []);
  if (!Array.isArray(lista)) lista = [];
  lista.unshift({ n: notaAtual, t: texto, d: Date.now() });
  gravar(CHAVE_AVAL, lista.slice(0, 40));
  try { localStorage.setItem(CHAVE_AVAL_TRAVA, String(Date.now())); } catch (e) {}

  fetch(url('/api/avaliacoes'), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nota: notaAtual, texto: texto, pedido: pedido })
  }).catch(function () {});

  document.getElementById('comentario').value = '';
  document.getElementById('pedidoAval').value = '';
  notaAtual = 0;
  nota(0);
  tocar(800, 0.14);
  carregarAval();
}

function pintarAval(lista) {
  var alvo = document.getElementById('listaAval');
  if (!Array.isArray(lista) || !lista.length) { alvo.innerHTML = '<p class="rank-vazio">Sem avaliações ainda.</p>'; return; }
  var html = '';
  for (var i = 0; i < lista.length; i++) {
    var a = lista[i];
    html += '<div class="aval"><span class="quem">' + esc(a.nome || 'Cliente') + '</span> '
      + (a.verificado ? '<span class="selo">compra verificada</span>' : '')
      + '<p>' + esc(a.texto) + '</p></div>';
  }
  alvo.innerHTML = html;
}

function carregarAval() {
  fetch(url('/api/avaliacoes'), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (lista) {
      if (Array.isArray(lista) && lista.length) pintarAval(lista);
      else document.getElementById('listaAval').innerHTML = '<p class="rank-vazio">Sem avaliações ainda.</p>';
    }).catch(function () {});
}

/* ---------- lista de espera ---------- */

function avisar(id) {
  var campo = document.getElementById('zap-' + id);
  var caixa = document.getElementById('espera-' + id);
  var zap = (campo.value || '').replace(/\D/g, '');
  if (zap.length < 10) { campo.style.borderColor = 'var(--coral)'; campo.focus(); return; }

  var msg = 'Quero ser avisado quando ' + PRODUTOS[id].nome + ' voltar ao estoque na Cabo Brisa.'
    + NL + NL + 'Meu WhatsApp: ' + zap;
  window.location.href = 'https://wa.me/' + MEU_WHATS + '?text=' + encodeURIComponent(msg);

  var lista = ler(CHAVE_ESPERA, []);
  if (!Array.isArray(lista)) lista = [];
  if (lista.indexOf(id) < 0) { lista.push(id); gravar(CHAVE_ESPERA, lista); }
  caixa.innerHTML = '<span class="ok">Anotado. Te chamo quando chegar.</span>';
}

function restaurarEspera() {
  var lista = ler(CHAVE_ESPERA, []);
  if (!Array.isArray(lista)) return;
  for (var i = 0; i < lista.length; i++) {
    var c = document.getElementById('espera-' + lista[i]);
    if (c) c.innerHTML = '<span class="ok">Você já está na lista.</span>';
  }
}

/* ---------- pedido ---------- */

function gerarCodigo() {
  var l = 'ABCDEFGHJKLMNPQRSTUVWXYZ', n = '23456789', a = '';
  for (var i = 0; i < 3; i++) a += l.charAt(Math.floor(Math.random() * l.length));
  for (var j = 0; j < 2; j++) a += n.charAt(Math.floor(Math.random() * n.length));
  return a;
}

function dadosEntrega() {
  return {
    rua: document.getElementById('rua').value.trim(),
    numero: document.getElementById('numero').value.trim(),
    bairro: document.getElementById('bairro').value.trim(),
    complemento: document.getElementById('complemento').value.trim(),
    referencia: document.getElementById('referencia').value.trim()
  };
}

function enderecoTexto() {
  var d = dadosEntrega();
  var e = d.rua + ', ' + d.numero;
  if (d.complemento) e += ' — ' + d.complemento;
  e += ' · ' + d.bairro;
  if (d.referencia) e += ' · ref.: ' + d.referencia;
  return e;
}

function linhaItem(it) {
  if (it.brinde) return '• ' + numero(it.g) + ' g de ' + PRODUTOS[it.id].nome + ' — AMOSTRA GRÁTIS (primeira compra)';
  if (it.kit && KITS[it.kit]) return '• ' + KITS[it.kit].nome + ' — ' + formatar(KITS[it.kit].preco);
  return '• ' + numero(it.g) + ' g de ' + PRODUTOS[it.id].nome + ' — ' + formatar(it.g * PRODUTOS[it.id].precoG);
}

function textoPedido(codigo) {
  var subtotal = subtotalAtual();
  var gratis = subtotal >= GRATIS_ACIMA;
  var taxa = gratis ? 0 : (frete || 0);
  var base = subtotal + taxa;
  var desc = Math.min(descontoCupom + descontoIndicacao, base);
  var total = Math.max(0, base - desc);

  var l = ['*Cabo Brisa* — pedido ' + codigo, ''];
  for (var j = 0; j < cart.length; j++) l.push(linhaItem(cart[j]));
  l.push('');
  l.push('Produtos: ' + formatar(subtotal));
  l.push('Entrega: ' + (gratis ? 'grátis' : formatar(taxa)));
  if (desc > 0) l.push('Desconto: - ' + formatar(desc));
  l.push('*Total: ' + formatar(total) + '*');
  if (codigoIndicador) l.push('Indicado por: ' + codigoIndicador);
  l.push('');
  l.push('CEP: ' + document.getElementById('cep').value);
  l.push('Endereço: ' + enderecoTexto());
  l.push('');
  l.push('Pago no Pix, envio o comprovante.');
  l.push('Acompanhar: cabostore.de/pedido.html?t=' + codigo);
  return l.join(NL);
}

function atualizarLinks() {
  if (navegando) return;
  var aWa = document.getElementById('btnWhats');
  var aTg = document.getElementById('btnTelegram');
  if (!aWa || !aTg) return;

  if (!cart.length) {
    codigoPendente = '';
    aWa.setAttribute('href', '#');
    aTg.setAttribute('href', '#');
    return;
  }
  if (!codigoPendente) codigoPendente = gerarCodigo();

  var enc = encodeURIComponent(textoPedido(codigoPendente));
  aWa.setAttribute('href', 'https://wa.me/' + MEU_WHATS + '?text=' + enc);
  aTg.setAttribute('href', 'https://t.me/' + MEU_TELEGRAM + '?text=' + enc);
}

function validarPedido() {
  if (!cart.length) { alert('Seu pedido está vazio.'); somErro(); return false; }

  var subtotal = subtotalAtual();
  if (!temBrinde() && subtotal < MINIMO) {
    alert('O pedido mínimo é de ' + formatar(MINIMO) + ' em produto. Faltam ' + formatar(MINIMO - subtotal)
      + '. Se for sua primeira compra, marca a amostra grátis de 1 g que aí você paga só a entrega.');
    somErro(); return false;
  }
  if (subtotal < GRATIS_ACIMA && frete === null) {
    alert('Calcule a entrega pelo CEP antes de enviar.');
    document.getElementById('cep').focus(); somErro(); return false;
  }

  var d = dadosEntrega();
  if (!d.rua || !d.numero || !d.bairro) {
    alert('Preencha rua, número e bairro.');
    document.getElementById(!d.rua ? 'rua' : !d.numero ? 'numero' : 'bairro').focus();
    somErro(); return false;
  }
  return true;
}

function cliqueCheckout(ev) {
  var a = ev.currentTarget;
  if (a.getAttribute('href') === '#' || !cart.length) { ev.preventDefault(); validarPedido(); return; }
  if (!validarPedido()) { ev.preventDefault(); return; }
  confirmarPedido();
  /* sem preventDefault: a âncora navega sozinha */
}

function confirmarPedido() {
  var codigo = codigoPendente;
  var endereco = enderecoTexto();
  var temAmostra = temBrinde();
  var cons = consumo();
  var cupomUsado = document.getElementById('cupom').value.trim().toUpperCase();
  var indicador = codigoIndicador;
  var cepUsado = document.getElementById('cep').value;
  var totalFinal = subtotalAtual();

  codigoAtual = codigo;
  enderecoAtual = endereco;
  navegando = true;

  document.getElementById('codigo').textContent = codigo;
  document.getElementById('confirmacao').classList.add('mostrar');

  document.getElementById('btnComprovante').setAttribute('href',
    'https://wa.me/' + MEU_WHATS + '?text=' +
    encodeURIComponent('Comprovante do pedido ' + codigo + NL + 'Segue o print do Pix.'));

  if (temAmostra) gravar(CHAVE_AMOSTRA, true);
  limpar();
  atualizarAmostra();

  if (descontoCupom > 0 && remoto && cupomUsado) {
    fetch(url('/api/cupom/usar'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: cupomUsado })
    }).catch(function () {});
  }

  document.getElementById('confirmacao').scrollIntoView({ behavior: 'smooth' });
  tocar(700, 0.12);

  if (remoto) {
    fetch(url('/api/pedido'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maconha: cons.maconha, cocaina: cons.cocaina, amostra: temAmostra,
        endereco: endereco, cep: cepUsado, cupom: cupomUsado,
        indicacao: indicador, total: totalFinal
      })
    }).then(function (r) {
      if (r.status === 409) {
        return r.json().then(function (d) {
          ESTOQUE.maconha = Number(d.maconha) || 0;
          ESTOQUE.cocaina = Number(d.cocaina) || 0;
          render();
          alert('Alguém pediu antes e o estoque mudou. Confere o carrinho.');
        });
      }
    }).catch(function () {});
  }

  setTimeout(function () { navegando = false; }, 3000);
}

function copiarEntrega() {
  var msg = document.getElementById('confMsg');
  var texto = 'Entrega Cabo Brisa' + NL + NL + 'Endereço: ' + enderecoAtual + NL + 'Pedido: ' + codigoAtual
    + NL + NL + 'Confira o número na porta antes de entregar. O motorista não espera.';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(function () {
      msg.textContent = 'Endereço copiado. Cola no 99.';
    }).catch(function () { msg.textContent = texto; });
  } else {
    msg.textContent = texto;
  }
}

/* ---------- conta ---------- */

function meuCodigo() {
  var c = ler(CHAVE_MEU, '');
  if (c) return c;
  var n = 'CB' + Math.floor(1000 + Math.random() * 9000);
  gravar(CHAVE_MEU, n);
  return n;
}

function linkIndicacao() { return location.origin + '/?ref=' + meuCodigo(); }

function copiarLink() {
  var msg = document.getElementById('msgInd');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(linkIndicacao()).then(function () {
      msg.textContent = 'Link copiado.';
    }).catch(function () { msg.textContent = linkIndicacao(); });
  } else msg.textContent = linkIndicacao();
}

function compartilhar() {
  var t = 'Pega aí na Cabo Brisa, entrega na porta em Cabo Frio. Usa meu código '
    + meuCodigo() + ' e ganha R$ 2: ' + linkIndicacao();
  window.location.href = 'https://wa.me/?text=' + encodeURIComponent(t);
}

function abrirConta() {
  document.getElementById('modalConta').classList.add('aberto');
  somClique();
}

function fecharConta() {
  document.getElementById('modalConta').classList.remove('aberto');
}

function trocarModo() {
  modoConta = modoConta === 'entrar' ? 'criar' : 'entrar';
  document.getElementById('modalTitulo').textContent = modoConta === 'criar' ? 'Criar conta' : 'Entrar';
  document.getElementById('btnEntrar').textContent = modoConta === 'criar' ? 'Criar' : 'Entrar';
  document.getElementById('btnTroca').textContent = modoConta === 'criar' ? 'Já tenho conta' : 'Criar conta';
  document.getElementById('camposExtra').style.display = modoConta === 'criar' ? 'block' : 'none';
}

function entrar() {
  var email = document.getElementById('cEmail').value.trim();
  var senha = document.getElementById('cSenha').value;
  var aviso = document.getElementById('contaMsg');
  if (!email || senha.length < 6) { aviso.textContent = 'E-mail e senha de 6 dígitos no mínimo.'; return; }

  var corpo = { email: email, senha: senha };
  if (modoConta === 'criar') {
    corpo.nome = document.getElementById('cNome').value.trim();
    corpo.zap = document.getElementById('cZap').value.trim();
    corpo.indicacao = document.getElementById('indicacao').value.trim();
  }

  fetch(url('/api/' + (modoConta === 'criar' ? 'cadastro' : 'entrar')), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (res) {
      if (!res.ok) { aviso.textContent = res.d.erro || 'Não deu.'; return; }
      conta = res.d.usuario || null;
      document.getElementById('btnConta').textContent = conta ? conta.nome.split(' ')[0] : 'Conta';
      fecharConta();
      tocar(780, 0.12);
    }).catch(function () { aviso.textContent = 'Servidor fora.'; });
}

/* ---------- chat ---------- */

function alternarChat() {
  var j = document.getElementById('chatJanela');
  j.classList.toggle('aberta');
  if (j.classList.contains('aberta')) {
    abrirChat();
    document.getElementById('chatTexto').focus();
  } else clearInterval(chatTimer);
  somClique();
}

function abrirChat() {
  if (chatId) { buscarChat(); return; }
  fetch(url('/api/chat/abrir'), { method: 'POST', credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      chatId = d.id;
      try { localStorage.setItem(CHAVE_CHAT, String(chatId)); } catch (e) {}
      buscarChat();
      chatTimer = setInterval(buscarChat, 4000);
    }).catch(function () {});
}

function buscarChat() {
  if (!chatId) return;
  fetch(url('/api/chat/' + chatId + '?desde=' + chatUltimo), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (lista) {
      var corpo = document.getElementById('chatCorpo');
      for (var i = 0; i < lista.length; i++) {
        var d = document.createElement('div');
        d.className = 'chat-msg ' + (lista[i].de === 'loja' ? 'loja' : 'cliente');
        d.textContent = lista[i].texto;
        corpo.appendChild(d);
        chatUltimo++;
      }
      if (lista.length) { corpo.scrollTop = corpo.scrollHeight; tocar(560, 0.07); }
    }).catch(function () {});
}

function enviarChat() {
  var campo = document.getElementById('chatTexto');
  var texto = campo.value.trim();
  if (!texto || !chatId) return;
  campo.value = '';
  fetch(url('/api/chat/' + chatId), {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: texto })
  }).then(buscarChat).catch(function () {});
  somClique();
}

/* ---------- easter egg ---------- */

var konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
var konamiPos = 0;

if (typeof document !== 'undefined') {
document.addEventListener('keydown', function (e) {
  if (e.key === konami[konamiPos]) {
    konamiPos++;
    if (konamiPos === konami.length) { konamiPos = 0; abrirEgg(); }
  } else konamiPos = 0;
});
}
function abrirEgg() {
  var c = 'EGG' + Math.floor(100 + Math.random() * 900);
  document.getElementById('eggCod').textContent = c;
  document.getElementById('eggCaixa').classList.add('aberto');
  gravar(CHAVE_CUPOM, c);
  tocar(880, 0.2);
}

function fecharEgg() { document.getElementById('eggCaixa').classList.remove('aberto'); }

/* ---------- estado ---------- */

function sincronizar() {
  fetch(url('/api/estado'), { cache: 'no-store', credentials: 'include' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      remoto = true;
      if (d.estoque) { ESTOQUE.maconha = d.estoque.maconha; ESTOQUE.cocaina = d.estoque.cocaina; }
      if (d.usuario) {
        conta = d.usuario;
        document.getElementById('btnConta').textContent = conta.nome.split(' ')[0];
      }
    }).catch(function () { remoto = false; });
}

/* ---------- início ---------- */
if (typeof document !== 'undefined') {

document.getElementById('btnWhats').addEventListener('click', cliqueCheckout);
document.getElementById('btnTelegram').addEventListener('click', cliqueCheckout);
document.getElementById('cZap').addEventListener('input', function () { mascaraZap(this); });

if (ler(CHAVE_SOM, true) === false) {
  somLigado = false;
  document.getElementById('btnSom').textContent = 'Mudo';
}

carregar();
montarCards();
montarKits();
montarPerfil();
atualizarAmostra();
calcularBaseado();
render();
carregarRanking();
carregarDiario();
carregarAval();
restaurarEspera();
sincronizar();

var ref = new URLSearchParams(location.search).get('ref');
if (ref) document.getElementById('indicacao').value = ref.toUpperCase();

document.addEventListener('click', function () { if (!audioCtx) iniciarAmbiente(); }, { once: true });
document.addEventListener('visibilitychange', function () {
  var a = document.getElementById('ambiente');
  if (document.hidden) a.pause();
  else if (somLigado) a.play().catch(function () {});
});
}
