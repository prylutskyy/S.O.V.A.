import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'uk',
    version: '1.0.0',
    icons: {
      16: '/logo.jpg',
      32: '/logo.jpg',
      48: '/logo.jpg',
      128: '/logo.jpg',
    },
    action: {
      default_icon: {
        16: '/logo.jpg',
        32: '/logo.jpg',
        48: '/logo.jpg',
        128: '/logo.jpg',
      },
      default_title: '__MSG_extensionName__',
    },
    permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
  },
});
