/** Shared CSS tokens for the popup and isolated in-page components. */
import designTokensCss from './design-tokens.css?inline';

export const DESIGN_TOKENS_CSS = designTokensCss;

/**
 * Resolves the URL for the official project S.O.V.A. owl logo asset.
 */
export const getSovaLogoUrl = (): string => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    try {
      return chrome.runtime.getURL('logo.png');
    } catch {}
  }
  return '/logo.png';
};

/**
 * Renders the official S.O.V.A. owl logo photo/image element.
 */
export const getSovaLogoImg = (size: number = 24, borderRadius: string = '50%'): string => {
  const url = getSovaLogoUrl();
  return `<img class="ts-sova-logo-img" src="${url}" alt="С.О.В.А." style="width: ${size}px; height: ${size}px; border-radius: ${borderRadius}; object-fit: cover; display: block; flex-shrink: 0;" />`;
};

