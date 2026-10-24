import { describe, expect, it } from 'vitest';
import { detectDuplicates, findHeaderRow, guessMapping, mapRows, parseCsv } from '../src/index.ts';

const LINKEDIN = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen,https://www.linkedin.com/in/mayachen,,Spoke Labs,"Embedded Engineer, Firmware",12 Mar 2025
Priya,Nair,https://www.linkedin.com/in/priyanair,priya@example.com,Forge Mfg,Manufacturing Lead,01 Jan 2024
Maya,Chen,https://www.linkedin.com/in/mayachen/,,Spoke Labs,Embedded Engineer,12 Mar 2025
`;

describe('CSV import', () => {
  it('parses quoted fields and skips the LinkedIn preamble', () => {
    const rows = parseCsv(LINKEDIN);
    const h = findHeaderRow(rows);
    expect(rows[h][0]).toBe('First Name');
    const mapping = guessMapping(rows[h]);
    expect(mapping).toMatchObject({ firstName: 0, lastName: 1, profileUrl: 2, email: 3, company: 4, title: 5, connectedOn: 6 });
    const mapped = mapRows(rows.slice(h + 1), mapping);
    expect(mapped[0]).toMatchObject({ displayName: 'Maya Chen', title: 'Embedded Engineer, Firmware', email: null });
  });

  it('detects duplicates against existing contacts and within the file', () => {
    const rows = parseCsv(LINKEDIN);
    const h = findHeaderRow(rows);
    const mapped = mapRows(rows.slice(h + 1), guessMapping(rows[h]));
    const dups = detectDuplicates(mapped, [
      { id: 'p1', displayName: 'Priya N.', email: 'PRIYA@example.com' },
      { id: 'm-other', displayName: 'Maya Chen', company: 'Other Co' },
    ]);
    expect(dups.find((d) => d.rowIndex === 1)).toMatchObject({ existingId: 'p1', kind: 'email', strength: 'strong' });
    expect(dups.find((d) => d.rowIndex === 0)).toMatchObject({ existingId: 'm-other', kind: 'name_only', strength: 'weak' });
    expect(dups.find((d) => d.rowIndex === 2)).toMatchObject({ kind: 'name_only' });
  });

  it('drops invalid emails and non-http urls', () => {
    const mapped = mapRows([['A B', 'not-an-email', 'javascript:alert(1)']], { fullName: 0, email: 1, profileUrl: 2 });
    expect(mapped[0].email).toBeNull();
    expect(mapped[0].profileUrl).toBeNull();
    expect(mapped[0].warnings).toHaveLength(2);
  });
});
