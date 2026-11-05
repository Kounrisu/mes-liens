import { TranslatePipe } from '../core/i18n';
import { Component, input, output } from '@angular/core';
import { LibraryData, LEARNING_STATES, RESOURCE_TYPES } from '../core/library';

@Component({
  imports: [TranslatePipe],
  selector: 'app-library-editor',
  template: `
    <details class="learning-fields" [open]="expanded()">
      <summary>{{ 'Organisation et apprentissage' | t }}</summary>
      <div class="cols">
        <label>
          {{ 'Type de ressource' | t }}
          <select [value]="value().resourceType" (change)="set('resourceType', text($event))">
            @for (s of types; track s.key) {
              <option [value]="s.key">{{ s.label | t }}</option>
            }
          </select></label
        >
        <label>
          {{ 'Progression' | t }}
          <select [value]="value().learningStatus" (change)="set('learningStatus', text($event))">
            @for (s of states; track s.key) {
              <option [value]="s.key">{{ s.label | t }}</option>
            }
          </select></label
        >
        <label>
          {{ 'Collections' | t }} <small> {{ 'Séparées par des virgules' | t }} </small
          ><input
            type="text"
            [value]="value().collections.join(', ')"
            (input)="collections(text($event))"
            [placeholder]="'Angular au quotidien, Projet personnel' | t"
        /></label>
        <label>
          {{ 'À revoir le' | t }}
          <input type="date" [value]="value().reviewOn" (input)="set('reviewOn', text($event))"
        /></label>
      </div>
      <label>
        {{ 'Mon objectif' | t }}
        <input
          type="text"
          maxlength="10000"
          [value]="value().objective"
          (input)="set('objective', text($event))"
          [placeholder]="'Ce que je veux savoir faire' | t"
      /></label>
      <div class="cols">
        <label>
          {{ 'Reprendre à' | t }}
          <input
            type="text"
            maxlength="10000"
            [value]="value().resumeAt"
            (input)="set('resumeAt', text($event))"
            [placeholder]="'Chapitre 4, vidéo à 12:30…' | t"
        /></label>
        <label>
          {{ 'Prochaine action' | t }}
          <input
            type="text"
            maxlength="10000"
            [value]="value().nextAction"
            (input)="set('nextAction', text($event))"
            [placeholder]="'Faire l\\'exercice sur les signals' | t"
        /></label>
      </div>
      <label>
        {{ "Ce que j'ai appris" | t }}
        <textarea
          rows="4"
          maxlength="10000"
          [value]="value().learned"
          (input)="set('learned', text($event))"
          [placeholder]="'Une explication avec mes propres mots…' | t"
        ></textarea>
      </label>
      <label>
        {{ "Où je peux l'appliquer" | t }}
        <textarea
          rows="2"
          maxlength="10000"
          [value]="value().applyTo"
          (input)="set('applyTo', text($event))"
        ></textarea>
      </label>
      <div class="row">
        <label class="check"
          ><input
            type="checkbox"
            [checked]="value().reviewed"
            (change)="flag('reviewed', $event)"
          />
          {{ 'Classement vérifié (retirer de À trier)' | t }}
        </label>
        <label class="check"
          ><input
            type="checkbox"
            [checked]="value().archived"
            (change)="flag('archived', $event)"
          />
          {{ 'Archiver' | t }}
        </label>
      </div>
    </details>
  `,
})
export class LibraryEditor {
  readonly value = input.required<LibraryData>();
  readonly expanded = input(false);
  readonly changed = output<LibraryData>();
  readonly types = Object.entries(RESOURCE_TYPES).map(([key, label]) => ({ key, label }));
  readonly states = Object.entries(LEARNING_STATES).map(([key, label]) => ({ key, label }));
  text(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
  set(key: keyof LibraryData, value: string): void {
    this.changed.emit({ ...this.value(), [key]: value });
  }
  flag(key: 'reviewed' | 'archived', e: Event): void {
    this.changed.emit({ ...this.value(), [key]: (e.target as HTMLInputElement).checked });
  }
  collections(raw: string): void {
    this.changed.emit({
      ...this.value(),
      collections: [
        ...new Set(
          raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ],
    });
  }
}
