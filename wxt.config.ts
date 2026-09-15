import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Adaptive Threat Shield',
    description: 'Система адаптивного оцінювання та реагування на вебзагрози з урахуванням контексту користувацьких дій',
    version: '0.2.0',
    permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
});
