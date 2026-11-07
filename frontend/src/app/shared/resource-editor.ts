import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '../core/i18n';
import { LibraryData } from '../core/library';
import { playlistUrl } from '../core/youtube-playlists';

@Component({
  selector: 'app-resource-editor',
  imports: [TranslatePipe],
  template: `
    <label
      >{{ 'Description' | t }}
      <textarea
        rows="3"
        maxlength="10000"
        [value]="value().description"
        (input)="set('description', text($event))"
      ></textarea>
    </label>
    <div class="cols">
      <label
        >{{ 'Créateur / auteur' | t }}
        <input
          type="text"
          maxlength="300"
          [value]="value().creator"
          (input)="set('creator', text($event))"
        />
      </label>
      <label
        >{{ 'Date de publication' | t }}
        <input
          type="date"
          [value]="value().publishedAt"
          (input)="set('publishedAt', text($event))"
        />
      </label>
    </div>
    @if (youtube()) {
      <label
        >{{ 'Playlists YouTube' | t }}
        <small>{{
          'Une adresse de playlist par ligne. Une vidéo peut appartenir à plusieurs playlists.' | t
        }}</small>
        <textarea
          rows="2"
          [value]="
            value().playlists.join(
              '
'
            )
          "
          (change)="playlists(text($event))"
          placeholder="https://www.youtube.com/playlist?list=…"
        ></textarea>
      </label>
    }
  `,
})
export class ResourceEditor {
  readonly value = input.required<LibraryData>();
  readonly youtube = input(false);
  readonly changed = output<LibraryData>();
  text(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  set(key: 'description' | 'creator' | 'publishedAt', value: string) {
    this.changed.emit({ ...this.value(), [key]: value });
  }
  playlists(raw: string) {
    this.changed.emit({
      ...this.value(),
      playlists: [
        ...new Set(
          raw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => playlistUrl(s) || s),
        ),
      ],
    });
  }
}
