import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'С.О.В.А. (S.O.V.A.) — Система Оперативного Виявлення Аномалій',
    description:
      'Система Оперативного Виявлення Аномалій (С.О.В.А.): виявлення та нейтралізація ворожих вербувальників, пошуку коригувальників, зливу координат, соціальної інженерії та фішингу.',
    version: '1.0.0',
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
    action: {
      default_icon: {
        16: '/icon-16.png',
        32: '/icon-32.png',
        48: '/icon-48.png',
        128: '/icon-128.png',
      },
      default_title: 'С.О.В.А. (S.O.V.A.) — Система Оперативного Виявлення Аномалій',
    },
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
  },
});
