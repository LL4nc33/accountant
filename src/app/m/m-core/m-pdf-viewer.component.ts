import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ClarityModule } from '@clr/angular';

/**
 * PDF-Viewer für Mobile. Default: iframe mit native Browser-PDF-Renderer.
 * iOS-Safari-Fallback: großer „Im neuen Tab öffnen"-Button (iframes sind
 * dort instabil seit iOS 14).
 */
@Component({
  selector: 'm-pdf-viewer',
  standalone: true,
  imports: [CommonModule, ClarityModule],
  template: `
    <div class="m-pdf">
      <iframe *ngIf="!isIOSSafari" [src]="safeUrl" class="m-pdf-frame" title="PDF-Vorschau"></iframe>

      <div *ngIf="isIOSSafari" class="m-pdf-fallback">
        <cds-icon shape="file" size="48"></cds-icon>
        <h3>{{ title || 'PDF-Vorschau' }}</h3>
        <p>iOS Safari zeigt PDFs am besten in einem neuen Tab.</p>
        <a [href]="url" target="_blank" rel="noopener" class="btn btn-primary">
          <cds-icon shape="pop-out" size="16"></cds-icon>
          PDF im neuen Tab öffnen
        </a>
      </div>

      <div class="m-pdf-actions">
        <a [href]="url" download class="btn btn-outline">
          <cds-icon shape="download" size="16"></cds-icon>
          Speichern
        </a>
        <a [href]="url" target="_blank" rel="noopener" class="btn btn-outline" *ngIf="!isIOSSafari">
          <cds-icon shape="pop-out" size="16"></cds-icon>
          Neue Ansicht
        </a>
      </div>
    </div>
  `,
  styles: [`
    .m-pdf {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .m-pdf-frame {
      width: 100%;
      height: 75vh;
      border: 1px solid #E8E8E8;
      border-radius: 6px;
      background: white;
    }
    .m-pdf-fallback {
      padding: 2rem 1rem;
      text-align: center;
      background: white;
      border: 1px solid #E8E8E8;
      border-radius: 6px;

      cds-icon { color: #666; margin-bottom: 1rem; }
      h3 {
        font-family: Georgia, serif;
        font-size: 1.3rem;
        margin: 0.5rem 0;
      }
      p { color: #666; margin: 0 0 1.25rem; }
      .btn { display: inline-flex; gap: 0.4rem; align-items: center; }
    }
    .m-pdf-actions {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem 0;
      .btn { display: inline-flex; gap: 0.4rem; align-items: center; }
    }
  `],
})
export class MPdfViewerComponent implements OnInit {
  @Input() url = '';
  @Input() title = '';

  safeUrl: SafeResourceUrl | null = null;
  isIOSSafari = false;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    this.isIOSSafari = this.detectIOSSafari();
  }

  private detectIOSSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
  }
}
