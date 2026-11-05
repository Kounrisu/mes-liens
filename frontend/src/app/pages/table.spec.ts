import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { TablePage } from './table';
import { LinkService } from '../core/link.service';

describe('category subtree filtering', () => {
  it('shows descendants of Formation and Angular without including similarly named categories', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LinkService,
          useValue: {
            activeLinks: signal([
              { id: 'a', category: 'formation / angular', deletedAt: null },
              { id: 'b', category: 'formation / angular / signals', deletedAt: null },
              { id: 'c', category: 'formation / java', deletedAt: null },
              { id: 'd', category: 'formations', deletedAt: null },
            ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(TablePage);
    const page = fixture.componentInstance as any;
    fixture.componentRef.setInput('category', 'formation');
    expect(page.rows().map((l: { id: string }) => l.id)).toEqual(['a', 'b', 'c']);
    fixture.componentRef.setInput('category', 'formation / angular');
    expect(page.rows().map((l: { id: string }) => l.id)).toEqual(['a', 'b']);
    expect(
      page.categories().find((c: { category: string }) => c.category === 'formation / devops')
        ?.count,
    ).toBe(0);
  });
});
