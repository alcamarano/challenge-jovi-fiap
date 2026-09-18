/* =============================================================
   app.js
   Componentes de interface usados em todas as páginas:
   - avisos rápidos (toast)
   - painéis que sobem da parte de baixo (bottom sheet)
   - confirmação e campo de texto
   - Compartilhamento Rápido
   - escolha de álbum
   Depende de: icones.js e dados.js
   ============================================================= */

const UI = (() => {
  /** Evita que textos digitados virem HTML (segurança). */
  function esc(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto ?? '');
    return div.innerHTML;
  }

  /** Cria um elemento a partir de uma string HTML. */
  function criar(html) {
    const modelo = document.createElement('template');
    modelo.innerHTML = html.trim();
    return modelo.content.firstElementChild;
  }

  /* -----------------------------------------------------------
     AVISO RÁPIDO (toast)
     ----------------------------------------------------------- */
  let areaAvisos = null;

  /**
   * Mostra um aviso na parte de cima da tela.
   * @param {string} mensagem
   * @param {object} opcoes { icone, acao: { texto, aoClicar }, duracao }
   */
  function aviso(mensagem, opcoes = {}) {
    if (!areaAvisos) {
      areaAvisos = criar('<div class="area-avisos" role="status" aria-live="polite"></div>');
      document.body.appendChild(areaAvisos);
    }
    const el = criar(`
      <div class="aviso">
        <span data-icon="${opcoes.icone || 'checkCirculo'}" class="w-5 h-5 shrink-0 text-sinal"></span>
        <span class="flex-1">${esc(mensagem)}</span>
        ${opcoes.acao ? `<button class="font-bold text-sinal px-1">${esc(opcoes.acao.texto)}</button>` : ''}
      </div>`);
    Icones.renderizar(el);
    if (opcoes.acao) el.querySelector('button').addEventListener('click', opcoes.acao.aoClicar);
    areaAvisos.appendChild(el);

    setTimeout(() => {
      el.classList.add('saindo');
      setTimeout(() => el.remove(), 250);
    }, opcoes.duracao || 2600);
  }

  /* -----------------------------------------------------------
     PAINEL INFERIOR (bottom sheet)
     ----------------------------------------------------------- */

  /**
   * Abre um painel que sobe da parte de baixo.
   * Retorna { el, fechar }. "aoFechar" é chamado ao fechar.
   */
  function painel(conteudoHtml, { titulo = '', aoFechar = null, escuro = false } = {}) {
    const fundo = criar(`
      <div class="painel-fundo">
        <section class="painel ${escuro ? 'painel-escuro' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
          <div class="painel-alca" aria-hidden="true"></div>
          ${titulo ? `
            <header class="flex items-center justify-between mb-4">
              <h2 class="font-display text-lg font-semibold">${esc(titulo)}</h2>
              <button class="botao-icone" data-fechar aria-label="Fechar">
                <span data-icon="fechar" class="w-5 h-5"></span>
              </button>
            </header>` : ''}
          <div class="painel-corpo">${conteudoHtml}</div>
        </section>
      </div>`);

    document.body.appendChild(fundo);
    Icones.renderizar(fundo);
    const anterior = document.activeElement;
    requestAnimationFrame(() => fundo.classList.add('aberto'));

    function fechar() {
      fundo.classList.remove('aberto');
      document.removeEventListener('keydown', teclado);
      setTimeout(() => fundo.remove(), 250);
      if (anterior && anterior.focus) anterior.focus();
      if (aoFechar) aoFechar();
    }
    function teclado(e) { if (e.key === 'Escape') fechar(); }

    // Fecha ao tocar fora, no botão X ou com a tecla Esc
    fundo.addEventListener('click', (e) => {
      if (e.target === fundo || e.target.closest('[data-fechar]')) fechar();
    });
    document.addEventListener('keydown', teclado);

    // Leva o foco para dentro do painel (acessibilidade)
    setTimeout(() => {
      const foco = fundo.querySelector('input, button:not([data-fechar])') || fundo.querySelector('button');
      if (foco) foco.focus();
    }, 50);

    return { el: fundo.querySelector('.painel'), fechar };
  }

  /** Pergunta de confirmação. Retorna uma Promise com true/false. */
  function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false }) {
    return new Promise((resolver) => {
      let respondeu = false;
      const { el, fechar } = painel(`
        <p class="text-slate-600 mb-6">${esc(texto)}</p>
        <div class="grid grid-cols-2 gap-3">
          <button class="botao botao-claro" data-fechar>Cancelar</button>
          <button class="botao ${perigo ? 'botao-perigo' : 'botao-primario'}" data-ok>${esc(botao)}</button>
        </div>`, { titulo, aoFechar: () => { if (!respondeu) resolver(false); } });

      el.querySelector('[data-ok]').addEventListener('click', () => {
        respondeu = true;
        resolver(true);
        fechar();
      });
    });
  }

  /** Pede um texto (ex.: nome do álbum). Retorna a Promise com o texto ou null. */
  function pedirTexto({ titulo, rotulo, placeholder = '', botao = 'Salvar' }) {
    return new Promise((resolver) => {
      let respondeu = false;
      const { el, fechar } = painel(`
        <form class="space-y-4" novalidate>
          <label class="block">
            <span class="block text-sm font-semibold text-slate-700 mb-2">${esc(rotulo)}</span>
            <input type="text" maxlength="50" required placeholder="${esc(placeholder)}" class="campo" />
          </label>
          <p class="text-sm text-red-600 hidden" data-erro>Digite um nome para continuar.</p>
          <button type="submit" class="botao botao-primario w-full">${esc(botao)}</button>
        </form>`, { titulo, aoFechar: () => { if (!respondeu) resolver(null); } });

      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const valor = el.querySelector('input').value.trim();
        if (!valor) {
          el.querySelector('[data-erro]').classList.remove('hidden');
          return;
        }
        respondeu = true;
        resolver(valor);
        fechar();
      });
    });
  }

  /* -----------------------------------------------------------
     MINIATURA (usada na galeria, início e painéis)
     ----------------------------------------------------------- */
  function miniatura(m, classes = '') {
    const src = Dados.srcMidia(m);
    if (!src) return '<span class="w-full h-full grid place-items-center bg-slate-200 text-slate-400"><span data-icon="imagem" class="w-6 h-6"></span></span>';
    return `
      <img src="${src}" alt="${esc(m.tipo === 'V' ? 'Vídeo' : 'Foto')} de ${Dados.formatarData(m.data)}"
        loading="lazy" decoding="async"
        class="w-full h-full object-cover ${classes}"
        style="filter:${Dados.filtroCss(m)}" />`;
  }

  /* -----------------------------------------------------------
     EXPORTAÇÃO DOS ARQUIVOS
     Gera o arquivo final (com as edições aplicadas) para enviar,
     salvar no aparelho ou copiar.
     ----------------------------------------------------------- */

  /** O navegador consegue aplicar filtros no canvas? */
  function suportaFiltroNoCanvas() {
    const teste = document.createElement('canvas').getContext('2d');
    return typeof teste.filter === 'string';
  }

  function nomeArquivo(m) {
    const data = new Date(m.data).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const extensao = m.tipo === 'V' ? (m.mime.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    return `jovi-lens-${data}-${m.id}.${extensao}`;
  }

  function carregarImagem(url) {
    return new Promise((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = rejeitar;
      img.src = url;
    });
  }

  /**
   * Devolve o arquivo pronto para compartilhar.
   * @param {object} m mídia
   * @param {boolean} otimizar reduz tamanho para enviar mais rápido
   */
  async function exportarMidia(m, otimizar) {
    const blob = await Dados.arquivoDaMidia(m);
    if (!blob) return null;

    // Vídeo vai como foi gravado
    if (m.tipo === 'V') return new File([blob], nomeArquivo(m), { type: blob.type || m.mime });

    // Foto sem edição e sem otimização: nada a refazer
    if (!Dados.temEdicao(m) && !otimizar) return new File([blob], nomeArquivo(m), { type: blob.type || 'image/jpeg' });

    const url = URL.createObjectURL(blob);
    try {
      const img = await carregarImagem(url);
      const maior = Math.max(img.width, img.height);
      const escala = otimizar && maior > 1280 ? 1280 / maior : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);

      const ctx = canvas.getContext('2d');
      if (suportaFiltroNoCanvas()) ctx.filter = Dados.filtroCss(m);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const final = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', otimizar ? 0.72 : 0.92));
      return new File([final], nomeArquivo(m), { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* -----------------------------------------------------------
     COMPARTILHAMENTO RÁPIDO
     Usa o compartilhamento do próprio aparelho, o download e a
     área de transferência. Tudo com os arquivos reais.
     ----------------------------------------------------------- */
  function compartilhar(ids, aoEnviar) {
    const midias = ids.map(Dados.obterMidia).filter(Boolean);
    if (!midias.length) return;

    const temFoto = midias.some((m) => m.tipo === 'F');
    const podeCopiar = midias.length === 1 && temFoto && navigator.clipboard && window.ClipboardItem;

    const { el, fechar } = painel(`
      <div class="flex gap-2 overflow-x-auto sem-barra -mx-1 px-1 pb-1 mb-4">
        ${midias.slice(0, 6).map((m) => `
          <div class="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-slate-200">${miniatura(m)}</div>`).join('')}
        ${midias.length > 6 ? `<div class="w-14 h-14 rounded-xl shrink-0 bg-jovi-100 text-jovi font-bold grid place-items-center">+${midias.length - 6}</div>` : ''}
      </div>

      <p class="flex items-center gap-2 text-sm text-slate-600 mb-4" data-status aria-live="polite">
        <span data-icon="velocidade" class="w-4 h-4 text-jovi shrink-0"></span>
        <span data-status-texto>Preparando os arquivos…</span>
      </p>

      ${temFoto ? `
        <label class="flex items-center gap-3 p-3 rounded-2xl bg-jovi-50 mb-4 cursor-pointer">
          <span class="flex-1">
            <span class="block text-sm font-semibold text-slate-800">Enviar em tamanho otimizado</span>
            <span class="block text-xs text-slate-600">Reduz a foto para 1280 px: envia mais rápido.</span>
          </span>
          <input type="checkbox" class="chave" data-otimizar checked />
        </label>` : ''}

      <div class="space-y-2">
        <button class="botao botao-primario w-full" data-acao="sistema" disabled>
          <span data-icon="compartilhar" class="w-5 h-5"></span> Compartilhar
        </button>
        <button class="botao botao-claro w-full" data-acao="salvar" disabled>
          <span data-icon="album" class="w-5 h-5"></span> Salvar no aparelho
        </button>
        ${podeCopiar ? `
          <button class="botao botao-claro w-full" data-acao="copiar" disabled>
            <span data-icon="link" class="w-5 h-5"></span> Copiar imagem
          </button>` : ''}
      </div>
      <p class="text-xs text-slate-500 mt-3" data-aviso-sistema hidden>
        Este navegador não abre o menu de compartilhar do aparelho. Salve o arquivo e envie pelo aplicativo que preferir.
      </p>
    `, { titulo: midias.length > 1 ? `Compartilhar ${midias.length} itens` : 'Compartilhar' });

    const status = el.querySelector('[data-status-texto]');
    const chaveOtimizar = el.querySelector('[data-otimizar]');
    const botoes = [...el.querySelectorAll('[data-acao]')];
    let arquivos = [];

    /**
     * Prepara os arquivos assim que o painel abre.
     * Isso é importante: o compartilhamento do celular só funciona
     * se for chamado logo depois do toque, sem espera no meio.
     */
    async function preparar() {
      botoes.forEach((b) => { b.disabled = true; });
      status.textContent = 'Preparando os arquivos…';
      const inicio = performance.now();
      const otimizar = !!(chaveOtimizar && chaveOtimizar.checked);

      const gerados = await Promise.all(midias.map((m) => exportarMidia(m, otimizar)));
      arquivos = gerados.filter(Boolean);

      if (!arquivos.length) {
        status.textContent = 'Não foi possível abrir os arquivos desta mídia.';
        return;
      }

      const total = arquivos.reduce((soma, a) => soma + a.size, 0);
      const ms = performance.now() - inicio;
      const tempo = ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
      status.textContent = `${arquivos.length} ${arquivos.length === 1 ? 'arquivo pronto' : 'arquivos prontos'}, ${Dados.formatarTamanho(total)}, em ${tempo}`;

      const podeSistema = typeof navigator.share === 'function'
        && (!navigator.canShare || navigator.canShare({ files: arquivos }));
      botoes.forEach((b) => {
        const ehSistema = b.dataset.acao === 'sistema';
        b.disabled = ehSistema && !podeSistema;
        b.classList.toggle('hidden', ehSistema && !podeSistema);
      });
      el.querySelector('[data-aviso-sistema]').hidden = podeSistema;
    }

    if (chaveOtimizar) chaveOtimizar.addEventListener('change', preparar);
    preparar();

    /* Ações */
    el.querySelector('[data-acao="sistema"]').addEventListener('click', async () => {
      try {
        await navigator.share({ files: arquivos, title: 'JOVI Lens' });
        Dados.registrarCompartilhamento(ids, 'Compartilhamento do aparelho');
        fechar();
        aviso('Compartilhado');
        if (aoEnviar) aoEnviar('sistema');
      } catch (erro) {
        // O usuário pode ter cancelado: nesse caso não há nada a fazer
        if (erro && erro.name !== 'AbortError') {
          aviso('Não foi possível compartilhar por aqui. Salve o arquivo e envie pelo aplicativo.', { icone: 'info', duracao: 4000 });
        }
      }
    });

    el.querySelector('[data-acao="salvar"]').addEventListener('click', () => {
      arquivos.forEach((arquivo, i) => {
        setTimeout(() => {
          const url = URL.createObjectURL(arquivo);
          const link = document.createElement('a');
          link.href = url;
          link.download = arquivo.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, i * 250);
      });
      Dados.registrarCompartilhamento(ids, 'Salvo no aparelho');
      fechar();
      aviso(`${arquivos.length} ${arquivos.length === 1 ? 'arquivo salvo' : 'arquivos salvos'}`, { icone: 'album' });
      if (aoEnviar) aoEnviar('salvar');
    });

    const botaoCopiar = el.querySelector('[data-acao="copiar"]');
    if (botaoCopiar) {
      botaoCopiar.addEventListener('click', async () => {
        try {
          // A área de transferência aceita PNG, então convertemos
          const img = await carregarImagem(URL.createObjectURL(arquivos[0]));
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          Dados.registrarCompartilhamento(ids, 'Área de transferência');
          fechar();
          aviso('Imagem copiada');
          if (aoEnviar) aoEnviar('copiar');
        } catch (erro) {
          aviso('Este navegador não deixa copiar a imagem. Use Salvar no aparelho.', { icone: 'info', duracao: 4000 });
        }
      });
    }
  }

  /* -----------------------------------------------------------
     ESCOLHER ÁLBUM
     ----------------------------------------------------------- */
  function escolherAlbum(ids, aoConcluir) {
    const albuns = Dados.listarAlbuns();
    const { el, fechar } = painel(`
      <button class="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed border-jovi-200 text-jovi font-semibold mb-3" data-novo>
        <span class="w-12 h-12 rounded-xl bg-jovi-50 grid place-items-center"><span data-icon="mais" class="w-6 h-6"></span></span>
        Criar novo álbum
      </button>
      <ul class="space-y-2 max-h-72 overflow-y-auto">
        ${albuns.map((a) => `
          <li>
            <button class="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-100 text-left" data-album="${a.id}">
              <span class="w-12 h-12 rounded-xl overflow-hidden bg-slate-200 shrink-0 grid place-items-center">
                ${a.midias[0] ? miniatura(a.midias[0]) : '<span data-icon="pasta" class="w-6 h-6 text-slate-400"></span>'}
              </span>
              <span class="flex-1">
                <span class="block font-semibold text-slate-800">${esc(a.nome)}</span>
                <span class="block text-sm text-slate-500">${a.midias.length} ${a.midias.length === 1 ? 'item' : 'itens'}</span>
              </span>
            </button>
          </li>`).join('')}
      </ul>
    `, { titulo: 'Adicionar ao álbum' });

    function concluir(album) {
      const novas = Dados.adicionarAoAlbum(album.id, ids);
      fechar();
      aviso(novas ? `Adicionado a "${album.nome}"` : `Já estava em "${album.nome}"`);
      if (aoConcluir) aoConcluir(album);
    }

    el.querySelectorAll('[data-album]').forEach((botao) => {
      botao.addEventListener('click', () => concluir(Dados.obterAlbum(botao.dataset.album)));
    });

    el.querySelector('[data-novo]').addEventListener('click', async () => {
      fechar();
      const nome = await pedirTexto({ titulo: 'Novo álbum', rotulo: 'Nome do álbum', placeholder: 'Ex.: Férias 2026', botao: 'Criar e adicionar' });
      if (nome) concluir(Dados.criarAlbum(nome));
    });
  }

  /* -----------------------------------------------------------
     INICIALIZAÇÃO COMUM
     ----------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    Icones.renderizar();

    // Marca o item atual do menu inferior
    const pagina = document.body.dataset.pagina;
    document.querySelectorAll('[data-nav]').forEach((link) => {
      if (link.dataset.nav === pagina) {
        link.classList.add('ativo');
        link.setAttribute('aria-current', 'page');
      }
    });
  });

  return { esc, criar, aviso, painel, confirmar, pedirTexto, miniatura, compartilhar, escolherAlbum, exportarMidia, carregarImagem };
})();