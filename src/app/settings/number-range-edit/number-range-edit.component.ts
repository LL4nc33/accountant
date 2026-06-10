import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClarityModule, ClrFormsModule } from '@clr/angular';
import Handlebars from 'handlebars';
import { ToastrService } from 'ngx-toastr';
import { remult } from 'remult';
import { TranslateModule } from '@ngx-translate/core';
import {
  NumberRange,
  NumberRangeType,
} from '../../../shared/entities/number-range';
import { AutofieldComponent } from '../../core/autofield/autofield.component';

@Component({
    selector: 'app-number-range-edit',
    imports: [
        CommonModule,
        FormsModule,
        ClrFormsModule,
        ClarityModule,
        AutofieldComponent,
        TranslateModule
    ],
    templateUrl: './number-range-edit.component.html',
    styleUrl: './number-range-edit.component.scss'
})
export class NumberRangeEditComponent implements OnInit {
  repo = remult.repo(NumberRange);

  @Input() numberRangeType!: NumberRangeType;

  entity: NumberRange | undefined;

  fields: any;

  preview: string = 'x';

  previewError: string | undefined;

  @ViewChild('form') form!: any;

  constructor(private toastr: ToastrService) {}

  async ngOnInit(): Promise<void> {
    this.fields = this.repo.metadata.fields;
    this.entity = await this.repo.findOne({
      where: { numberRangeType: this.numberRangeType },
    });
  }

  async save() {
    if (this.form.valid) {
      await this.repo.save(this.entity!);
      this.form.form.markAsPristine();
      this.toastr.success(
        'Der Nummernkreis "' + this.numberRangeType + '" wurde gespeichert.'
      );
    }
  }

  async reset() {
    this.entity = await this.repo.findOne({
      where: { numberRangeType: this.numberRangeType },
    });
    this.form.form.markAsPristine();
  }

  renderPreview() {
    try {
      this.previewError = undefined;
      return this.entity!.formatNextSequenceValue();
    } catch (err) {
      this.previewError = 'Fehlerhaftes Format';
      return '';
    }
  }

  helperText() {
    const helpTemplate = `Es stehen folgende Variablen zur Verfügung:<br/>
    \\{{NUMBER}} - Nächste Zahl ({{NUMBER}})<br/>
    \\{{pad 4 NUMBER}} - Nächste Zahl auf min. vier Stellen aufgefüllt ({{pad 4 NUMBER}})<br/>
    \\{{YYYY}} - Aktuelles Jahr ({{YYYY}})<br/>
    \\{{YY}} - Aktuelles Jahr ({{YY}})<br/>
    \\{{MM}} - Aktueller Monat ({{MM}})<br/>
    \\{{M}} - Aktueller Monat ({{M}})<br/>
    \\{{DD}} - Aktueller Tag ({{DD}})<br/>
    \\{{D}} - Aktueller Tag ({{D}})`;
    const template = Handlebars.compile(helpTemplate);
    return template(this.entity!.getFormatVariables(this.entity?.nextSequenceValue!));
  }
}
