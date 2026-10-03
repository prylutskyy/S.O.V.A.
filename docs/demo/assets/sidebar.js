// sidebar.js - Injects the navigation sidebar into the page

document.addEventListener('DOMContentLoaded', () => {
  // Determine if we are on the root index or inside scenarios/
  const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
  const prefix = isRoot ? './scenarios/' : './';
  const rootPrefix = isRoot ? './' : '../';

  const sidebarHTML = `
    <nav class="sidebar">
      <div class="sidebar-header">
        <a href="${rootPrefix}index.html" class="sidebar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Threat Shield
        </a>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-title">Сценарії тестування</div>
        <ul class="nav-menu">
          <li class="nav-item">
            <a href="${prefix}gateway-test.html" class="nav-link" data-path="gateway-test.html" target="_blank" rel="noopener noreferrer">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Офіційний шлюз (LiqPay)
            </a>
          </li>
          <li class="nav-item">
            <a href="${prefix}delivery-scam.html" class="nav-link" data-path="delivery-scam.html" target="_blank" rel="noopener noreferrer">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              Приховані поля (Пошта)
            </a>
          </li>
          <li class="nav-item">
            <a href="${prefix}crypto-course.html" class="nav-link" data-path="crypto-course.html" target="_blank" rel="noopener noreferrer">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              Агресивний маркетинг
            </a>
          </li>
          <li class="nav-item">
            <a href="${prefix}marketplace-chat.html" class="nav-link" data-path="marketplace-chat.html" target="_blank" rel="noopener noreferrer">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              Маніпуляція в чаті (OLX)
            </a>
          </li>
          <li class="nav-item">
            <a href="${prefix}fake-survey.html" class="nav-link" data-path="fake-survey.html" target="_blank" rel="noopener noreferrer">
              <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Збір даних (Vault)
            </a>
          </li>
        </ul>
      </div>

      <div class="extension-status">
        <div class="status-dot"></div>
        <span>Розширення активне</span>
      </div>
    </nav>
  `;

  // Insert sidebar at the beginning of the body
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

  // Set active class based on current URL
  const currentPath = window.location.pathname.split('/').pop();
  if (currentPath && currentPath !== 'index.html') {
    const activeLink = document.querySelector(`.nav-link[data-path="${currentPath}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
    }
  }
});
