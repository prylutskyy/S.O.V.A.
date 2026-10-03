import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'uk',
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
      default_title: '__MSG_extensionName__',
    },
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
  },
});
