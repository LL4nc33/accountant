import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Platzhalter-Component für Mobile-Routes deren echte Komponente noch nicht
 * gebaut ist. Liest pageName + desktopLink aus Route-Data.
 */
@Component({
  selector: 'm-stub',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="m-stub">
      <h2>Wird gebaut</h2>
      <p>{{ pageName }} ist auf Mobile noch nicht verfügbar. Du kannst stattdessen die Desktop-Variante öffnen.</p>
      <a [routerLink]="desktopLink" class="btn btn-primary">Auf Desktop öffnen</a>
    </div>
  `,
  styles: [`
    .m-stub {
      padding: 2rem 1rem;
      text-align: center;
      h2 { font-family: Georgia, serif; font-size: 1.5rem; margin-bottom: 0.5rem; }
      p { color: #666; margin-bottom: 1.5rem; max-width: 32ch; margin-left: auto; margin-right: auto; }
    }
  `],
})
export class MStubComponent implements OnInit {
  pageName = 'Diese Seite';
  desktopLink = '/';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    const data = this.route.snapshot.data;
    if (data['pageName']) this.pageName = data['pageName'];
    if (data['desktopLink']) this.desktopLink = data['desktopLink'];
  }
}
