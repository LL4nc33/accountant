import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ClrAlertModule } from '@clr/angular';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-about',
  imports: [CommonModule, ClrAlertModule],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent implements OnInit {
  version = '–';

  constructor(private http: HttpClient) {}

  async ngOnInit() {
    // VERSION is shipped as a static asset by Angular build (via assets array)
    // but if not configured, fall back to package.json.
    try {
      this.version = (await firstValueFrom(
        this.http.get('/VERSION', { responseType: 'text' }),
      )).trim();
    } catch {
      // Silent — version display is decorative.
    }
  }
}
