/* =============================================================
   foto.js
   Visualização de uma foto ou vídeo:
   - navegar entre fotos (setas, teclado ou deslizando)
   - favoritar, apagar e adicionar a álbum
   - edição leve (filtros, brilho, contraste e ajuste automático)
   - Compartilhamento Rápido
   ============================================================= */

const visualizador = {
  ids: [],
  indice: 0,
  midia: null,
  editando: false,
  rascunho: null,       // { filtro, brilho, contraste } durante a edição
  url: null,            // endereço temporário do arquivo original
};

const $ = (id) => document.getElementById(id);

/* -------------------------------------------------------------
   1. INICIALIZAÇÃO
   ------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const origem = params.get('de') === 'camera' ? 'camera.html' : 'galeria.html';
  $('botao-voltar').href = origem;

  visualizador.ids = Dados.listarMidias().map((m) => m.id);
  visualizador.indice = Math.max(0, visualizador.ids.indexOf(Number(params.get('id'))));

  if (!visualizador.ids.length) {
    mostrarVazio();
    return;
  }

  montarFiltros();
  ligarEventos();
  mostrar();
});

function mostrarVazio() {
  $('palco').innerHTML = `
    <div class="absolute inset-0 grid place-items-center text-center p-6">
      <div>
        <p class="font-display text-lg font-semibold mb-2">Nenhuma foto por aqui</p>
        <p class="text-white/60 mb-5">Tire uma foto para ver, editar e enviar.</p>
        <a href="camera.html" class="botao bg-sinal text-jovi-900">Abrir câmera</a>
      </div>
    </div>`;
  $('acoes').classList.add('hidden');
  $('botao-info').classList.add('hidden');
  $('imagem-previa').classList.add('hidden');
}

/* -------------------------------------------------------------
   2. EXIBIÇÃO
   ------------------------------------------------------------- */
function mostrar() {
  liberarUrl();
  const m = Dados.obterMidia(visualizador.ids[visualizador.indice]);
  visualizador.midia = m;

  const ehVideo = m.tipo === 'V';
  const img = $('imagem');
  const previa = $('imagem-previa');
  const video = $('video');

  // Mostra primeiro a miniatura (instantânea) e depois o arquivo original
  previa.src = Dados.srcMidia(m);
  previa.style.filter = Dados.filtroCss(m);
  previa.classList.toggle('opacity-0', false);
  previa.classList.toggle('hidden', ehVideo);
  img.classList.toggle('hidden', ehVideo);
  video.classList.toggle('hidden', !ehVideo);
  img.alt = `${ehVideo ? 'Vídeo' : 'Foto'} de ${Dados.formatarData(m.data)}`;
  aplicarFiltro();

  carregarOriginal(m);

  $('titulo-foto').textContent = `${Dados.grupoMomento(m.data)}, ${Dados.formatarHora(m.data)}`;
  $('subtitulo-foto').textContent = [
    `modo ${Dados.nomeModo(m.modoId)}`,
    m.local !== 'Sem localização' ? m.local : '',
  ].filter(Boolean).join(', ');

  $('acao-editar').disabled = ehVideo;
  $('acao-editar').classList.toggle('opacity-30', ehVideo);

  atualizarFavorito();

  $('anterior').classList.toggle('invisible', visualizador.indice === 0);
  $('proxima').classList.toggle('invisible', visualizador.indice === visualizador.ids.length - 1);

  // Mantém o endereço atualizado (dá para recarregar sem perder a foto)
  const params = new URLSearchParams(location.search);
  params.set('id', m.id);
  history.replaceState(null, '', `foto.html?${params}`);

  // Pré-carrega a miniatura seguinte: a troca fica instantânea
  const proximo = Dados.obterMidia(visualizador.ids[visualizador.indice + 1]);
  if (proximo) new Image().src = Dados.srcMidia(proximo);
}

/** Busca o arquivo original guardado no aparelho e mostra em tela cheia. */
async function carregarOriginal(m) {
  const url = await Dados.urlDaMidia(m);
  // Se o usuário trocou de foto enquanto carregava, descarta
  if (!visualizador.midia || visualizador.midia.id !== m.id) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  visualizador.url = url && url.startsWith('blob:') ? url : null;

  if (m.tipo === 'V') {
    $('video').src = url || '';
    return;
  }
  const img = $('imagem');
  img.onload = () => $('imagem-previa').classList.add('opacity-0');
  img.src = url || Dados.srcMidia(m);
}

function liberarUrl() {
  const video = $('video');
  video.pause();
  video.removeAttribute('src');
  if (visualizador.url) {
    URL.revokeObjectURL(visualizador.url);
    visualizador.url = null;
  }
}

function aplicarFiltro() {
  const filtro = Dados.filtroCss(visualizador.midia, visualizador.rascunho || {});
  $('imagem').style.filter = filtro;
  $('imagem-previa').style.filter = filtro;
}

function atualizarFavorito() {
  const fav = visualizador.midia.favorito;
  const botao = $('acao-favoritar');
  botao.querySelector('[data-icon]').dataset.icon = fav ? 'coracaoCheio' : 'coracao';
  botao.querySelector('span:last-child').textContent = fav ? 'Favorita' : 'Favoritar';
  botao.classList.toggle('text-pink-400', fav);
  botao.setAttribute('aria-pressed', String(fav));
  Icones.renderizar(botao);
}

function navegar(passo) {
  if (visualizador.editando) return;
  const novo = visualizador.indice + passo;
  if (novo < 0 || novo >= visualizador.ids.length) return;
  visualizador.indice = novo;
  mostrar();
}

/* -------------------------------------------------------------
   3. EVENTOS
   ------------------------------------------------------------- */
function ligarEventos() {
  $('anterior').addEventListener('click', () => navegar(-1));
  $('proxima').addEventListener('click', () => navegar(1));

  // Deslizar para os lados troca de foto
  let inicioX = null;
  $('palco').addEventListener('pointerdown', (e) => { inicioX = e.clientX; });
  $('palco').addEventListener('pointerup', (e) => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX;
    if (Math.abs(dx) > 50) navegar(dx < 0 ? 1 : -1);
    inicioX = null;
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.painel-fundo') || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') navegar(1);
    if (e.key === 'ArrowLeft') navegar(-1);
  });

  $('acao-favoritar').addEventListener('click', () => {
    const novo = !visualizador.midia.favorito;
    Dados.definirFavorito([visualizador.midia.id], novo);
    atualizarFavorito();
    UI.aviso(novo ? 'Adicionada às favoritas' : 'Removida das favoritas', { icone: 'coracaoCheio', duracao: 1500 });
  });

  $('acao-compartilhar').addEventListener('click', () => UI.compartilhar([visualizador.midia.id]));
  $('acao-album').addEventListener('click', () => UI.escolherAlbum([visualizador.midia.id]));
  $('acao-excluir').addEventListener('click', excluir);
  $('acao-editar').addEventListener('click', abrirEditor);
  $('botao-info').addEventListener('click', mostrarDetalhes);

  // Editor
  $('ajuste-brilho').addEventListener('input', (e) => atualizarRascunho({ brilho: Number(e.target.value) }));
  $('ajuste-contraste').addEventListener('input', (e) => atualizarRascunho({ contraste: Number(e.target.value) }));
  $('auto-ajuste').addEventListener('click', ajusteAutomatico);
  $('editor-cancelar').addEventListener('click', () => fecharEditor(false));
  $('editor-salvar').addEventListener('click', () => fecharEditor(true));
}

/* -------------------------------------------------------------
   4. EDIÇÃO LEVE
   ------------------------------------------------------------- */
function montarFiltros() {
  $('filtros').innerHTML = Object.entries(Dados.FILTROS).map(([chave, f]) => `
    <button class="shrink-0 flex flex-col items-center gap-1 text-xs font-semibold" role="radio" aria-checked="false" data-filtro="${chave}">
      <span class="w-16 h-16 rounded-xl overflow-hidden border-2 border-transparent block" data-moldura>
        <img alt="" class="w-full h-full object-cover" />
      </span>
      ${f.nome}
    </button>`).join('');

  $('filtros').querySelectorAll('[data-filtro]').forEach((botao) => {
    botao.addEventListener('click', () => atualizarRascunho({ filtro: botao.dataset.filtro }));
  });
}

function abrirEditor() {
  if (visualizador.midia.tipo === 'V') return;
  const m = visualizador.midia;
  visualizador.editando = true;
  visualizador.rascunho = { filtro: m.filtro, brilho: m.brilho, contraste: m.contraste };

  // Miniaturas dos filtros com a foto atual
  $('filtros').querySelectorAll('[data-filtro]').forEach((botao) => {
    const img = botao.querySelector('img');
    img.src = Dados.srcMidia(m);
    img.style.filter = Dados.filtroCss(m, { filtro: botao.dataset.filtro, brilho: 100, contraste: 100 });
  });

  const nomeContexto = (Dados.CONTEXTOS[m.contexto] || Dados.CONTEXTOS.geral).nome.toLowerCase();
  $('texto-auto').textContent = `Ajuste automático para ${nomeContexto}`;

  $('acoes').classList.add('hidden');
  $('editor').classList.remove('hidden');
  $('anterior').classList.add('invisible');
  $('proxima').classList.add('invisible');
  atualizarRascunho({});
}

function atualizarRascunho(campos) {
  Object.assign(visualizador.rascunho, campos);
  const r = visualizador.rascunho;

  $('ajuste-brilho').value = r.brilho;
  $('ajuste-contraste').value = r.contraste;
  $('valor-brilho').textContent = formatarAjuste(r.brilho);
  $('valor-contraste').textContent = formatarAjuste(r.contraste);

  $('filtros').querySelectorAll('[data-filtro]').forEach((botao) => {
    const ativo = botao.dataset.filtro === r.filtro;
    botao.setAttribute('aria-checked', String(ativo));
    botao.classList.toggle('text-sinal', ativo);
    botao.querySelector('[data-moldura]').classList.toggle('border-sinal', ativo);
  });

  aplicarFiltro();
}

/** Mostra o ajuste como -50 a +50 (mais fácil de entender que 50 a 150). */
function formatarAjuste(valor) {
  const diferenca = valor - 100;
  return diferenca > 0 ? `+${diferenca}` : String(diferenca);
}

/** Escolhe filtro e ajustes de acordo com o assunto da foto. */
function ajusteAutomatico() {
  const receitas = {
    noite:     { filtro: 'vivido', brilho: 115, contraste: 106 },
    pessoas:   { filtro: 'quente', brilho: 105, contraste: 100 },
    paisagens: { filtro: 'vivido', brilho: 100, contraste: 110 },
    comida:    { filtro: 'vivido', brilho: 106, contraste: 104 },
    cidade:    { filtro: 'frio',   brilho: 102, contraste: 108 },
    geral:     { filtro: 'vivido', brilho: 105, contraste: 104 },
  };
  atualizarRascunho(receitas[visualizador.midia.contexto] || receitas.geral);
  UI.aviso('Ajuste automático aplicado', { icone: 'ia', duracao: 1500 });
}

function fecharEditor(salvar) {
  if (salvar) {
    Dados.atualizarMidia(visualizador.midia.id, visualizador.rascunho);
    UI.aviso('Edição salva', {
      acao: { texto: 'Enviar', aoClicar: () => UI.compartilhar([visualizador.midia.id]) },
    });
  }
  visualizador.editando = false;
  visualizador.rascunho = null;
  $('editor').classList.add('hidden');
  $('acoes').classList.remove('hidden');
  mostrar();
}

/* -------------------------------------------------------------
   5. DETALHES E EXCLUSÃO
   ------------------------------------------------------------- */
function mostrarDetalhes() {
  const m = visualizador.midia;
  const linhas = [
    ['relogio', 'Data', new Date(m.data).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })],
    ['local', 'Local', m.local],
    ['camera', 'Câmera', m.frontal ? 'Frontal' : 'Traseira'],
    ['camera', 'Modo', Dados.nomeModo(m.modoId)],
    ['camadas', 'Assunto', (Dados.CONTEXTOS[m.contexto] || Dados.CONTEXTOS.geral).nome],
    [m.luminosidade <= 25 ? 'lua' : 'sol', 'Luminosidade', `${m.luminosidade} lux${m.luminosidade <= 25 ? ' (pouca luz)' : ''}`],
    ['lampada', 'Aura Light', m.auraLight ? 'Ligada' : 'Desligada'],
    ['imagem', 'Resolução', m.resolucao],
    ['velocidade', 'Tamanho', Dados.formatarTamanho(m.tamanho)],
  ];
  if (m.tipo === 'V') linhas.push(['video', 'Duração', Dados.formatarDuracao(m.duracao)]);

  UI.painel(`
    <dl class="divide-y divide-white/10">
      ${linhas.map(([icone, rotulo, valor]) => `
        <div class="flex items-center gap-3 py-3">
          <span data-icon="${icone}" class="w-5 h-5 text-sinal shrink-0"></span>
          <dt class="text-white/60 w-28 shrink-0">${rotulo}</dt>
          <dd class="font-semibold">${UI.esc(valor)}</dd>
        </div>`).join('')}
    </dl>`, { titulo: 'Detalhes', escuro: true });
}

async function excluir() {
  const m = visualizador.midia;
  const ok = await UI.confirmar({
    titulo: m.tipo === 'V' ? 'Apagar vídeo?' : 'Apagar foto?',
    texto: 'Esta ação não pode ser desfeita.',
    botao: 'Apagar',
    perigo: true,
  });
  if (!ok) return;

  liberarUrl();
  Dados.excluirMidias([m.id]);
  visualizador.ids = visualizador.ids.filter((id) => id !== m.id);
  UI.aviso(m.tipo === 'V' ? 'Vídeo apagado' : 'Foto apagada', { icone: 'lixeira' });

  if (!visualizador.ids.length) {
    mostrarVazio();
    return;
  }
  visualizador.indice = Math.min(visualizador.indice, visualizador.ids.length - 1);
  mostrar();
}