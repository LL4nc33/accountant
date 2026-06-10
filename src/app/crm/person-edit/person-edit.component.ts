import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { Person } from '../../../shared/entities/person';
import { remult, getValueList, FieldMetadata, FieldValidator } from 'remult';
import { FormsModule, NgForm } from '@angular/forms';
import {
  ClarityModule,
  ClrCheckboxModule,
  ClrComboboxModule,
  ClrFormsModule,
  ClrTabsModule,
} from '@clr/angular';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router'; // Import the Router module
import { AutofieldComponent } from '../../core/autofield/autofield.component';
import { EditComponent } from '../../core/edit/edit.component';
import { AddressEditComponent } from '../address/address-edit.component';
import { ViesButtonComponent } from '../../core/vies-button/vies-button.component';
import { TranslateModule } from '@ngx-translate/core'; // Import TranslateModule
import { featureFlags } from '../../feature-flags'; // Fix import path
import { TagPickerComponent } from '../../core/tag-picker/tag-picker.component';
import { CustomFieldsComponent } from '../../core/custom-fields/custom-fields.component';

@Component({
    selector: 'app-person-edit',
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
    templateUrl: './person-edit.component.html',
    styleUrl: './person-edit.component.scss'
})
export class PersonEditComponent extends EditComponent<Person> {
  repo = remult.repo(Person);
  override rootPath = '/crm/person/';

  previewCustomerNumber: string = '';
  featureFlags = featureFlags.personEdit;

  constructor(router: Router) {
    super(router);
  }

  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    if (this.entity?.addresses?.length == 0) {
      await this.createRelationItem('addresses');
    }
    this.repo.relations(this.entity!)
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
