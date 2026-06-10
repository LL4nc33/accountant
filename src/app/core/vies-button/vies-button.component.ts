import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ClarityModule } from '@clr/angular';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';

interface ViesResponse {
  cached?: boolean;
  vatId?: string;
  valid?: boolean;
  returnedName?: string;
  checkedAt?: string;
  error?: string;
}

@Component({
  selector: 'app-vies-button',
  imports: [CommonModule, ClarityModule],
  templateUrl: './vies-button.component.html',
  styleUrl: './vies-button.component.scss',
})
export class ViesButtonComponent {
  @Input() vatId = '';
  @Input() customerId = '';
  @Input() customerType: 'person' | 'company' | '' = '';
  @Output() result = new EventEmitter<ViesResponse>();

  loading = false;

  constructor(private http: HttpClient, private toastr: ToastrService) {}

  async check() {
    if (!this.vatId || this.vatId.trim().length < 3) {
      this.toastr.warning('Bitte zuerst eine UID eintragen.');
      return;
    }
    this.loading = true;
    try {
      const body: Record<string, string> = { vatId: this.vatId };
      if (this.customerId) body['customerId'] = this.customerId;
      if (this.customerType) body['customerType'] = this.customerType;
      const r = await firstValueFrom(
        this.http.post<ViesResponse>('/api/vies/check', body)
      );
      this.result.emit(r);
      if (r.valid) {
        const cacheNote = r.cached ? ' (gecached)' : '';
        this.toastr.success(`UID bestätigt: ${r.returnedName || '(kein Name)'}` + cacheNote);
      } else {
        this.toastr.error(`VIES sagt: UID ungültig. ${r.returnedName ? 'Returned: ' + r.returnedName : ''}`);
      }
    } catch (err: any) {
      const msg = err?.error?.detail ?? err?.error?.error ?? err?.message ?? 'unbekannter Fehler';
      this.toastr.warning(`VIES nicht erreichbar: ${msg}`);
    } finally {
      this.loading = false;
    }
  }
}
