/* =============================================================
   icones.js
   Ícones do projeto usando a biblioteca Lucide (via CDN).

   Uso no HTML:  <span data-icon="camera" class="w-6 h-6"></span>
   O app.js troca cada <span data-icon> pelo SVG correspondente.

   O mapa abaixo liga o nome usado no projeto (em português) ao
   nome do ícone na Lucide: https://lucide.dev/icons
   ============================================================= */

const Icones = (() => {
  /**
   * nome no projeto -> nome na Lucide
   * Quando o valor é uma lista, o segundo item indica ícone preenchido.
   */
  const MAPA = {
    camera: 'Camera',
    imagem: 'Image',
    inicio: 'House',
    busca: 'Search',
    flash: 'Zap',
    flashOff: 'ZapOff',
    ia: 'Sparkles',
    grade: 'Grid3x3',
    lua: 'Moon',
    sol: 'Sun',
    pessoa: 'User',
    montanha: 'Mountain',
    predio: 'Building2',
    talheres: 'Utensils',
    compartilhar: 'Share2',
    coracao: 'Heart',
    coracaoCheio: ['Heart', true],
    lixeira: 'Trash2',
    ajustes: 'SlidersHorizontal',
    album: 'FolderPlus',
    pasta: 'Folder',
    fechar: 'X',
    check: 'Check',
    checkCirculo: 'CircleCheck',
    esquerda: 'ChevronLeft',
    direita: 'ChevronRight',
    voltar: 'ArrowLeft',
    girar: 'SwitchCamera',
    info: 'Info',
    mais: 'Plus',
    link: 'Link',
    email: 'Mail',
    mensagem: 'MessageCircle',
    globo: 'Globe',
    reticencias: 'Ellipsis',
    velocidade: 'Gauge',
    mao: 'Hand',
    video: 'Video',
    play: ['Play', true],
    lampada: 'Lightbulb',
    relogio: 'Clock',
    local: 'MapPin',
    camadas: 'Layers',
    reiniciar: 'RotateCcw',
    selecionar: 'SquareCheckBig',
  };

  /** Pega o desenho do ícone na biblioteca Lucide. */
  function desenho(nomeLucide) {
    if (typeof lucide === 'undefined') return null;
    return (lucide.icons && lucide.icons[nomeLucide]) || lucide[nomeLucide] || null;
  }

  /** Monta o SVG completo de um ícone pelo nome usado no projeto. */
  function svg(nome) {
    const definicao = MAPA[nome] || MAPA.info;
    const [nomeLucide, preenchido] = Array.isArray(definicao) ? definicao : [definicao, false];
    const partes = desenho(nomeLucide);

    // Se a biblioteca não carregou, devolve um SVG vazio para não quebrar o layout
    if (!partes) {
      console.warn(`Ícone "${nome}" não encontrado. A biblioteca Lucide carregou?`);
      return '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>';
    }

    // Cada parte da Lucide vem como ['path', { d: '...' }]
    const miolo = partes.map(([etiqueta, atributos]) => {
      const lista = Object.entries(atributos || {})
        .filter(([chave]) => chave !== 'key')
        .map(([chave, valor]) => `${chave}="${valor}"`)
        .join(' ');
      return `<${etiqueta} ${lista} />`;
    }).join('');

    return `<svg viewBox="0 0 24 24" fill="${preenchido ? 'currentColor' : 'none'}"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${miolo}</svg>`;
  }

  /** Procura todos os <span data-icon> dentro de "raiz" e desenha o ícone. */
  function renderizar(raiz = document) {
    raiz.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = svg(el.dataset.icon);
    });
  }

  return { svg, renderizar };
})();