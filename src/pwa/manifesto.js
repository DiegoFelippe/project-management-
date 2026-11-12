// Manifesto do app instalável (PWA). Usado pelo vite-plugin-pwa no vite.config.js.
// Os ícones saem da logo da IXC Consult (public/icons); o "maskable" tem margem para os
// celulares recortarem em círculo ou quadrado arredondado sem cortar a logo.
export const manifesto = {
  name: 'IXC Consult',
  short_name: 'IXC Consult',
  description: 'Gestão de projetos, times e pessoas para consultorias.',
  lang: 'pt-BR',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  // Instalado no computador: sem a barra de título; a barra de cima do app faz o papel dela.
  display_override: ['window-controls-overlay'],
  theme_color: '#ffffff',
  background_color: '#ffffff',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
