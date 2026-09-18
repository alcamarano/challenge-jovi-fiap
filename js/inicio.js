/* =============================================================
   inicio.js
   Página inicial: demonstração animada, resumo das fotos,
   tour de boas-vindas (onboarding) e restauração dos exemplos.
   ============================================================= */

document.addEventListener('DOMContentLoaded', () => {
  renderizarResumo();
  iniciarDemonstracao();

  // Tour aparece sozinho só na primeira visita
  if (!Dados.preferencia('onboardingVisto')) abrirTour();
  document.getElementById('botao-tour').addEventListener('click', abrirTour);

  document.getElementById('botao-resetar').addEventListener('click', async () => {
    const ok = await UI.confirmar({
      titulo: 'Apagar todas as fotos?',
      texto: 'Suas fotos, vídeos e álbuns serão apagados deste aparelho. Esta ação não pode ser desfeita.',
      botao: 'Apagar tudo',
      perigo: true,
    });
    if (ok) {
      await Dados.apagarTudo();
      renderizarResumo();
      UI.aviso('Tudo apagado', { icone: 'lixeira' });
    }
  });
});

/* -------------------------------------------------------------
   Resumo: últimas fotos e totais
   ------------------------------------------------------------- */
function renderizarResumo() {
  const midias = Dados.listarMidias();
  const lista = document.getElementById('recentes');

  if (!midias.length) {
    lista.innerHTML = `
      <li class="col-span-4 text-center py-4">
        <p class="text-slate-600 mb-3">Nenhuma foto por aqui ainda.</p>
        <a href="camera.html" class="botao botao-primario">Tirar a primeira foto</a>
      </li>`;
  } else {
    lista.innerHTML = midias.slice(0, 4).map((m) => `
      <li>
        <a href="foto.html?id=${m.id}" class="block aspect-square rounded-xl overflow-hidden bg-slate-200 relative">
          ${UI.miniatura(m)}
          ${m.tipo === 'V' ? `<span class="absolute bottom-1 right-1 text-[10px] font-bold text-white bg-black/50 rounded px-1">${Dados.formatarDuracao(m.duracao)}</span>` : ''}
        </a>
      </li>`).join('');
  }

  // O botão de apagar só aparece quando existe algo para apagar
  document.getElementById('botao-resetar').classList.toggle('hidden', !midias.length);

  document.getElementById('total-fotos').textContent = midias.filter((m) => m.tipo === 'F').length;
  document.getElementById('total-videos').textContent = midias.filter((m) => m.tipo === 'V').length;
  document.getElementById('total-envios').textContent = Dados.totalCompartilhamentos();
}

/* -------------------------------------------------------------
   Demonstração do topo: mostra, em três situações, qual modo a
   Captura Inteligente escolheria. É só ilustrativo.
   ------------------------------------------------------------- */
function iniciarDemonstracao() {
  const demo = document.getElementById('demo');
  const fundo = document.getElementById('demo-fundo');
  const icone = document.getElementById('demo-icone');
  const chip = document.getElementById('demo-chip');

  const etapas = [
    { classe: 'demo-dia',    icone: 'sol',    texto: 'Cena com boa luz', modo: 'Modo Foto' },
    { classe: 'demo-noite',  icone: 'lua',    texto: 'Pouca luz',        modo: 'Modo Noturno' },
    { classe: 'demo-selfie', icone: 'pessoa', texto: 'Selfie',           modo: 'Modo Retrato' },
  ];
  let atual = 0;

  function mostrar(indice) {
    const etapa = etapas[indice];
    fundo.className = `demo-fundo ${etapa.classe}`;
    icone.innerHTML = Icones.svg(etapa.icone);
    chip.classList.add('trocando');
    setTimeout(() => {
      chip.innerHTML = `${etapa.texto}<br><span class="text-sinal">${etapa.modo}</span>`;
      chip.classList.remove('trocando');
    }, 250);
  }

  mostrar(0);

  // Quem prefere menos movimento troca a situação tocando na imagem
  const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!menosMovimento) {
    setInterval(() => {
      atual = (atual + 1) % etapas.length;
      mostrar(atual);
    }, 3000);
  }
  demo.addEventListener('click', () => {
    atual = (atual + 1) % etapas.length;
    mostrar(atual);
  });
}

/* -------------------------------------------------------------
   Tour de boas-vindas (3 passos, com opção de pular)
   ------------------------------------------------------------- */
function abrirTour() {
  const passos = [
    { icone: 'ia',       titulo: 'A câmera escolhe por você',   texto: 'Aponte para qualquer cena. O JOVI Lens reconhece o que está vendo e sugere o modo ideal.' },
    { icone: 'lua',      titulo: 'Fotos boas mesmo no escuro',  texto: 'Com pouca luz, um guia na tela mostra o que fazer para a foto sair clara e nítida.' },
    { icone: 'camadas',  titulo: 'Encontre e envie em segundos', texto: 'A galeria se organiza sozinha e cada foto pode ser enviada com um toque.' },
  ];
  let indice = 0;

  const { el, fechar } = UI.painel(`
    <div class="text-center pt-2">
      <div class="w-20 h-20 mx-auto mb-5 rounded-3xl bg-jovi-50 text-jovi grid place-items-center">
        <span data-tour-icone class="w-10 h-10"></span>
      </div>
      <h2 data-tour-titulo class="font-display text-2xl font-semibold mb-2"></h2>
      <p data-tour-texto class="text-slate-600 mb-6 min-h-[3rem]"></p>
      <div class="flex justify-center gap-2 mb-6" aria-hidden="true">
        ${passos.map(() => '<span class="onboarding-ponto"></span>').join('')}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button class="botao botao-claro" data-pular>Pular</button>
        <button class="botao botao-primario" data-avancar>Próximo</button>
      </div>
    </div>`, {
    aoFechar: () => Dados.preferencia('onboardingVisto', true),
  });

  const pontos = el.querySelectorAll('.onboarding-ponto');
  const avancar = el.querySelector('[data-avancar]');

  function desenhar() {
    const p = passos[indice];
    const icone = el.querySelector('[data-tour-icone]');
    icone.innerHTML = Icones.svg(p.icone);
    el.querySelector('[data-tour-titulo]').textContent = p.titulo;
    el.querySelector('[data-tour-texto]').textContent = p.texto;
    pontos.forEach((ponto, i) => ponto.classList.toggle('ativo', i === indice));
    avancar.textContent = indice === passos.length - 1 ? 'Abrir câmera' : 'Próximo';
  }

  avancar.addEventListener('click', () => {
    if (indice < passos.length - 1) {
      indice++;
      desenhar();
    } else {
      Dados.preferencia('onboardingVisto', true);
      window.location.href = 'camera.html';
    }
  });
  el.querySelector('[data-pular]').addEventListener('click', fechar);

  desenhar();
}