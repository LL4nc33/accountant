import { Injectable } from '@angular/core';

/**
 * Erkennt Mobile-Viewport + verwaltet das Force-Desktop-Cookie-Override.
 *
 * Mobile-UI wird automatisch gerendert wenn:
 *  1. Viewport-Breite < 768px UND
 *  2. Cookie `oa-force-desktop` ist NICHT gesetzt
 *
 * URL-Mapping Desktop ↔ Mobile damit Sharing-Links beide Routen kennen.
 */
@Injectable({ providedIn: 'root' })
export class MobileDetectService {
  private static readonly BREAKPOINT_PX = 767;
  private static readonly COOKIE_DESKTOP = 'oa-force-desktop';
  private static readonly COOKIE_MOBILE = 'oa-force-mobile';

  /** Aktuelle Erkennung — Viewport-Größe und Cookie kombiniert. */
  isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MobileDetectService.BREAKPOINT_PX}px)`).matches;
  }

  isForceDesktop(): boolean {
    return this.hasCookie(MobileDetectService.COOKIE_DESKTOP);
  }

  isForceMobile(): boolean {
    return this.hasCookie(MobileDetectService.COOKIE_MOBILE);
  }

  private hasCookie(name: string): boolean {
    if (typeof document === 'undefined') return false;
    return document.cookie.split('; ').some((c) => c.startsWith(`${name}=true`));
  }

  /**
   * Welche Ansicht soll gerendert werden?
   * Priorität:
   *   1. Force-Mobile-Cookie → mobile (User hat „Mobile-Ansicht" geklickt)
   *   2. Force-Desktop-Cookie → desktop (User hat „Desktop-Ansicht" geklickt)
   *   3. Sonst: Viewport-Größe
   */
  shouldUseMobile(): boolean {
    if (this.isForceMobile()) return true;
    if (this.isForceDesktop()) return false;
    return this.isMobileViewport();
  }

  setForceDesktop(value: boolean) {
    this.setCookie(MobileDetectService.COOKIE_DESKTOP, value);
    if (value) this.setCookie(MobileDetectService.COOKIE_MOBILE, false);
  }

  setForceMobile(value: boolean) {
    this.setCookie(MobileDetectService.COOKIE_MOBILE, value);
    if (value) this.setCookie(MobileDetectService.COOKIE_DESKTOP, false);
  }

  private setCookie(name: string, value: boolean) {
    if (typeof document === 'undefined') return;
    if (value) {
      document.cookie = `${name}=true; Max-Age=31536000; Path=/`;
    } else {
      document.cookie = `${name}=; Max-Age=0; Path=/`;
    }
  }

  /** Mappt Desktop-URL auf Mobile-URL — falls bekannt, sonst leerer Mobile-Root. */
  desktopToMobile(url: string): string {
    const clean = url.split('?')[0].split('#')[0];

    if (clean === '/' || clean === '') return '/m';
    if (clean.startsWith('/crm/overview')) return '/m/customers';
    if (clean.match(/^\/crm\/(person|company)\/([^/]+)\/edit/)) {
      const id = clean.split('/')[3];
      return `/m/customer/${id}/edit`;
    }
    if (clean.match(/^\/crm\/(person|company)\/([^/]+)/)) {
      const id = clean.split('/')[3];
      return `/m/customer/${id}`;
    }
    if (clean === '/om/invoice') return '/m/invoices';
    if (clean.match(/^\/om\/invoice\/([^/]+)\/edit/)) {
      const id = clean.split('/')[3];
      return `/m/invoice/${id}/edit`;
    }
    if (clean.match(/^\/om\/invoice\/([^/]+)/)) {
      const id = clean.split('/')[3];
      return `/m/invoice/${id}`;
    }
    if (clean === '/om/offers') return '/m/offers';
    if (clean === '/pm/overview') return '/m/projects';
    if (clean.startsWith('/pm/project/')) {
      return clean.replace('/pm/project/', '/m/project/');
    }
    if (clean === '/pm/time-entries') return '/m/time-entries';
    if (clean === '/work-time') return '/m/work-time';
    if (clean.startsWith('/products')) return clean.replace('/products', '/m/products');
    if (clean.startsWith('/expenses')) return clean.replace('/expenses', '/m/expenses');
    if (clean.startsWith('/recurring')) return clean.replace('/recurring', '/m/recurring');
    if (clean.startsWith('/admin/')) return clean.replace('/admin/', '/m/admin/');
    if (clean.startsWith('/settings/')) return clean.replace('/settings/', '/m/settings/');
    if (clean === '/onboarding') return '/m/onboarding';
    if (clean === '/change-password') return '/m/change-password';
    if (clean === '/about') return '/m/about';
    if (clean === '/login') return '/login'; // shared

    return '/m';
  }

  /** Mappt Mobile-URL auf Desktop-URL — Umkehrung von desktopToMobile. */
  mobileToDesktop(url: string): string {
    const clean = url.split('?')[0].split('#')[0];

    if (clean === '/m' || clean === '/m/') return '/';
    if (clean === '/m/customers') return '/crm/overview';
    if (clean.match(/^\/m\/customer\/([^/]+)\/edit/)) {
      const id = clean.split('/')[3];
      return `/crm/person/${id}/edit`; // Default: person; falls Company kommt es vom CRM-Overview
    }
    if (clean.match(/^\/m\/customer\/([^/]+)/)) {
      const id = clean.split('/')[3];
      return `/crm/person/${id}`;
    }
    if (clean === '/m/invoices') return '/om/invoice';
    if (clean.match(/^\/m\/invoice\/([^/]+)\/edit/)) {
      const id = clean.split('/')[3];
      return `/om/invoice/${id}/edit`;
    }
    if (clean.match(/^\/m\/invoice\/([^/]+)/)) {
      const id = clean.split('/')[3];
      return `/om/invoice/${id}`;
    }
    if (clean === '/m/offers') return '/om/offers';
    if (clean === '/m/projects') return '/pm/overview';
    if (clean.startsWith('/m/project/')) {
      return clean.replace('/m/project/', '/pm/project/');
    }
    if (clean === '/m/time-entries') return '/pm/time-entries';
    if (clean === '/m/work-time') return '/work-time';
    if (clean.startsWith('/m/products')) return clean.replace('/m/products', '/products');
    if (clean.startsWith('/m/expenses')) return clean.replace('/m/expenses', '/expenses');
    if (clean.startsWith('/m/recurring')) return clean.replace('/m/recurring', '/recurring');
    if (clean.startsWith('/m/admin/')) return clean.replace('/m/admin/', '/admin/');
    if (clean.startsWith('/m/settings/')) return clean.replace('/m/settings/', '/settings/');
    if (clean === '/m/onboarding') return '/onboarding';
    if (clean === '/m/change-password') return '/change-password';
    if (clean === '/m/about') return '/about';

    return '/';
  }
}
