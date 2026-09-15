import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Adaptive Threat Shield',
    description: 'Система адаптивного оцінювання та реагування на вебзагрози з урахуванням контексту користувацьких дій',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
