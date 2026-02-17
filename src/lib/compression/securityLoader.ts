// ============================================
// SECURITY & TERM SUBSTITUTION LOADER
// ============================================

import type { SecurityMappings } from './types';

class SecurityLoader {
  private mappings: SecurityMappings = {};
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    const CACHE_SERVICE_URL = import.meta.env.VITE_CACHE_SERVICE_URL || 'http://localhost:8000';

    try {
      console.log('[SecurityLoader] Fetching encryption mappings from service...');

      const response = await fetch(`${CACHE_SERVICE_URL}/security/mappings`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.mappings = data.mappings || {};
      this.loaded = true;

      console.log(`[SecurityLoader] Loaded ${Object.keys(this.mappings).length} mappings from service`);
    } catch (error) {
      console.warn('[SecurityLoader] Service unreachable, using fallback mappings:', error);

      // Fallback: basic term substitutions
      this.mappings = {
        'in order to': 'to',
        'as a result of': 'because',
        'due to the fact that': 'because',
        'at this point in time': 'now',
        'in the event that': 'if',
        'for the purpose of': 'for',
        'with regard to': 'regarding',
        'in spite of the fact that': 'although',
        'it is important to note that': 'note:',
        'as previously mentioned': 'previously',
      };
      this.loaded = true;
    }
  }

  getMappings(): SecurityMappings {
    if (!this.loaded) {
      console.warn('[SecurityLoader] Mappings not loaded yet');
      return {};
    }
    return this.mappings;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /** Add a custom mapping (useful for testing) */
  addMapping(original: string, replacement: string): void {
    this.mappings[original] = replacement;
  }

  reset(): void {
    this.mappings = {};
    this.loaded = false;
  }
}

export const securityLoader = new SecurityLoader();
