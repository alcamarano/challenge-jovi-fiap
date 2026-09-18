/* =============================================================
   camera.js
   Câmera do JOVI Lens usando a câmera real do aparelho.

   O que acontece aqui:
   - abre a câmera (traseira ou frontal) com getUserMedia
   - mede a luz da cena a partir da própria imagem
   - Captura Inteligente: sugere o modo certo para a cena
   - Guia de Baixa Luz: passo a passo quando falta luz
   - tira foto (com zoom, modo e Aura Light aplicados na imagem)
   - grava vídeo com som (MediaRecorder)
   ============================================================= */

const camera = {
  modo: 'foto',           // foto | video | retrato | noturno
  luminosidade: 50,       // medida da imagem, de 0 a 100
  frontal: false,         // está usando a câmera frontal?
  ia: true,               // Captura Inteligente ligada
  flash: 'off',           // off | auto | on
  aura: false,            // Aura Light
  grade: false,
  zoom: 1,
  sugestaoDispensada: '',
  guiaOculto: false,
  ocupado: false,
  pronta: false,

  // Câmera e gravação
  stream: null,
  trilhaVideo: null,
  temTorch: false,        // o aparelho tem lanterna?
  zoomNativo: null,       // { min, max, step } quando o aparelho permite
  gravador: null,
  gravando: false,
  inicioGravacao: 0,
  relogioGravacao: null,
  relogioAnalise: null,
  local: null,            // coordenadas, quando o usuário autoriza
};

const LIMITE_VIDEO = 60; // segundos
const el = {};

/* -------------------------------------------------------------
   1. INICIALIZAÇÃO
   ------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  [
    'visor', 'visor-video', 'canvas-analise', 'vinheta', 'grade', 'foco', 'flash-captura',
    'etiqueta-cena', 'texto-cena', 'etiqueta-luz', 'texto-luz', 'icone-luz', 'etiqueta-gravando', 'tempo-gravacao',
    'sugestao', 'sugestao-icone', 'sugestao-titulo', 'sugestao-texto', 'sugestao-aplicar', 'sugestao-fechar',
    'guia-luz', 'guia-passos', 'guia-minimizar', 'estabilizar',
    'permissao', 'permissao-titulo', 'permissao-texto', 'permissao-botao',
    'modos', 'zoom', 'ultima-foto', 'disparador', 'status-camera',
    'botao-flash', 'botao-aura', 'botao-grade', 'botao-local', 'botao-ia', 'botao-virar',
  ].forEach((id) => { el[id] = document.getElementById(id); });

  montarModos();
  ligarEventos();
  atualizarUltimaFoto(false);

  // Em celular, começa pela câmera traseira; no computador, pela frontal
  camera.frontal = !window.matchMedia('(pointer: coarse)').matches;
  iniciarCamera();
});

window.addEventListener('pagehide', pararTudo);

/* -------------------------------------------------------------
   2. ABERTURA DA CÂMERA
   ------------------------------------------------------------- */
async function iniciarCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarPermissao(
      'Câmera indisponível',
      'Este navegador não libera a câmera quando o arquivo é aberto direto da pasta. Abra o projeto pelo Chrome ou por um endereço https (veja o README).',
      false,
    );
    return;
  }

  mostrarPermissao('Abrindo a câmera…', 'Toque em "Permitir" quando o navegador perguntar. As fotos ficam só no seu aparelho.', false);

  try {
    camera.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: camera.frontal ? 'user' : 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (erro) {
    tratarErroCamera(erro);
    return;
  }

  const video = el['visor-video'];
  video.srcObject = camera.stream;
  await video.play().catch(() => {});

  camera.trilhaVideo = camera.stream.getVideoTracks()[0];
  lerRecursosDaCamera();
  await mostrarBotaoVirar();

  camera.pronta = true;
  el.disparador.disabled = false;
  esconderPermissao();

  clearInterval(camera.relogioAnalise);
  camera.relogioAnalise = setInterval(analisarLuz, 600);
  analisarLuz();
  atualizarTela();
}

/** Descobre lanterna, zoom e resolução que o aparelho oferece. */
function lerRecursosDaCamera() {
  const trilha = camera.trilhaVideo;
  const ajustes = trilha.getSettings ? trilha.getSettings() : {};
  const recursos = trilha.getCapabilities ? trilha.getCapabilities() : {};

  if (ajustes.facingMode) camera.frontal = ajustes.facingMode === 'user';
  camera.temTorch = !!recursos.torch;
  camera.zoomNativo = recursos.zoom || null;
  camera.zoom = 1;
  if (camera.zoomNativo) aplicarZoomNativo(1);

  el['visor-video'].classList.toggle('espelhada', camera.frontal);
  el['status-camera'].textContent = [
    camera.frontal ? 'Câmera frontal' : 'Câmera traseira',
    ajustes.width ? `${ajustes.width}x${ajustes.height}` : '',
    camera.temTorch ? 'com lanterna' : '',
  ].filter(Boolean).join(' · ');

  // Sem lanterna, o zoom continua funcionando de forma digital
  el.zoom.querySelectorAll('[data-zoom]').forEach((b) => {
    const valor = Number(b.dataset.zoom);
    const cabe = !camera.zoomNativo || valor <= camera.zoomNativo.max;
    b.classList.toggle('hidden', !cabe && valor > 1);
  });
}

/** O botão de trocar de câmera só aparece se houver mais de uma. */
async function mostrarBotaoVirar() {
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const cameras = dispositivos.filter((d) => d.kind === 'videoinput');
    el['botao-virar'].classList.toggle('hidden', cameras.length < 2);
  } catch (erro) {
    el['botao-virar'].classList.add('hidden');
  }
}

function tratarErroCamera(erro) {
  const nome = erro && erro.name;
  const mensagens = {
    NotAllowedError: ['Acesso à câmera bloqueado', 'Clique no ícone de cadeado (ou de câmera) na barra de endereço, permita a câmera e tente de novo.'],
    NotFoundError: ['Nenhuma câmera encontrada', 'Conecte ou ative uma câmera no aparelho e tente de novo.'],
    NotReadableError: ['A câmera está ocupada', 'Feche outros programas que estejam usando a câmera e tente de novo.'],
    OverconstrainedError: ['Câmera não compatível', 'Tente de novo: vamos abrir a câmera disponível no aparelho.'],
    SecurityError: ['Endereço não seguro', 'Abra o projeto por um endereço https ou por localhost para o navegador liberar a câmera.'],
  };
  const [titulo, texto] = mensagens[nome] || ['Não foi possível abrir a câmera', 'Verifique a permissão do navegador e tente de novo.'];
  mostrarPermissao(titulo, texto, true);
  camera.pronta = false;
  el.disparador.disabled = true;
}

function mostrarPermissao(titulo, texto, comBotao) {
  el['permissao-titulo'].textContent = titulo;
  el['permissao-texto'].textContent = texto;
  el['permissao-botao'].classList.toggle('hidden', !comBotao);
  el.permissao.classList.remove('escondido');
}

function esconderPermissao() {
  el.permissao.classList.add('escondido');
}

function pararTudo() {
  clearInterval(camera.relogioAnalise);
  clearInterval(camera.relogioGravacao);
  if (camera.gravador && camera.gravando) camera.gravador.stop();
  if (camera.stream) camera.stream.getTracks().forEach((t) => t.stop());
  camera.stream = null;
}

/* -------------------------------------------------------------
   3. CONTROLES
   ------------------------------------------------------------- */
function montarModos() {
  el.modos.innerHTML = Dados.MODOS.map((m) => `
    <button class="modo-botao" role="tab" data-modo="${m.chave}" aria-selected="false" title="${m.descricao}">
      ${m.nome}
    </button>`).join('');
  el.modos.querySelectorAll('[data-modo]').forEach((botao) => {
    botao.addEventListener('click', () => trocarModo(botao.dataset.modo));
  });

  // Se o navegador não grava vídeo, o modo some
  if (typeof MediaRecorder === 'undefined') {
    el.modos.querySelector('[data-modo="video"]').classList.add('hidden');
  }
}

function ligarEventos() {
  el.disparador.addEventListener('click', capturar);
  el['permissao-botao'].addEventListener('click', iniciarCamera);

  el['botao-flash'].addEventListener('click', alternarFlash);
  el['botao-aura'].addEventListener('click', () => definirAura(!camera.aura));
  el['botao-grade'].addEventListener('click', () => {
    camera.grade = !camera.grade;
    el.grade.classList.toggle('hidden', !camera.grade);
    marcarBotao(el['botao-grade'], camera.grade);
  });
  el['botao-local'].addEventListener('click', alternarLocal);
  el['botao-ia'].addEventListener('click', () => {
    camera.ia = !camera.ia;
    marcarBotao(el['botao-ia'], camera.ia);
    el['botao-ia'].setAttribute('aria-label', `Captura Inteligente ${camera.ia ? 'ligada' : 'desligada'}`);
    UI.aviso(camera.ia ? 'Captura Inteligente ligada' : 'Captura Inteligente desligada', { icone: 'ia' });
    atualizarTela();
  });
  el['botao-virar'].addEventListener('click', virarCamera);

  el.zoom.querySelectorAll('[data-zoom]').forEach((botao) => {
    botao.addEventListener('click', () => definirZoom(Number(botao.dataset.zoom)));
  });

  el['sugestao-aplicar'].addEventListener('click', () => {
    const sugerido = modoSugerido();
    trocarModo(sugerido);
    UI.aviso(`Modo ${nomeDoModo(sugerido)} ativado`, { icone: 'ia' });
  });
  el['sugestao-fechar'].addEventListener('click', () => {
    camera.sugestaoDispensada = modoSugerido();
    atualizarSugestao();
  });

  el['guia-minimizar'].addEventListener('click', () => {
    camera.guiaOculto = !camera.guiaOculto;
    el['guia-passos'].classList.toggle('hidden', camera.guiaOculto);
    el['guia-minimizar'].textContent = camera.guiaOculto ? 'Mostrar' : 'Ocultar';
    el['guia-minimizar'].setAttribute('aria-expanded', String(!camera.guiaOculto));
  });
  el['guia-passos'].querySelectorAll('[data-acao]').forEach((botao) => {
    botao.addEventListener('click', () => {
      if (botao.dataset.acao === 'modo') trocarModo('noturno');
      if (botao.dataset.acao === 'aura') definirAura(true);
    });
  });

  // Tocar no visor foca; deslizar troca o modo
  let inicioX = null;
  let inicioY = null;
  el.visor.addEventListener('pointerdown', (e) => { inicioX = e.clientX; inicioY = e.clientY; });
  el.visor.addEventListener('pointerup', (e) => {
    if (inicioX === null || e.target.closest('button, .cartao-visor, .permissao')) return;
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) mudarModoRelativo(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) focar(e);
    inicioX = null;
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.painel-fundo')) return;
    if (e.key === 'ArrowRight') mudarModoRelativo(1);
    if (e.key === 'ArrowLeft') mudarModoRelativo(-1);
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); capturar(); }
  });
}

function trocarModo(chave) {
  if (camera.gravando) return;
  camera.modo = chave;
  atualizarTela();
}

function mudarModoRelativo(passo) {
  const chaves = Dados.MODOS.map((m) => m.chave);
  const indice = chaves.indexOf(camera.modo) + passo;
  if (indice >= 0 && indice < chaves.length) trocarModo(chaves[indice]);
}

function modoSugerido() {
  return Dados.sugerirModo(camera.luminosidade, camera.frontal);
}

function nomeDoModo(chave) {
  return Dados.MODOS.find((m) => m.chave === chave).nome;
}

/* -------------------------------------------------------------
   4. ZOOM, LANTERNA, LOCALIZAÇÃO
   ------------------------------------------------------------- */
function definirZoom(valor) {
  camera.zoom = valor;
  el.zoom.querySelectorAll('[data-zoom]').forEach((b) => {
    const ativo = Number(b.dataset.zoom) === valor;
    b.classList.toggle('ativo', ativo);
    b.textContent = ativo ? `${b.dataset.zoom}x` : b.dataset.zoom;
  });

  // Zoom do próprio aparelho quando existe; senão, zoom digital
  if (camera.zoomNativo) aplicarZoomNativo(valor);
  atualizarVisor();
}

function aplicarZoomNativo(valor) {
  const { min, max } = camera.zoomNativo;
  const alvo = Math.min(max, Math.max(min, valor * min || valor));
  camera.trilhaVideo.applyConstraints({ advanced: [{ zoom: alvo }] }).catch(() => {});
}

function aplicarTorch(ligada) {
  if (!camera.temTorch || !camera.trilhaVideo) return Promise.resolve();
  return camera.trilhaVideo.applyConstraints({ advanced: [{ torch: ligada }] }).catch(() => {});
}

function alternarFlash() {
  const ordem = ['off', 'auto', 'on'];
  camera.flash = ordem[(ordem.indexOf(camera.flash) + 1) % ordem.length];
  const info = {
    off: { icone: 'flashOff', texto: 'Flash desligado' },
    auto: { icone: 'flash', texto: 'Flash automático' },
    on: { icone: 'flash', texto: 'Flash ligado' },
  }[camera.flash];

  const botao = el['botao-flash'];
  botao.innerHTML = `<span class="w-5 h-5 relative">${Icones.svg(info.icone)}${camera.flash === 'auto' ? '<b class="absolute -right-1.5 -bottom-1 text-[9px]">A</b>' : ''}</span>`;
  botao.setAttribute('aria-label', info.texto);
  marcarBotao(botao, camera.flash !== 'off');

  const semLuz = !camera.temTorch && !camera.frontal;
  UI.aviso(semLuz && camera.flash !== 'off' ? 'Sem lanterna neste aparelho: a foto será clareada' : info.texto, { icone: info.icone, duracao: 1800 });
}

function definirAura(ligada) {
  camera.aura = ligada;
  marcarBotao(el['botao-aura'], ligada);
  // Frontal: a própria tela vira luz. Traseira: usa a lanterna, se houver.
  el.visor.classList.toggle('aura-ativa', ligada && camera.frontal);
  if (!camera.frontal) aplicarTorch(ligada);

  if (ligada) {
    const como = camera.frontal ? 'a tela clareia o rosto' : (camera.temTorch ? 'lanterna ligada' : 'realce aplicado na imagem');
    UI.aviso(`Aura Light: ${como}`, { icone: 'lampada', duracao: 1800 });
  }
  atualizarTela();
}

async function alternarLocal() {
  const ligado = !Dados.preferencia('salvarLocal');

  if (!ligado) {
    Dados.preferencia('salvarLocal', false);
    camera.local = null;
    marcarBotao(el['botao-local'], false);
    UI.aviso('Localização desligada', { icone: 'local', duracao: 1500 });
    return;
  }

  if (!navigator.geolocation) {
    UI.aviso('Este navegador não informa a localização', { icone: 'info' });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (posicao) => {
      const { latitude, longitude } = posicao.coords;
      camera.local = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      Dados.preferencia('salvarLocal', true);
      marcarBotao(el['botao-local'], true);
      UI.aviso('Localização ligada', { icone: 'local', duracao: 1500 });
    },
    () => UI.aviso('Sem acesso à localização. Libere a permissão no navegador.', { icone: 'info', duracao: 3500 }),
    { enableHighAccuracy: false, timeout: 8000 },
  );
}

function marcarBotao(botao, ativo) {
  botao.classList.toggle('text-sinal', ativo);
  botao.setAttribute('aria-pressed', String(ativo));
}

async function virarCamera() {
  if (camera.gravando) return;
  camera.frontal = !camera.frontal;
  if (camera.aura) definirAura(false);
  pararTudo();
  await iniciarCamera();
}

function focar(evento) {
  const area = el.visor.getBoundingClientRect();
  el.foco.style.left = `${evento.clientX - area.left}px`;
  el.foco.style.top = `${evento.clientY - area.top}px`;
  el.foco.classList.remove('ativo');
  void el.foco.offsetWidth;
  el.foco.classList.add('ativo');
}

/* -------------------------------------------------------------
   5. LEITURA DA CENA (Captura Inteligente)
   ------------------------------------------------------------- */

/** Calcula o brilho médio da imagem da câmera, de 0 a 100. */
function analisarLuz() {
  const video = el['visor-video'];
  if (!video.videoWidth) return;

  const ctx = el['canvas-analise'].getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 32, 24);
  const pixels = ctx.getImageData(0, 0, 32, 24).data;

  let soma = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    // Luminância percebida pelo olho humano
    soma += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const nova = Math.round((soma / (pixels.length / 4) / 255) * 100);

  // Suaviza a medição para o número não ficar tremendo na tela
  const anterior = camera.luminosidade;
  camera.luminosidade = Math.round(anterior * 0.7 + nova * 0.3);
  if (camera.luminosidade !== anterior) atualizarTela();
}

/* -------------------------------------------------------------
   6. ATUALIZAÇÃO DA TELA
   ------------------------------------------------------------- */
function atualizarTela() {
  atualizarVisor();
  atualizarEtiquetas();
  atualizarModos();
  atualizarSugestao();
  atualizarGuia();
  atualizarDisparador();
}

function atualizarVisor() {
  const modoEfeito = camera.modo === 'video' ? 'foto' : camera.modo;
  const filtro = Dados.processamentoDoModo(camera.luminosidade, modoEfeito, camera.aura) || 'none';
  const video = el['visor-video'];
  video.style.filter = filtro;
  // Zoom digital só quando o aparelho não faz zoom por conta própria
  video.style.transform = camera.zoomNativo ? '' : `scale(${camera.zoom})`;
  el.vinheta.classList.toggle('hidden', camera.modo !== 'retrato');
}

function atualizarEtiquetas() {
  const escura = camera.luminosidade <= 25;
  const cena = !camera.pronta ? 'Lendo a cena…'
    : camera.frontal ? 'Selfie'
      : escura ? 'Ambiente escuro' : 'Cena com boa luz';

  el['texto-cena'].textContent = camera.ia ? cena : 'IA desligada';
  el['texto-luz'].textContent = camera.pronta ? `${camera.luminosidade} lux` : '—';
  el['icone-luz'].innerHTML = Icones.svg(escura ? 'lua' : 'sol');
  el['etiqueta-luz'].classList.toggle('text-sinal', escura);
  el['etiqueta-luz'].classList.toggle('hidden', camera.gravando);
  el['etiqueta-gravando'].classList.toggle('hidden', !camera.gravando);
}

function atualizarModos() {
  const sugerido = modoSugerido();
  el.modos.querySelectorAll('[data-modo]').forEach((botao) => {
    const ativo = botao.dataset.modo === camera.modo;
    botao.classList.toggle('ativo', ativo);
    botao.setAttribute('aria-selected', String(ativo));
    botao.classList.toggle('sugerido', camera.ia && camera.pronta && botao.dataset.modo === sugerido && !ativo);
    botao.disabled = camera.gravando && !ativo;
    botao.classList.toggle('opacity-30', camera.gravando && !ativo);
  });
}

function atualizarSugestao() {
  const sugerido = modoSugerido();
  const textos = {
    noturno: { icone: 'lua',    titulo: 'Cena escura',    texto: 'Use o modo Noturno para clarear.' },
    retrato: { icone: 'pessoa', titulo: 'Selfie',         texto: 'Use o modo Retrato para destacar você.' },
    foto:    { icone: 'sol',    titulo: 'Boa iluminação', texto: 'O modo Foto é o mais rápido aqui.' },
  };
  const t = textos[sugerido];

  const mostrar = camera.ia
    && camera.pronta
    && !camera.gravando
    && camera.modo !== 'video'
    && camera.modo !== sugerido
    && camera.sugestaoDispensada !== sugerido;

  if (mostrar) {
    el['sugestao-icone'].innerHTML = Icones.svg(t.icone);
    el['sugestao-titulo'].textContent = t.titulo;
    el['sugestao-texto'].textContent = t.texto;
    el['sugestao-aplicar'].setAttribute('aria-label', `Ativar modo ${nomeDoModo(sugerido)}`);
  }
  el.sugestao.classList.toggle('escondido', !mostrar);
  el.sugestao.setAttribute('aria-hidden', String(!mostrar));
}

function atualizarGuia() {
  const mostrar = camera.ia && camera.pronta && camera.luminosidade <= 25 && !camera.gravando;
  el['guia-luz'].classList.toggle('escondido', !mostrar);
  el['guia-luz'].setAttribute('aria-hidden', String(!mostrar));

  const feitos = { modo: camera.modo === 'noturno', aura: camera.aura };
  el['guia-passos'].querySelectorAll('[data-passo]').forEach((passo) => {
    const chave = passo.dataset.passo;
    if (chave in feitos) {
      passo.classList.toggle('feito', feitos[chave]);
      const botao = passo.querySelector('[data-acao]');
      if (botao) botao.classList.toggle('hidden', feitos[chave]);
    }
  });
}

function atualizarDisparador() {
  const d = el.disparador;
  d.classList.toggle('video', camera.modo === 'video');
  d.classList.toggle('noturno', camera.modo === 'noturno');
  d.classList.toggle('gravando', camera.gravando);
  const rotulos = { video: camera.gravando ? 'Parar gravação' : 'Iniciar gravação', noturno: 'Tirar foto noturna' };
  d.setAttribute('aria-label', rotulos[camera.modo] || 'Tirar foto');
}

function atualizarUltimaFoto(animar) {
  const ultima = Dados.listarMidias()[0];
  const botao = el['ultima-foto'];
  if (!ultima) {
    botao.innerHTML = '';
    botao.href = 'galeria.html';
    return;
  }
  botao.innerHTML = UI.miniatura(ultima);
  botao.href = `foto.html?id=${ultima.id}&de=camera`;
  if (animar) {
    botao.classList.remove('pulo');
    void botao.offsetWidth;
    botao.classList.add('pulo');
  }
}

/* -------------------------------------------------------------
   7. CAPTURA
   ------------------------------------------------------------- */
async function capturar() {
  if (!camera.pronta || camera.ocupado) return;
  if (camera.modo === 'video') { alternarGravacao(); return; }

  camera.ocupado = true;
  el.disparador.disabled = true;

  try {
    // Modo Noturno junta a luz por alguns instantes: peça firmeza
    if (camera.modo === 'noturno') {
      await estabilizar(camera.luminosidade <= 25 ? 2000 : 1000);
    }

    const inicio = performance.now();
    const usouFlash = camera.flash === 'on' || (camera.flash === 'auto' && camera.luminosidade <= 25);

    // Flash: lanterna atrás, tela branca na frente
    if (usouFlash && !camera.frontal) await aplicarTorch(true);
    if (usouFlash && camera.frontal) await clarearTela(220);

    const { blob, miniatura, largura, altura, processamento } = await tirarFoto();

    if (usouFlash && !camera.frontal && !camera.aura) await aplicarTorch(false);
    animarClarao();

    const midia = await Dados.adicionarMidia({
      tipo: 'F',
      modo: camera.modo,
      luminosidade: camera.luminosidade,
      auraLight: camera.aura,
      frontal: camera.frontal,
      contexto: Dados.definirContexto({ tipo: 'F', frontal: camera.frontal, luminosidade: camera.luminosidade }),
      resolucao: `${largura}x${altura}`,
      local: Dados.preferencia('salvarLocal') && camera.local ? camera.local : 'Sem localização',
      mime: 'image/jpeg',
      miniatura,
      processamento,
    }, blob);

    if (!midia) {
      UI.aviso('Não há espaço para salvar. Apague alguns itens na galeria.', { icone: 'info', duracao: 4000 });
      return;
    }

    const ms = Math.max(1, Math.round(performance.now() - inicio));
    atualizarUltimaFoto(true);
    UI.aviso(`Foto salva em ${ms} ms, ${Dados.formatarTamanho(blob.size)}`, {
      icone: 'velocidade',
      acao: { texto: 'Ver', aoClicar: () => { location.href = `foto.html?id=${midia.id}&de=camera`; } },
    });
  } catch (erro) {
    console.error(erro);
    UI.aviso('Não foi possível tirar a foto. Tente de novo.', { icone: 'info' });
  } finally {
    camera.ocupado = false;
    el.disparador.disabled = false;
  }
}

/**
 * Desenha o quadro atual do vídeo num canvas, já com zoom digital,
 * espelhamento da selfie e o tratamento do modo aplicados.
 */
async function tirarFoto() {
  const video = el['visor-video'];
  const largura = video.videoWidth;
  const altura = video.videoHeight;

  // Recorte central quando o zoom é digital
  const fator = camera.zoomNativo ? 1 : camera.zoom;
  const recorteL = largura / fator;
  const recorteA = altura / fator;
  const recorteX = (largura - recorteL) / 2;
  const recorteY = (altura - recorteA) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(recorteL);
  canvas.height = Math.round(recorteA);
  const ctx = canvas.getContext('2d');

  // A selfie é salva como a pessoa vê na tela
  if (camera.frontal) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // Grava o tratamento do modo na própria imagem, quando o navegador permite
  const filtro = Dados.processamentoDoModo(camera.luminosidade, camera.modo, camera.aura);
  const suportaFiltro = typeof ctx.filter === 'string';
  if (filtro && suportaFiltro) ctx.filter = filtro;

  ctx.drawImage(video, recorteX, recorteY, recorteL, recorteA, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Modo Retrato: escurece as bordas para destacar o centro
  if (camera.modo === 'retrato') aplicarVinheta(ctx, canvas.width, canvas.height);

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const miniatura = gerarMiniatura(canvas);

  return {
    blob,
    miniatura,
    largura: canvas.width,
    altura: canvas.height,
    // Se o navegador não aplicou o filtro na imagem, ele fica na ficha
    processamento: suportaFiltro ? '' : filtro,
  };
}

function aplicarVinheta(ctx, largura, altura) {
  const gradiente = ctx.createRadialGradient(
    largura / 2, altura / 2, Math.min(largura, altura) * 0.35,
    largura / 2, altura / 2, Math.max(largura, altura) * 0.72,
  );
  gradiente.addColorStop(0, 'rgba(0,0,0,0)');
  gradiente.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, largura, altura);
}

/** Imagem pequena (320 px) que a galeria usa para carregar rápido. */
function gerarMiniatura(origem) {
  const lado = 320;
  const escala = lado / Math.max(origem.width, origem.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(origem.width * escala);
  canvas.height = Math.round(origem.height * escala);
  canvas.getContext('2d').drawImage(origem, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function estabilizar(tempo) {
  return new Promise((resolver) => {
    const passoFirme = el['guia-passos'].querySelector('[data-passo="firme"]');
    el.estabilizar.style.setProperty('--tempo', `${tempo}ms`);
    el.estabilizar.classList.add('ativo');
    passoFirme.classList.add('feito');
    setTimeout(() => {
      el.estabilizar.classList.remove('ativo');
      passoFirme.classList.remove('feito');
      resolver();
    }, tempo);
  });
}

/** Deixa a tela branca por alguns instantes: é o flash da câmera frontal. */
function clarearTela(tempo) {
  return new Promise((resolver) => {
    const clarao = el['flash-captura'];
    clarao.style.background = '#fff';
    clarao.style.opacity = '1';
    setTimeout(() => {
      clarao.style.opacity = '';
      resolver();
    }, tempo);
  });
}

function animarClarao() {
  const clarao = el['flash-captura'];
  clarao.style.background = 'rgba(255,255,255,.6)';
  clarao.classList.remove('disparar');
  void clarao.offsetWidth;
  clarao.classList.add('disparar');
}

/* -------------------------------------------------------------
   8. GRAVAÇÃO DE VÍDEO
   ------------------------------------------------------------- */
async function alternarGravacao() {
  if (camera.gravando) { pararGravacao(); return; }
  if (typeof MediaRecorder === 'undefined') {
    UI.aviso('Este navegador não grava vídeo', { icone: 'info' });
    return;
  }

  // Tenta gravar com som; sem permissão, grava só a imagem
  let trilhas = [camera.trilhaVideo];
  let comSom = false;
  try {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
    trilhas = trilhas.concat(audio.getAudioTracks());
    comSom = true;
  } catch (erro) {
    comSom = false;
  }

  const formatos = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const formato = formatos.find((f) => MediaRecorder.isTypeSupported(f)) || '';
  const pedacos = [];

  try {
    camera.gravador = new MediaRecorder(new MediaStream(trilhas), formato ? { mimeType: formato } : undefined);
  } catch (erro) {
    UI.aviso('Não foi possível iniciar a gravação', { icone: 'info' });
    return;
  }

  camera.gravador.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
  camera.gravador.onstop = () => salvarVideo(pedacos, formato, trilhas);
  camera.gravador.start(500);

  camera.gravando = true;
  camera.inicioGravacao = Date.now();
  el['tempo-gravacao'].textContent = '0:00';
  camera.relogioGravacao = setInterval(() => {
    const segundos = (Date.now() - camera.inicioGravacao) / 1000;
    el['tempo-gravacao'].textContent = Dados.formatarDuracao(segundos);
    if (segundos >= LIMITE_VIDEO) {
      pararGravacao();
      UI.aviso(`Gravação encerrada em ${LIMITE_VIDEO} s`, { icone: 'relogio' });
    }
  }, 250);

  if (!comSom) UI.aviso('Gravando sem som: o microfone não foi liberado', { icone: 'info', duracao: 3000 });
  atualizarTela();
}

function pararGravacao() {
  if (!camera.gravando) return;
  clearInterval(camera.relogioGravacao);
  camera.gravando = false;
  camera.gravador.stop();
  atualizarTela();
}

async function salvarVideo(pedacos, formato, trilhas) {
  // Desliga o microfone assim que a gravação termina
  trilhas.filter((t) => t.kind === 'audio').forEach((t) => t.stop());

  const duracao = Math.max(1, Math.round((Date.now() - camera.inicioGravacao) / 1000));
  const blob = new Blob(pedacos, { type: formato || 'video/webm' });

  // A capa do vídeo é o quadro atual da câmera
  const video = el['visor-video'];
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const midia = await Dados.adicionarMidia({
    tipo: 'V',
    modo: 'video',
    duracao,
    luminosidade: camera.luminosidade,
    auraLight: camera.aura,
    frontal: camera.frontal,
    contexto: 'videos',
    resolucao: `${canvas.width}x${canvas.height}`,
    local: Dados.preferencia('salvarLocal') && camera.local ? camera.local : 'Sem localização',
    mime: blob.type,
    miniatura: gerarMiniatura(canvas),
  }, blob);

  if (!midia) {
    UI.aviso('Não há espaço para salvar o vídeo. Apague alguns itens na galeria.', { icone: 'info', duracao: 4000 });
    return;
  }

  atualizarUltimaFoto(true);
  UI.aviso(`Vídeo de ${Dados.formatarDuracao(duracao)} salvo, ${Dados.formatarTamanho(blob.size)}`, {
    icone: 'video',
    acao: { texto: 'Ver', aoClicar: () => { location.href = `foto.html?id=${midia.id}&de=camera`; } },
  });
}
