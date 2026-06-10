import { CommonModule, JsonPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ClarityModule,
  ClrCheckboxModule,
  ClrComboboxModule,
  ClrFormsModule,
  ClrTabsModule,
} from '@clr/angular';
import { TranslateModule } from '@ngx-translate/core'; // Import the TranslateModule
import { TagPickerComponent } from '../../core/tag-picker/tag-picker.component';
import { CustomFieldsComponent } from '../../core/custom-fields/custom-fields.component';
import { remult } from 'remult';
import { Company } from '../../../shared/entities/company';
import { AutofieldComponent } from '../../core/autofield/autofield.component';
import { EditComponent } from '../../core/edit/edit.component';
import { AddressEditComponent } from '../address/address-edit.component';
import { Address } from '../../../shared/entities/address';
import { ViesButtonComponent } from '../../core/vies-button/vies-button.component';
import { featureFlags } from '../../feature-flags'; // Corrected import path

@Component({
    selector: 'app-company-edit',
    imports: [
        CommonModule,
        FormsModule,
        ClrFormsModule,
        ClarityModule,
        ClrCheckboxModule,
        ClrComboboxModule,
        AutofieldComponent,
        ClrTabsModule,
        RouterLink,
        AddressEditComponent,
        ViesButtonComponent,
        TranslateModule,
        TagPickerComponent,
        CustomFieldsComponent,
    ],
    templateUrl: './company-edit.component.html',
    styleUrl: './company-edit.component.scss'
})
export class CompanyEditComponent extends EditComponent<Company> implements OnInit {
  override repo = remult.repo(Company);

  previewCustomerNumber: string = '';

  override rootPath = '/crm/company/';
  featureFlags = featureFlags;
  constructor(router: Router) {
    super(router);
  }
  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    if (this.entity?.addresses?.length == 0) {
      await this.createRelationItem('addresses');
    }
    this.repo.relations(this.entity!); // Fix the missing closing parenthesis
    this.previewCustomerNumber = await this.entity!.previewCustomerNumber();
  }

  async onViesResult(r: any) {
    if (this.entity && r?.valid) {
      // Reflect verification locally for immediate UI feedback. The persistence
      // itself happens server-side inside /api/vies/check (which bypasses the
      // field-level allowApiUpdate: ['admin'] restriction). On reload the
      // server values are authoritative.
      this.entity.vatIdVerifiedAt = r.checkedAt ? new Date(r.checkedAt) : new Date();
      this.entity.vatIdVerifiedName = r.returnedName ?? '';
      if (this.entity.id) {
        const reloaded = await this.repo.findFirst({ id: this.entity.id });
        if (reloaded) this.entity = reloaded;
      }
    }
  }
}
