import {
  AfterViewInit,
  Component,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ClarityModule, ClrFormsModule } from '@clr/angular';
import { FieldsMetadata, getEntityRef, remult } from 'remult';
import { Invoice } from '../../../shared/entities/invoice';
import { InvoiceItem } from '../../../shared/entities/invoice-item';
import { CompanySettings } from '../../../shared/entities/company-settings';
import { vatPresetFor } from '../../../shared/entities/vat-presets';
import { Product } from '../../../shared/entities/product';
import { AutofieldComponent } from '../../core/autofield/autofield.component';
import { EditComponent } from '../../core/edit/edit.component';
import { ModulesService } from '../../core/modules.service';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-invoice-item-edit',
  imports: [
    AutofieldComponent,
    FormsModule,
    ClrFormsModule,
    TranslateModule,
    ClarityModule,
    CommonModule,
  ],
  templateUrl: './invoice-item-edit.component.html',
  styleUrl: './invoice-item-edit.component.scss',
})
export class InvoiceItemEditComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @Input() item!: InvoiceItem;
  fields!: FieldsMetadata<InvoiceItem>;

  @Input() parent!: EditComponent<Invoice>;

  @ViewChild(NgForm) form!: NgForm;

  vatOptions: number[] = [0];
  loadedPreset = false;

  // Produkt-Katalog: nur aktiv wenn moduleProducts angeschaltet
  products: Product[] = [];
  selectedProductId = '';
  productsEnabled = false;

  constructor(public modules: ModulesService) {}

  async ngOnInit(): Promise<void> {
    if (this.item) {
      this.fields = getEntityRef(this.item).metadata
        .fields as FieldsMetadata<InvoiceItem>;
    }
    await this.loadPreset();
    this.productsEnabled = this.modules.isEnabled('products');
    if (this.productsEnabled) {
      this.products = await remult.repo(Product).find({ orderBy: { name: 'asc' } });
      if (this.item?.productId) {
        this.selectedProductId = this.item.productId;
      }
    }
  }

  onProductPicked(productId: string): void {
    const p = this.products.find((x) => x.id === productId);
    if (!p) {
      this.item.productId = '';
      return;
    }
    this.item.productId = p.id;
    this.item.name = p.name;
    this.item.description = p.description;
    this.item.price = p.defaultPrice;
    this.item.vat = p.defaultVat;
  }

  private async loadPreset(): Promise<void> {
    const s = await remult.repo(CompanySettings).findFirst();
    const preset = vatPresetFor(s?.country ?? 'AT');
    this.vatOptions = preset.options;
    // Only set the country-driven default on NEW items (no id yet);
    // existing items keep their deliberately-chosen rate on reload.
    if (this.item && !this.item.id && !this.loadedPreset) {
      this.item.vat = s?.isKleinunternehmer ? 0 : preset.default;
    }
    this.loadedPreset = true;
  }

  ngAfterViewInit(): void {
    this.parent.registerFormForValidation(this.form);
  }
  ngOnDestroy(): void {
    this.parent.deregisterFormForValidation(this.form);
  }
}
