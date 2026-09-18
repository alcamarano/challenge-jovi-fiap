# Challenge JOVI Lens - Sprint 2 - FIAP

Aplicação web **mobile first** que usa a **câmera real do celular** pelo navegador.

**Tecnologias:** HTML, CSS, Tailwind CSS e Javascript.

## Como abrir

**No computador (com webcam):** abra o arquivo `index.html` no Chrome ou no Edge e permita o uso da câmera quando o navegador solicitar.

**No celular:** para visualização no navegador do celular, o projeto pode ser acessado através do link: [JOVI Lens]().

## Telas e funcionalidades

| Tela | Arquivo | O que faz |
|---|---|---|
| Início | `index.html` | Apresenta a solução, mostra suas fotos recentes e traz o tour de boas-vindas |
| Câmera | `camera.html` | Câmera real com **Captura Inteligente**, **Guia de Baixa Luz**, flash, **Aura Light**, grade, zoom, localização, foto e vídeo com som |
| Galeria | `galeria.html` | **Galeria Inteligente**: fotos por dia, por assunto, álbuns, favoritas, busca, seleção múltipla e sugestões automáticas |
| Foto | `foto.html` | Visualização, reprodução do vídeo, edição leve e **Compartilhamento Rápido** |

### O que é real no protótipo

- **Fotos:** tiradas pela câmera do aparelho. O zoom, o espelhamento da selfie e o tratamento do modo são gravados na imagem.
- **Vídeos:** gravados com `MediaRecorder`, com som quando o microfone é liberado (limite de 60 segundos).
- **Luminosidade:** medida a cada 0,6 segundo a partir da imagem da câmera. É ela que dispara a sugestão do modo Noturno e o Guia de Baixa Luz.
- **Flash e Aura Light:** usam a lanterna do aparelho quando ela existe. Na câmera frontal, a tela vira luz de apoio.
- **Localização:** opcional, pelo GPS do aparelho, e desligada por padrão.
- **Compartilhamento:** envia os arquivos pelo menu do próprio celular (WhatsApp, Instagram, e-mail), salva no aparelho ou copia a imagem.
- **Armazenamento:** as fotos e os vídeos ficam no aparelho, no IndexedDB do navegador. Nada é enviado para servidor nenhum.

## Acessibilidade e desempenho

- Layout mobile first; no computador, o app aparece centralizado como uma tela de celular.
- Navegação por teclado (setas trocam modo e foto, espaço tira foto, `Esc` fecha painéis) e rótulos para leitores de tela.
- Respeita a preferência do sistema por menos animação.
- A galeria usa miniaturas de 320px geradas na captura, por isso abre rápido mesmo com muitas fotos. A imagem original entra depois, só na tela cheia.
- O tempo de cada operação é mostrado na tela: salvamento da foto, organização da galeria e preparo dos arquivos para envio.
