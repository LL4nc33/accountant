import { Component } from '@angular/core';
import { NumberRangeEditComponent } from './number-range-edit/number-range-edit.component';
import { ClarityModule } from '@clr/angular';
import { NumberRangeType } from '../../shared/entities/number-range';
import { CommonModule } from '@angular/common';
import { EditShellComponent, EditTabDirective } from '../core/edit-shell/edit-shell.component';

@Component({
    selector: 'app-number-ranges',
    imports: [NumberRangeEditComponent, ClarityModule, CommonModule, EditShellComponent, EditTabDirective],
    templateUrl: './number-ranges.component.html',
    styleUrl: './number-ranges.component.scss'
})
export class NumberRangesComponent {
  belegeTypes: NumberRangeType[] = [
    'Rechnungsnummern',
    'Angebotsnummern',
    'Auftragsnummern',
    'Lieferscheinnummern',
    'Rechnungskorrekturnummern',
    'Mahnungsnummern',
  ];
  stammdatenTypes: NumberRangeType[] = [
    'Kundennummern',
    'Lieferantennummern',
  ];
}
