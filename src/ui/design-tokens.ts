/**
 * Threat Shield Design Tokens
 * Exported as raw CSS string and typed constants for Shadow DOM injection.
 */

export const DESIGN_TOKENS_CSS = `
  :host, :root {
    --sanctuary-canvas:         #F5F5F7;
    --sanctuary-surface:        #FFFFFF;
    --sanctuary-surface-subtle: #FAFAFC;
    --sanctuary-surface-hover:  rgba(0, 0, 0, 0.03);
    --sanctuary-surface-active: rgba(0, 0, 0, 0.06);
    --sanctuary-glass-bg:       rgba(255, 255, 255, 0.85);
    --sanctuary-glass-elevated: rgba(255, 255, 255, 0.92);
    --sanctuary-backdrop:       rgba(0, 0, 0, 0.32);
    --sanctuary-glass-sheen:    rgba(255, 255, 255, 0.65);

    --sanctuary-ink-primary:    #1D1D1F;
    --sanctuary-ink-secondary:  #86868B;
    --sanctuary-ink-tertiary:   #A1A1A6;
    --sanctuary-ink-quaternary: rgba(0, 0, 0, 0.18);

    --sanctuary-blue:           #0071E3;
    --sanctuary-blue-hover:     #0077ED;
    --sanctuary-blue-active:    #005BB5;
    --sanctuary-blue-bg:        rgba(0, 113, 227, 0.08);
    --sanctuary-blue-bd:        rgba(0, 113, 227, 0.20);

    --sanctuary-green:          #34C759;
    --sanctuary-green-hover:    #2DB84F;
    --sanctuary-green-ink:      #248A3D;
    --sanctuary-green-bg:       rgba(52, 199, 89, 0.10);
    --sanctuary-green-bd:       rgba(52, 199, 89, 0.24);

    --sanctuary-amber:          #FF9500;
    --sanctuary-amber-hover:    #E08500;
    --sanctuary-amber-ink:      #B25900;
    --sanctuary-amber-bg:       rgba(255, 149, 0, 0.10);
    --sanctuary-amber-bd:       rgba(255, 149, 0, 0.24);

    --sanctuary-red:            #FF3B30;
    --sanctuary-red-hover:      #E03228;
    --sanctuary-red-ink:        #D70015;
    --sanctuary-red-bg:         rgba(255, 59, 48, 0.08);
    --sanctuary-red-bd:         rgba(255, 59, 48, 0.22);

    --sanctuary-hairline:        rgba(0, 0, 0, 0.07);
    --sanctuary-hairline-subtle: rgba(0, 0, 0, 0.04);
    --sanctuary-hairline-glass:  rgba(255, 255, 255, 0.45);
    --sanctuary-divider:         rgba(0, 0, 0, 0.05);

    --radius-pill:      9999px;
    --radius-modal:     22px;
    --radius-card:      14px;
    --radius-control:   10px;
    --radius-nested:    8px;
    --radius-micro:     4px;

    --shadow-sm:         0 1px 2px rgba(0, 0, 0, 0.03);
    --shadow-card:       0 1px 2px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.04);
    --shadow-card-hover: 0 2px 4px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.07);
    --shadow-modal:      0 0 0 1px rgba(255, 255, 255, 0.6) inset, 0 8px 20px rgba(0, 0, 0, 0.08), 0 24px 64px rgba(0, 0, 0, 0.16);
    --shadow-knob:       0 0.5px 1.5px rgba(0, 0, 0, 0.12), 0 2px 5px rgba(0, 0, 0, 0.16);
    --shadow-elevated:   0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04);

    --ease-apple-spring:  cubic-bezier(0.16, 1, 0.3, 1);
    --ease-apple-press:   cubic-bezier(0.25, 1, 0.5, 1);
    --ease-apple-sheet:   cubic-bezier(0.32, 0.72, 0, 1);
    --ease-apple-rebound: cubic-bezier(0.34, 1.56, 0.64, 1);

    --font-sanctuary: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono:      "SF Mono", Menlo, Consolas, Monaco, monospace;

    /* Sanctuary Core Obsidian Dark HUD Tokens (Apple VisionOS Calibrated) */
    --sc-obsidian-bg:               rgba(16, 16, 20, 0.94);
    --sc-obsidian-blur:             blur(32px) saturate(190%);
    --sc-obsidian-header:           rgba(24, 24, 30, 0.82);
    --sc-obsidian-nav:              rgba(14, 14, 18, 0.88);
    --sc-obsidian-card:             rgba(26, 26, 32, 0.70);
    --sc-obsidian-card-elevated:    linear-gradient(135deg, rgba(28, 28, 36, 0.85) 0%, rgba(18, 18, 24, 0.95) 100%);
    --sc-obsidian-well:             rgba(10, 10, 14, 0.85);
    --sc-obsidian-code:             rgba(8, 8, 12, 0.95);
    
    --sc-obsidian-border:           rgba(255, 255, 255, 0.12);
    --sc-obsidian-border-subtle:    rgba(255, 255, 255, 0.07);
    --sc-obsidian-sheen:            rgba(255, 255, 255, 0.18);

    --sc-ink-primary:               #FFFFFF;
    --sc-ink-secondary:             rgba(255, 255, 255, 0.85);
    --sc-ink-muted:                 rgba(255, 255, 255, 0.60);
    --sc-ink-subtle:                rgba(255, 255, 255, 0.40);

    --sc-emerald:                   #30D158;
    --sc-emerald-bg:                rgba(48, 209, 88, 0.16);
    --sc-emerald-border:            rgba(48, 209, 88, 0.32);
    --sc-emerald-glow:              0 0 16px rgba(48, 209, 88, 0.35);

    --sc-amber:                     #FF9F0A;
    --sc-amber-bg:                  rgba(255, 159, 10, 0.16);
    --sc-amber-border:              rgba(255, 159, 10, 0.32);
    --sc-amber-glow:                0 0 16px rgba(255, 159, 10, 0.35);

    --sc-crimson:                   #FF453A;
    --sc-crimson-bg:                rgba(255, 69, 58, 0.16);
    --sc-crimson-border:            rgba(255, 69, 58, 0.32);
    --sc-crimson-glow:              0 0 16px rgba(255, 69, 58, 0.35);

    --sc-sapphire:                  #0A84FF;
    --sc-sapphire-hover:            #0077ED;
    --sc-sapphire-bg:               rgba(10, 132, 255, 0.16);
    --sc-sapphire-border:           rgba(10, 132, 255, 0.32);
    --sc-sapphire-glow:             0 0 16px rgba(10, 132, 255, 0.40);

    --sc-squircle-window:           20px;
    --sc-squircle-card:             14px;
    --sc-squircle-control:          8px;
    --sc-squircle-chip:             6px;

    /* Backward compatibility */
    --fx-canvas:         var(--sanctuary-canvas);
    --fx-surface:        var(--sanctuary-surface);
    --fx-surface-hover:  var(--sanctuary-surface-hover);
    --fx-surface-active: var(--sanctuary-surface-active);
    --fx-border:         var(--sanctuary-hairline);
    --fx-border-subtle:  var(--sanctuary-hairline-subtle);
    --fx-text:           var(--sanctuary-ink-primary);
    --fx-text-secondary: var(--sanctuary-ink-secondary);
    --fx-text-muted:     var(--sanctuary-ink-tertiary);
    --fx-blue:           var(--sanctuary-blue);
    --fx-blue-hover:     var(--sanctuary-blue-hover);
    --fx-blue-active:    var(--sanctuary-blue-active);
    --fx-blue-bg:        var(--sanctuary-blue-bg);
    --fx-blue-bd:        var(--sanctuary-blue-bd);
    --fx-green:          var(--sanctuary-green);
    --fx-green-hover:    var(--sanctuary-green-hover);
    --fx-green-bg:       var(--sanctuary-green-bg);
    --fx-green-bd:       var(--sanctuary-green-bd);
    --fx-amber:          var(--sanctuary-amber);
    --fx-amber-bg:       var(--sanctuary-amber-bg);
    --fx-amber-bd:       var(--sanctuary-amber-bd);
    --fx-red:            var(--sanctuary-red);
    --fx-red-hover:      var(--sanctuary-red-hover);
    --fx-red-bg:         var(--sanctuary-red-bg);
    --fx-red-bd:         var(--sanctuary-red-bd);
  }
`;

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

