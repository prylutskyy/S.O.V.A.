import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Sanctuary Prism: Оптичний контекстний захист та DLP',
    description:
      'Оптична система виявлення та нейтралізації вебзагроз: призма семантичного аналізу чатів, швейцарська лупа для аудиту DOM-структур, криптографічне сховище Personal Vault та локальний ШІ-арбітр.',
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
      default_title: 'Sanctuary Prism: Оптичний контекстний захист та DLP',
    },
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
  },
});
