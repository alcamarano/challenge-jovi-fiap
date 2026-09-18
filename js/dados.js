/* =============================================================
   dados.js
   Camada de dados do JOVI Lens.

   Onde cada coisa fica guardada:
   - localStorage  -> ficha de cada mídia (dados + miniatura pequena)
   - IndexedDB     -> arquivo real da foto (JPEG) ou do vídeo (WEBM/MP4)

   O IndexedDB é usado porque fotos e vídeos reais não caberiam no
   localStorage, que é limitado a poucos megabytes.

   Correspondência com o Modelo Lógico (MER):
   T_JOVI_MODO_CAMERA  ->  MODOS
   T_JOVI_MIDIA        ->  estado.midias
   T_JOVI_ALBUM        ->  estado.albuns
   T_JOVI_MIDIA_ALBUM  ->  estado.midiaAlbum
   T_JOVI_COMP         ->  estado.comps
   T_JOVI_MIDIA_COMP   ->  estado.midiaComp
   ============================================================= */

/* =============================================================
   ARQUIVOS: guarda fotos e vídeos no IndexedDB
   ============================================================= */
const Arquivos = (() => {
  const BANCO = 'jovilens';
  const LOJA = 'arquivos';
  let conexao = null;
  let disponivel = true;
  const memoria = new Map(); // usado se o IndexedDB não funcionar

  function abrir() {
    if (conexao) return Promise.resolve(conexao);
    return new Promise((resolver) => {
      try {
        const pedido = indexedDB.open(BANCO, 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
        pedido.onsuccess = () => { conexao = pedido.result; resolver(conexao); };
        pedido.onerror = () => { disponivel = false; resolver(null); };
      } catch (erro) {
        disponivel = false;
        resolver(null);
      }
    });
  }

  function operacao(modo, acao) {
    return abrir().then((banco) => new Promise((resolver, rejeitar) => {
      if (!banco) { rejeitar(new Error('IndexedDB indisponível')); return; }
      const transacao = banco.transaction(LOJA, modo);
      const pedido = acao(transacao.objectStore(LOJA));
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    }));
  }

  /** Guarda o arquivo. Retorna true se deu certo. */
  async function salvar(id, blob) {
    try {
      await operacao('readwrite', (loja) => loja.put(blob, id));
      return true;
    } catch (erro) {
      // Sem IndexedDB o arquivo fica só na memória desta sessão
      memoria.set(id, blob);
      return disponivel;
    }
  }

  async function obter(id) {
    if (memoria.has(id)) return memoria.get(id);
    try {
      return await operacao('readonly', (loja) => loja.get(id));
    } catch (erro) {
      return null;
    }
  }

  async function excluir(ids) {
    ids.forEach((id) => memoria.delete(id));
    try {
      await Promise.all(ids.map((id) => operacao('readwrite', (loja) => loja.delete(id))));
    } catch (erro) {
      console.warn('Não foi possível apagar o arquivo:', erro);
    }
  }

  async function limpar() {
    memoria.clear();
    try {
      await operacao('readwrite', (loja) => loja.clear());
    } catch (erro) {
      console.warn('Não foi possível limpar os arquivos:', erro);
    }
  }

  /** Espaço já usado e disponível no aparelho (quando o navegador informa). */
  async function espaco() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch (erro) {
      return null;
    }
  }

  return { salvar, obter, excluir, limpar, espaco };
})();

/* =============================================================
   DADOS: fichas das mídias, álbuns e compartilhamentos
   ============================================================= */
const Dados = (() => {
  const CHAVE = 'jovilens:v2';

  /* -----------------------------------------------------------
     1. TABELAS FIXAS
     ----------------------------------------------------------- */

  /**
   * T_JOVI_MODO_CAMERA
   * lumMin / lumMax = faixa de luminosidade indicada para o modo,
   * numa escala de 0 (escuro) a 100 (muito claro).
   */
  const MODOS = [
    { id: 1, chave: 'video',   nome: 'Vídeo',   descricao: 'Grava vídeo com som',                    lumMin: 0,  lumMax: 100 },
    { id: 2, chave: 'foto',    nome: 'Foto',    descricao: 'Modo padrão para cenas bem iluminadas',   lumMin: 26, lumMax: 100 },
    { id: 3, chave: 'retrato', nome: 'Retrato', descricao: 'Realça o rosto e escurece as bordas',     lumMin: 20, lumMax: 100 },
    { id: 4, chave: 'noturno', nome: 'Noturno', descricao: 'Clareia e reduz o granulado no escuro',   lumMin: 0,  lumMax: 25 },
  ];

  /** Assuntos da Galeria Inteligente (viram álbuns automáticos). */
  const CONTEXTOS = {
    selfies: { nome: 'Selfies',   icone: 'pessoa' },
    noite:   { nome: 'Noite',     icone: 'lua' },
    videos:  { nome: 'Vídeos',    icone: 'video' },
    dia:     { nome: 'Dia a dia', icone: 'sol' },
  };

  /** Filtros da edição leve (valores de CSS filter). */
  const FILTROS = {
    original: { nome: 'Original', css: '' },
    vivido:   { nome: 'Vívido',   css: 'saturate(1.45) contrast(1.08)' },
    quente:   { nome: 'Quente',   css: 'sepia(.3) saturate(1.25)' },
    frio:     { nome: 'Frio',     css: 'hue-rotate(12deg) saturate(.9) brightness(1.03)' },
    pb:       { nome: 'P&B',      css: 'grayscale(1) contrast(1.1)' },
    retro:    { nome: 'Retrô',    css: 'sepia(.5) contrast(.9) brightness(1.05)' },
  };

  /* -----------------------------------------------------------
     2. ESTADO
     ----------------------------------------------------------- */
  let estado = carregar();

  function carregar() {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) return JSON.parse(salvo);
    } catch (erro) {
      console.warn('Não foi possível ler o localStorage:', erro);
    }
    return {
      seq: {},
      midias: [],
      albuns: [],
      midiaAlbum: [],
      comps: [],
      midiaComp: [],
      preferencias: { onboardingVisto: false, salvarLocal: false },
    };
  }

  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
      return true;
    } catch (erro) {
      console.warn('Não foi possível salvar:', erro);
      return false;
    }
  }

  function proximoId(tabela) {
    estado.seq[tabela] = (estado.seq[tabela] || 0) + 1;
    return estado.seq[tabela];
  }

  /* -----------------------------------------------------------
     3. REGRAS DA CÂMERA
     ----------------------------------------------------------- */

  /** Captura Inteligente: escolhe o modo pela luz e pela câmera em uso. */
  function sugerirModo(luminosidade, frontal) {
    if (luminosidade <= 25) return 'noturno';
    if (frontal) return 'retrato';
    return 'foto';
  }

  /** Tratamento de imagem de cada modo (vira um CSS filter). */
  function processamentoDoModo(luminosidade, modo, auraLight) {
    if (luminosidade <= 25) {
      let brilho = modo === 'noturno' ? 1.75 : 1;
      if (auraLight) brilho += 0.2;
      const cor = modo === 'noturno' ? 'contrast(1.08) saturate(1.15)' : '';
      return `brightness(${brilho.toFixed(2)}) ${cor}`.trim();
    }
    if (modo === 'retrato') return 'saturate(1.08) contrast(1.03)';
    return '';
  }

  /** Define o assunto da foto (usado pela Galeria Inteligente). */
  function definirContexto({ tipo, frontal, luminosidade }) {
    if (tipo === 'V') return 'videos';
    if (frontal) return 'selfies';
    if (luminosidade <= 25) return 'noite';
    return 'dia';
  }

  /* -----------------------------------------------------------
     4. MÍDIAS (T_JOVI_MIDIA)
     ----------------------------------------------------------- */
  function montarMidia(d) {
    return {
      id: d.id,                                  // cd_midia
      modoId: (MODOS.find((m) => m.chave === d.modo) || MODOS[1]).id, // cd_modo (FK)
      tipo: d.tipo || 'F',                       // tp_midia: F = foto, V = vídeo
      local: d.local || 'Sem localização',       // ds_local_midia
      data: d.data || new Date().toISOString(),  // dt_midia
      resolucao: d.resolucao || '',              // ds_resolucao_midia
      luminosidade: d.luminosidade ?? 50,        // nr_luminosidade_midia
      auraLight: !!d.auraLight,                  // fl_auralight_midia
      duracao: d.tipo === 'V' ? (d.duracao || 1) : null, // nr_duracao_midia (segundos)
      // Campos usados pela interface:
      contexto: d.contexto || 'dia',
      miniatura: d.miniatura || '',              // imagem pequena (dataURL) para a grade
      inline: d.inline || null,                  // arquivo em dataURL (só se o IndexedDB falhar)
      mime: d.mime || 'image/jpeg',
      tamanho: d.tamanho || 0,                   // bytes do arquivo real
      frontal: !!d.frontal,
      processamento: d.processamento || '',      // tratamento que não foi gravado na imagem
      filtro: d.filtro || 'original',
      brilho: d.brilho || 100,
      contraste: d.contraste || 100,
      favorito: !!d.favorito,
    };
  }

  function listarMidias() {
    return [...estado.midias].sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  function obterMidia(id) {
    return estado.midias.find((m) => m.id === Number(id)) || null;
  }

  /**
   * Salva a ficha e o arquivo real.
   * @param {object} dadosNovos dados da mídia
   * @param {Blob} blob arquivo da foto ou do vídeo
   */
  async function adicionarMidia(dadosNovos, blob) {
    const midia = montarMidia({ ...dadosNovos, id: proximoId('midias'), tamanho: blob ? blob.size : 0 });

    if (blob) {
      const guardou = await Arquivos.salvar(midia.id, blob);
      // Sem IndexedDB, a foto é guardada como texto na própria ficha
      if (!guardou && midia.tipo === 'F') midia.inline = await blobParaDataURL(blob);
    }

    estado.midias.push(midia);
    if (!gravar()) {
      estado.midias.pop();
      await Arquivos.excluir([midia.id]);
      return null;
    }
    return midia;
  }

  function atualizarMidia(id, campos) {
    const midia = obterMidia(id);
    if (!midia) return null;
    Object.assign(midia, campos);
    gravar();
    return midia;
  }

  function excluirMidias(ids) {
    const lista = ids.map(Number);
    estado.midias = estado.midias.filter((m) => !lista.includes(m.id));
    estado.midiaAlbum = estado.midiaAlbum.filter((r) => !lista.includes(r.midiaId));
    estado.midiaComp = estado.midiaComp.filter((r) => !lista.includes(r.midiaId));
    gravar();
    Arquivos.excluir(lista);
  }

  function definirFavorito(ids, valor) {
    ids.map(Number).forEach((id) => {
      const m = obterMidia(id);
      if (m) m.favorito = valor;
    });
    gravar();
  }

  /** Devolve o arquivo original (Blob) da mídia. */
  async function arquivoDaMidia(m) {
    const guardado = await Arquivos.obter(m.id);
    if (guardado) return guardado;
    if (m.inline) return dataURLParaBlob(m.inline);
    return null;
  }

  /** Endereço temporário para mostrar a mídia em tela cheia. */
  async function urlDaMidia(m) {
    const blob = await arquivoDaMidia(m);
    return blob ? URL.createObjectURL(blob) : m.miniatura;
  }

  /* -----------------------------------------------------------
     5. ÁLBUNS (T_JOVI_ALBUM e T_JOVI_MIDIA_ALBUM)
     ----------------------------------------------------------- */
  function listarAlbuns() {
    return [...estado.albuns]
      .sort((a, b) => new Date(b.criacao) - new Date(a.criacao))
      .map((album) => ({ ...album, midias: midiasDoAlbum(album.id) }));
  }

  function albunsAutomaticos() {
    return Object.entries(CONTEXTOS)
      .map(([chave, info]) => ({
        id: 'ctx-' + chave,
        chave,
        nome: info.nome,
        icone: info.icone,
        tipo: 'A',
        midias: listarMidias().filter((m) => m.contexto === chave),
      }))
      .filter((album) => album.midias.length > 0);
  }

  function obterAlbum(id) {
    return estado.albuns.find((a) => a.id === Number(id)) || null;
  }

  function criarAlbum(nome) {
    const album = { id: proximoId('albuns'), nome: nome.trim().slice(0, 50), tipo: 'M', criacao: new Date().toISOString() };
    estado.albuns.push(album);
    gravar();
    return album;
  }

  function excluirAlbum(id) {
    estado.albuns = estado.albuns.filter((a) => a.id !== Number(id));
    estado.midiaAlbum = estado.midiaAlbum.filter((r) => r.albumId !== Number(id));
    gravar();
  }

  function adicionarAoAlbum(albumId, ids) {
    let novas = 0;
    ids.map(Number).forEach((midiaId) => {
      const jaExiste = estado.midiaAlbum.some((r) => r.albumId === Number(albumId) && r.midiaId === midiaId);
      if (!jaExiste) {
        estado.midiaAlbum.push({ id: proximoId('midiaAlbum'), midiaId, albumId: Number(albumId), adicao: new Date().toISOString() });
        novas++;
      }
    });
    gravar();
    return novas;
  }

  function midiasDoAlbum(albumId) {
    const ids = estado.midiaAlbum.filter((r) => r.albumId === Number(albumId)).map((r) => r.midiaId);
    return listarMidias().filter((m) => ids.includes(m.id));
  }

  /* -----------------------------------------------------------
     6. COMPARTILHAMENTOS (T_JOVI_COMP e T_JOVI_MIDIA_COMP)
     ----------------------------------------------------------- */
  function registrarCompartilhamento(ids, destino) {
    const comp = { id: proximoId('comps'), destino: destino.slice(0, 40), envio: new Date().toISOString(), enviado: true };
    estado.comps.push(comp);
    ids.map(Number).forEach((midiaId) => {
      estado.midiaComp.push({ id: proximoId('midiaComp'), midiaId, compId: comp.id });
    });
    gravar();
    return comp;
  }

  function totalCompartilhamentos() {
    return estado.comps.length;
  }

  /* -----------------------------------------------------------
     7. UTILITÁRIOS
     ----------------------------------------------------------- */

  /** Imagem mostrada na grade: a miniatura guardada na ficha. */
  function srcMidia(m) {
    return m.miniatura || '';
  }

  /** Junta tratamento do modo + filtro + ajustes num CSS filter. */
  function filtroCss(m, sobrescrever = {}) {
    const f = { ...m, ...sobrescrever };
    const partes = [
      f.processamento,
      (FILTROS[f.filtro] || FILTROS.original).css,
      f.brilho !== 100 ? `brightness(${f.brilho / 100})` : '',
      f.contraste !== 100 ? `contrast(${f.contraste / 100})` : '',
    ];
    return partes.filter(Boolean).join(' ') || 'none';
  }

  /** True quando a mídia tem alguma edição para aplicar na exportação. */
  function temEdicao(m) {
    return filtroCss(m) !== 'none';
  }

  function nomeModo(modoId) {
    const modo = MODOS.find((m) => m.id === modoId);
    return modo ? modo.nome : 'Foto';
  }

  function chaveModo(modoId) {
    const modo = MODOS.find((m) => m.id === modoId);
    return modo ? modo.chave : 'foto';
  }

  function grupoMomento(dataIso) {
    const data = new Date(dataIso);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dia = new Date(data);
    dia.setHours(0, 0, 0, 0);
    const diff = Math.round((hoje - dia) / 86400000);
    if (diff <= 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff < 7) return 'Nesta semana';
    if (diff < 31) return 'Neste mês';
    return 'Mais antigas';
  }

  function formatarData(dataIso, comHora = true) {
    const opcoes = { day: '2-digit', month: 'short' };
    if (comHora) Object.assign(opcoes, { hour: '2-digit', minute: '2-digit' });
    return new Date(dataIso).toLocaleString('pt-BR', opcoes).replace('.', '');
  }

  function formatarHora(dataIso) {
    return new Date(dataIso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatarDuracao(segundos) {
    const s = Math.max(0, Math.round(segundos || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** 1536000 -> "1,5 MB" */
  function formatarTamanho(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
  }

  function preferencia(nome, valor) {
    if (valor === undefined) return estado.preferencias[nome];
    estado.preferencias[nome] = valor;
    gravar();
  }

  /** Apaga tudo: fichas, álbuns, envios e arquivos. */
  async function apagarTudo() {
    estado = {
      seq: {},
      midias: [],
      albuns: [],
      midiaAlbum: [],
      comps: [],
      midiaComp: [],
      preferencias: { ...estado.preferencias },
    };
    gravar();
    await Arquivos.limpar();
  }

  /* Conversões auxiliares */
  function blobParaDataURL(blob) {
    return new Promise((resolver) => {
      const leitor = new FileReader();
      leitor.onload = () => resolver(leitor.result);
      leitor.readAsDataURL(blob);
    });
  }

  function dataURLParaBlob(dataURL) {
    const [cabecalho, dados] = dataURL.split(',');
    const mime = cabecalho.match(/:(.*?);/)[1];
    const binario = atob(dados);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  return {
    MODOS, CONTEXTOS, FILTROS,
    sugerirModo, processamentoDoModo, definirContexto,
    listarMidias, obterMidia, adicionarMidia, atualizarMidia, excluirMidias, definirFavorito,
    arquivoDaMidia, urlDaMidia,
    listarAlbuns, albunsAutomaticos, obterAlbum, criarAlbum, excluirAlbum, adicionarAoAlbum, midiasDoAlbum,
    registrarCompartilhamento, totalCompartilhamentos,
    srcMidia, filtroCss, temEdicao, nomeModo, chaveModo,
    grupoMomento, formatarData, formatarHora, formatarDuracao, formatarTamanho,
    preferencia, apagarTudo, blobParaDataURL,
  };
})();