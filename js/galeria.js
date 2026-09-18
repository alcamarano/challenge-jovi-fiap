/* =============================================================
   galeria.js
   Galeria Inteligente do JOVI Lens.

   - Momentos: fotos agrupadas por dia (Hoje, Ontem...)
   - Assuntos: álbuns automáticos por contexto (noite, pessoas...)
   - Álbuns: criados pelo usuário + automáticos
   - Favoritas
   - Busca, seleção múltipla e sugestões automáticas de uso
   ============================================================= */

const galeria = {
  aba: 'momentos',
  detalhe: null,          // { tipo: 'contexto', chave } ou { tipo: 'album', id }
  busca: '',
  selecionando: false,
  selecionados: new Set(),
};

const conteudo = () => document.getElementById('conteudo');

/* -------------------------------------------------------------
   1. INICIALIZAÇÃO
   ------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Permite abrir direto numa aba: galeria.html?aba=contextos&ctx=noite
  const params = new URLSearchParams(location.search);
  if (params.get('aba')) galeria.aba = params.get('aba');
  if (params.get('ctx')) galeria.detalhe = { tipo: 'contexto', chave: params.get('ctx') };
  if (params.get('album')) galeria.detalhe = { tipo: 'album', id: Number(params.get('album')) };

  document.querySelectorAll('[data-aba]').forEach((botao) => {
    botao.addEventListener('click', () => trocarAba(botao.dataset.aba));
  });

  // Busca com pequeno atraso para não redesenhar a cada tecla
  let espera;
  document.getElementById('busca').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      galeria.busca = e.target.value.trim();
      renderizar();
    }, 150);
  });

  document.getElementById('botao-selecionar').addEventListener('click', () => {
    galeria.selecionando ? sairSelecao() : entrarSelecao();
  });
  ligarBarraSelecao();

  renderizar();
});

function trocarAba(aba) {
  galeria.aba = aba;
  galeria.detalhe = null;
  history.replaceState(null, '', `galeria.html?aba=${aba}`);
  renderizar();
  window.scrollTo({ top: 0 });
}

/* -------------------------------------------------------------
   2. RENDERIZAÇÃO PRINCIPAL
   ------------------------------------------------------------- */
function renderizar() {
  const inicio = performance.now();

  document.querySelectorAll('[data-aba]').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.aba === galeria.aba && !galeria.busca));
  });

  let html;
  if (galeria.busca) html = telaBusca();
  else if (galeria.detalhe) html = telaDetalhe();
  else if (galeria.aba === 'contextos') html = telaAssuntos();
  else if (galeria.aba === 'albuns') html = telaAlbuns();
  else if (galeria.aba === 'favoritas') html = telaFavoritas();
  else html = telaMomentos();

  conteudo().innerHTML = html;
  conteudo().classList.toggle('selecionando', galeria.selecionando);
  Icones.renderizar(conteudo());
  ligarConteudo();
  renderizarSugestoes();

  // Feedback de performance
  const ms = Math.max(1, Math.round(performance.now() - inicio));
  const total = Dados.listarMidias().length;
  document.getElementById('texto-desempenho').textContent =
    `${total} ${total === 1 ? 'item' : 'itens'}, organizados em ${ms} ms`;
}

/* -------------------------------------------------------------
   3. TELAS
   ------------------------------------------------------------- */

/** Momentos: agrupados por dia, com envio do grupo em um toque. */
function telaMomentos() {
  const midias = Dados.listarMidias();
  if (!midias.length) {
    return vazio('imagem', 'Sua galeria está vazia', 'Tire uma foto e ela aparece aqui, já organizada.', 'camera.html', 'Abrir câmera');
  }

  const grupos = {};
  midias.forEach((m) => {
    const g = Dados.grupoMomento(m.data);
    (grupos[g] = grupos[g] || []).push(m);
  });

  return Object.entries(grupos).map(([titulo, itens]) => `
    <section class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-display font-semibold text-jovi-900">
          ${titulo} <span class="text-slate-400 font-sans text-sm font-semibold ml-1">${itens.length}</span>
        </h2>
        <button class="text-sm font-bold text-jovi flex items-center gap-1 px-2 py-1 rounded-full hover:bg-jovi-50"
          data-enviar-grupo="${itens.map((m) => m.id).join(',')}">
          <span data-icon="compartilhar" class="w-4 h-4"></span> Enviar
        </button>
      </div>
      ${grade(itens)}
    </section>`).join('');
}

/** Assuntos: álbuns automáticos montados pelo contexto de cada foto. */
function telaAssuntos() {
  const automaticos = Dados.albunsAutomaticos();
  if (!automaticos.length) {
    return vazio('camadas', 'Nenhum assunto ainda', 'Conforme você fotografa, as fotos são separadas por assunto.', 'camera.html', 'Abrir câmera');
  }
  return `
    <p class="text-sm text-slate-600 mb-4">A galeria separa suas fotos por assunto, sem você precisar fazer nada.</p>
    <ul class="grid grid-cols-2 gap-3">
      ${automaticos.map((a) => cartaoAlbum(a, `data-contexto="${a.chave}"`)).join('')}
    </ul>`;
}

function telaAlbuns() {
  const albuns = Dados.listarAlbuns();
  const automaticos = Dados.albunsAutomaticos();
  return `
    <button id="novo-album" class="w-full flex items-center gap-3 p-4 mb-5 rounded-2xl bg-white border-2 border-dashed border-jovi-200 text-jovi font-bold hover:bg-jovi-50">
      <span data-icon="album" class="w-6 h-6"></span> Criar álbum
    </button>

    <h2 class="font-display font-semibold text-jovi-900 mb-3">Seus álbuns</h2>
    ${albuns.length ? `
      <ul class="grid grid-cols-2 gap-3 mb-7">
        ${albuns.map((a) => cartaoAlbum(a, `data-album="${a.id}"`)).join('')}
      </ul>` : '<p class="text-sm text-slate-600 mb-7">Você ainda não criou álbuns. Selecione fotos e toque em Álbum.</p>'}

    <h2 class="font-display font-semibold text-jovi-900 mb-1">Criados automaticamente</h2>
    <p class="text-sm text-slate-600 mb-3">Atualizados a cada nova foto.</p>
    <ul class="grid grid-cols-2 gap-3">
      ${automaticos.map((a) => cartaoAlbum(a, `data-contexto="${a.chave}"`)).join('')}
    </ul>`;
}

function telaFavoritas() {
  const favoritas = Dados.listarMidias().filter((m) => m.favorito);
  if (!favoritas.length) {
    return vazio('coracao', 'Nenhuma favorita ainda', 'Abra uma foto e toque no coração para guardar aqui as melhores.', null, null);
  }
  return grade(favoritas);
}

/** Detalhe de um assunto ou álbum. */
function telaDetalhe() {
  const d = galeria.detalhe;
  let titulo;
  let midias;
  let acoesExtras = '';

  if (d.tipo === 'contexto') {
    const info = Dados.CONTEXTOS[d.chave];
    if (!info) { galeria.detalhe = null; return telaAssuntos(); }
    titulo = info.nome;
    midias = Dados.listarMidias().filter((m) => m.contexto === d.chave);
  } else {
    const album = Dados.obterAlbum(d.id);
    if (!album) { galeria.detalhe = null; return telaAlbuns(); }
    titulo = album.nome;
    midias = Dados.midiasDoAlbum(album.id);
    acoesExtras = `
      <button class="botao-icone text-red-600" id="excluir-album" aria-label="Apagar álbum">
        <span data-icon="lixeira" class="w-5 h-5"></span>
      </button>`;
  }

  return `
    <div class="flex items-center gap-2 mb-4">
      <button class="botao-icone -ml-2" id="voltar-detalhe" aria-label="Voltar">
        <span data-icon="voltar" class="w-6 h-6"></span>
      </button>
      <div class="flex-1 min-w-0">
        <h2 class="font-display text-xl font-semibold text-jovi-900 truncate">${UI.esc(titulo)}</h2>
        <p class="text-sm text-slate-500">${midias.length} ${midias.length === 1 ? 'item' : 'itens'}</p>
      </div>
      ${midias.length ? `
        <button class="botao botao-primario botao-pequeno" data-enviar-grupo="${midias.map((m) => m.id).join(',')}">
          <span data-icon="compartilhar" class="w-4 h-4"></span> Enviar tudo
        </button>` : ''}
      ${acoesExtras}
    </div>
    ${midias.length ? grade(midias)
      : vazio('pasta', 'Álbum vazio', 'Na aba Momentos, toque em Selecionar, escolha as fotos e toque em Álbum.', null, null)}`;
}

/** Resultado da busca: procura por lugar, assunto, modo, tipo e data. */
function telaBusca() {
  const termo = normalizar(galeria.busca);
  const resultados = Dados.listarMidias().filter((m) => {
    const texto = normalizar([
      m.local,
      Dados.CONTEXTOS[m.contexto]?.nome,
      Dados.nomeModo(m.modoId),
      m.tipo === 'V' ? 'vídeo video' : 'foto',
      Dados.grupoMomento(m.data),
      Dados.formatarData(m.data, false),
      m.favorito ? 'favorita' : '',
    ].join(' '));
    return texto.includes(termo);
  });

  if (!resultados.length) {
    return vazio('busca', `Nada encontrado para "${UI.esc(galeria.busca)}"`, 'Tente buscar por "noite", "retrato", "ontem" ou pelo nome de um lugar.', null, null);
  }
  return `
    <p class="text-sm text-slate-600 mb-3">${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}</p>
    ${grade(resultados)}`;
}

/* -------------------------------------------------------------
   4. PEÇAS DE INTERFACE
   ------------------------------------------------------------- */

/** Grade 3 colunas. Cada imagem começa com efeito de carregamento. */
function grade(midias) {
  return `
    <ul class="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
      ${midias.map((m) => `
        <li>
          <button class="ladrilho bloco-carregando w-full block ${galeria.selecionados.has(m.id) ? 'marcado' : ''}"
            data-id="${m.id}" aria-pressed="${galeria.selecionados.has(m.id)}"
            aria-label="${m.tipo === 'V' ? 'Vídeo' : 'Foto'} em ${UI.esc(m.local)}, ${Dados.formatarData(m.data)}">
            ${UI.miniatura(m)}
            ${m.tipo === 'V' ? `
              <span class="absolute bottom-1 right-1 flex items-center gap-0.5 text-[11px] font-bold text-white bg-black/55 rounded-md px-1.5 py-0.5">
                <span data-icon="play" class="w-2.5 h-2.5"></span>${Dados.formatarDuracao(m.duracao)}
              </span>` : ''}
            ${m.favorito ? '<span data-icon="coracaoCheio" class="absolute bottom-1 left-1 w-4 h-4 text-white drop-shadow"></span>' : ''}
            ${Dados.chaveModo(m.modoId) === 'noturno' ? '<span data-icon="lua" class="absolute top-1 left-1 w-4 h-4 text-sinal drop-shadow"></span>' : ''}
            <span class="marcador"><span data-icon="check"></span></span>
          </button>
        </li>`).join('')}
    </ul>`;
}

function cartaoAlbum(album, atributo) {
  const capas = album.midias.slice(0, 1);
  return `
    <li>
      <button class="w-full text-left group" ${atributo}>
        <span class="block aspect-square rounded-2xl overflow-hidden bg-slate-200 mb-2 relative bloco-carregando">
          ${capas.length ? UI.miniatura(capas[0], 'group-hover:scale-105 transition-transform') : `
            <span class="absolute inset-0 grid place-items-center text-slate-400"><span data-icon="pasta" class="w-10 h-10"></span></span>`}
          ${album.icone ? `
            <span class="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 text-jovi-900 grid place-items-center">
              <span data-icon="${album.icone}" class="w-4 h-4"></span>
            </span>` : ''}
        </span>
        <span class="block font-bold text-jovi-900 truncate">${UI.esc(album.nome)}</span>
        <span class="block text-sm text-slate-500">${album.midias.length} ${album.midias.length === 1 ? 'item' : 'itens'}</span>
      </button>
    </li>`;
}

function vazio(icone, titulo, texto, link, rotulo) {
  return `
    <div class="text-center py-12 px-4">
      <span data-icon="${icone}" class="w-12 h-12 text-jovi-200 mb-3"></span>
      <h2 class="font-display text-lg font-semibold text-jovi-900 mb-1">${titulo}</h2>
      <p class="text-slate-600 mb-5">${texto}</p>
      ${link ? `<a href="${link}" class="botao botao-primario">${rotulo}</a>` : ''}
    </div>`;
}

/** Remove acentos e deixa minúsculo, para a busca achar "vídeo" ou "video". */
function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* -------------------------------------------------------------
   5. EVENTOS DO CONTEÚDO
   ------------------------------------------------------------- */
function ligarConteudo() {
  const area = conteudo();

  // Tira o efeito de carregamento quando a imagem chega
  area.querySelectorAll('.bloco-carregando').forEach((bloco) => {
    const img = bloco.querySelector('img');
    if (!img) { bloco.classList.add('carregado'); return; }
    const pronto = () => bloco.classList.add('carregado');
    if (img.complete) pronto();
    else {
      img.addEventListener('load', pronto, { once: true });
      img.addEventListener('error', pronto, { once: true });
    }
  });

  area.querySelectorAll('[data-id]').forEach(ligarLadrilho);

  area.querySelectorAll('[data-enviar-grupo]').forEach((botao) => {
    botao.addEventListener('click', () => {
      UI.compartilhar(botao.dataset.enviarGrupo.split(',').map(Number));
    });
  });

  area.querySelectorAll('[data-contexto]').forEach((botao) => {
    botao.addEventListener('click', () => abrirDetalhe({ tipo: 'contexto', chave: botao.dataset.contexto }));
  });
  area.querySelectorAll('[data-album]').forEach((botao) => {
    botao.addEventListener('click', () => abrirDetalhe({ tipo: 'album', id: Number(botao.dataset.album) }));
  });

  const voltar = document.getElementById('voltar-detalhe');
  if (voltar) voltar.addEventListener('click', () => trocarAba(galeria.aba));

  const novo = document.getElementById('novo-album');
  if (novo) {
    novo.addEventListener('click', async () => {
      const nome = await UI.pedirTexto({ titulo: 'Novo álbum', rotulo: 'Nome do álbum', placeholder: 'Ex.: Férias 2026', botao: 'Criar álbum' });
      if (nome) {
        const album = Dados.criarAlbum(nome);
        UI.aviso(`Álbum "${album.nome}" criado`);
        renderizar();
      }
    });
  }

  const excluir = document.getElementById('excluir-album');
  if (excluir) {
    excluir.addEventListener('click', async () => {
      const album = Dados.obterAlbum(galeria.detalhe.id);
      const ok = await UI.confirmar({
        titulo: 'Apagar álbum?',
        texto: `O álbum "${album.nome}" será apagado. As fotos continuam na galeria.`,
        botao: 'Apagar álbum',
        perigo: true,
      });
      if (ok) {
        Dados.excluirAlbum(album.id);
        UI.aviso('Álbum apagado', { icone: 'lixeira' });
        trocarAba('albuns');
      }
    });
  }
}

function abrirDetalhe(detalhe) {
  galeria.detalhe = detalhe;
  const parametro = detalhe.tipo === 'contexto' ? `ctx=${detalhe.chave}` : `album=${detalhe.id}`;
  history.replaceState(null, '', `galeria.html?aba=${galeria.aba}&${parametro}`);
  renderizar();
  window.scrollTo({ top: 0 });
}

/** Toque abre a foto; toque longo (ou modo seleção) marca a foto. */
function ligarLadrilho(botao) {
  const id = Number(botao.dataset.id);
  let temporizador = null;
  let foiLongo = false;

  botao.addEventListener('pointerdown', () => {
    foiLongo = false;
    temporizador = setTimeout(() => {
      foiLongo = true;
      if (!galeria.selecionando) entrarSelecao();
      alternarSelecionado(id);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((evento) => {
    botao.addEventListener(evento, () => clearTimeout(temporizador));
  });
  botao.addEventListener('contextmenu', (e) => e.preventDefault());

  botao.addEventListener('click', () => {
    if (foiLongo) return;
    if (galeria.selecionando) alternarSelecionado(id);
    else location.href = `foto.html?id=${id}&de=galeria`;
  });
}

/* -------------------------------------------------------------
   6. SELEÇÃO MÚLTIPLA
   ------------------------------------------------------------- */
function entrarSelecao() {
  galeria.selecionando = true;
  galeria.selecionados.clear();
  document.getElementById('botao-selecionar').textContent = 'Concluir';
  document.getElementById('barra-selecao').classList.remove('hidden');
  document.getElementById('menu').classList.add('hidden');
  conteudo().classList.add('selecionando');
  atualizarBarraSelecao();
}

function sairSelecao() {
  galeria.selecionando = false;
  galeria.selecionados.clear();
  document.getElementById('botao-selecionar').textContent = 'Selecionar';
  document.getElementById('barra-selecao').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  renderizar();
}

function alternarSelecionado(id) {
  if (galeria.selecionados.has(id)) galeria.selecionados.delete(id);
  else galeria.selecionados.add(id);

  conteudo().querySelectorAll(`[data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('marcado', galeria.selecionados.has(id));
    b.setAttribute('aria-pressed', String(galeria.selecionados.has(id)));
  });
  atualizarBarraSelecao();
}

function atualizarBarraSelecao() {
  const n = galeria.selecionados.size;
  document.getElementById('selecao-total').textContent =
    n === 0 ? 'Toque nas fotos' : `${n} ${n === 1 ? 'selecionado' : 'selecionados'}`;
  document.querySelectorAll('.acao-selecao').forEach((b) => b.classList.toggle('opacity-40', n === 0));

  // Se tudo já é favorito, o botão passa a desfavoritar
  const todosFavoritos = n > 0 && [...galeria.selecionados].every((id) => Dados.obterMidia(id)?.favorito);
  const botaoFav = document.querySelector('[data-acao="favoritar"]');
  botaoFav.innerHTML = `<span data-icon="${todosFavoritos ? 'coracaoCheio' : 'coracao'}" class="w-6 h-6"></span> ${todosFavoritos ? 'Desfavoritar' : 'Favoritar'}`;
  Icones.renderizar(botaoFav);
}

function ligarBarraSelecao() {
  document.getElementById('selecao-cancelar').addEventListener('click', sairSelecao);

  document.getElementById('selecao-todos').addEventListener('click', () => {
    const visiveis = [...conteudo().querySelectorAll('[data-id]')].map((b) => Number(b.dataset.id));
    const todosMarcados = visiveis.every((id) => galeria.selecionados.has(id));
    visiveis.forEach((id) => {
      if (todosMarcados || !galeria.selecionados.has(id)) alternarSelecionado(id);
    });
  });

  document.querySelectorAll('.acao-selecao').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const ids = [...galeria.selecionados];
      if (!ids.length) {
        UI.aviso('Toque nas fotos para selecionar', { icone: 'info' });
        return;
      }

      switch (botao.dataset.acao) {
        case 'compartilhar':
          UI.compartilhar(ids, sairSelecao);
          break;

        case 'album':
          UI.escolherAlbum(ids, sairSelecao);
          break;

        case 'favoritar': {
          const todos = ids.every((id) => Dados.obterMidia(id)?.favorito);
          Dados.definirFavorito(ids, !todos);
          UI.aviso(todos ? 'Removido das favoritas' : 'Adicionado às favoritas', { icone: 'coracaoCheio' });
          sairSelecao();
          break;
        }

        case 'excluir': {
          const ok = await UI.confirmar({
            titulo: `Apagar ${ids.length} ${ids.length === 1 ? 'item' : 'itens'}?`,
            texto: 'Esta ação não pode ser desfeita.',
            botao: 'Apagar',
            perigo: true,
          });
          if (ok) {
            Dados.excluirMidias(ids);
            UI.aviso(`${ids.length} ${ids.length === 1 ? 'item apagado' : 'itens apagados'}`, { icone: 'lixeira' });
            sairSelecao();
          }
          break;
        }
      }
    });
  });
}

/* -------------------------------------------------------------
   7. SUGESTÕES AUTOMÁTICAS DE USO
   Calculadas a partir das fotos do usuário.
   ------------------------------------------------------------- */
function renderizarSugestoes() {
  const area = document.getElementById('sugestoes');
  const mostrar = !galeria.busca && !galeria.detalhe && !galeria.selecionando && galeria.aba === 'momentos';
  if (!mostrar) { area.innerHTML = ''; return; }

  const midias = Dados.listarMidias();
  const sugestoes = [];

  // 1. Enviar as fotos de hoje de uma vez
  const deHoje = midias.filter((m) => Dados.grupoMomento(m.data) === 'Hoje');
  if (deHoje.length) {
    sugestoes.push({
      icone: 'compartilhar',
      titulo: `Enviar as ${deHoje.length} de hoje`,
      texto: 'Tudo em um toque, com arquivo otimizado.',
      acao: () => UI.compartilhar(deHoje.map((m) => m.id)),
    });
  }

  // 2. Criar álbum com as fotos de ontem
  const deOntem = midias.filter((m) => Dados.grupoMomento(m.data) === 'Ontem');
  const nomeOntem = `Ontem, ${Dados.formatarData(deOntem[0]?.data || new Date().toISOString(), false)}`;
  const jaTemAlbum = Dados.listarAlbuns().some((a) => a.nome === nomeOntem);
  if (deOntem.length >= 2 && !jaTemAlbum) {
    sugestoes.push({
      icone: 'album',
      titulo: 'Guardar o dia de ontem',
      texto: `Criar um álbum com ${deOntem.length} itens.`,
      acao: () => {
        const album = Dados.criarAlbum(nomeOntem);
        Dados.adicionarAoAlbum(album.id, deOntem.map((m) => m.id));
        UI.aviso(`Álbum "${album.nome}" criado`, { acao: { texto: 'Abrir', aoClicar: () => { galeria.aba = 'albuns'; abrirDetalhe({ tipo: 'album', id: album.id }); } } });
        renderizar();
      },
    });
  }

  // 3. Fotos noturnas reunidas
  const noturnas = midias.filter((m) => m.contexto === 'noite');
  if (noturnas.length >= 2) {
    sugestoes.push({
      icone: 'lua',
      titulo: `${noturnas.length} fotos da noite`,
      texto: 'Reunidas automaticamente para você.',
      acao: () => { galeria.aba = 'contextos'; abrirDetalhe({ tipo: 'contexto', chave: 'noite' }); },
    });
  }

  // 4. Relembrar uma foto antiga
  const antiga = midias.find((m) => (Date.now() - new Date(m.data)) / 86400000 >= 7);
  if (antiga) {
    const dias = Math.floor((Date.now() - new Date(antiga.data)) / 86400000);
    sugestoes.push({
      icone: 'relogio',
      titulo: `Há ${dias} dias`,
      texto: `Relembre ${antiga.local}.`,
      midia: antiga,
      acao: () => { location.href = `foto.html?id=${antiga.id}&de=galeria`; },
    });
  }

  if (!sugestoes.length) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <h2 class="text-sm font-bold text-slate-500 mb-2 flex items-center gap-1.5">
      <span data-icon="ia" class="w-4 h-4 text-jovi"></span> Sugestões para você
    </h2>
    <ul class="flex gap-3 overflow-x-auto sem-barra -mx-5 px-5 pb-1">
      ${sugestoes.map((s, i) => `
        <li class="shrink-0 w-60">
          <button class="w-full h-full flex items-center gap-3 p-3 rounded-2xl bg-white hover:bg-jovi-50 text-left" data-sugestao="${i}">
            <span class="w-12 h-12 rounded-xl shrink-0 overflow-hidden grid place-items-center bg-jovi text-white">
              ${s.midia ? UI.miniatura(s.midia) : `<span data-icon="${s.icone}" class="w-6 h-6"></span>`}
            </span>
            <span class="min-w-0">
              <span class="block font-bold text-jovi-900 text-sm">${UI.esc(s.titulo)}</span>
              <span class="block text-xs text-slate-600">${UI.esc(s.texto)}</span>
            </span>
          </button>
        </li>`).join('')}
    </ul>`;
  Icones.renderizar(area);

  area.querySelectorAll('[data-sugestao]').forEach((botao) => {
    botao.addEventListener('click', () => sugestoes[Number(botao.dataset.sugestao)].acao());
  });
}