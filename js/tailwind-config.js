/* =============================================================
   tailwind-config.js
   Configuração do Tailwind CSS (versão CDN).
   Aqui definimos a paleta e as fontes da identidade JOVI,
   para usar classes como "bg-jovi", "text-sinal" e "font-display".
   ============================================================= */

tailwind.config = {
  theme: {
    extend: {
      colors: {
        // Azul oficial da marca JOVI (retirado do material do desafio)
        jovi: {
          DEFAULT: '#2046E8',
          50: '#EEF1FD',
          100: '#E2E8FC',
          200: '#C4D0F9',
          700: '#1834B8',
          900: '#0A1233', // azul-marinho usado no lugar do preto
        },
        // Amarelo de "sinal": indica o modo ativo e alertas da câmera
        sinal: '#FFC53D',
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
};