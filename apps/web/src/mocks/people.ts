import { PersonRole } from '@bingemate/shared';

/** Fictional people credited on the mock titles (mock-1 … mock-7), so the people pages work in mock mode. */
export const mockPeople: { id: string; name: string }[] = [
  { id: 'person-1', name: 'Mara Quill' },
  { id: 'person-2', name: 'Theo Varga' },
  { id: 'person-3', name: 'Ines Okafor' },
  { id: 'person-4', name: 'Jun Halloway' },
  { id: 'person-5', name: 'Priya Castell' },
  { id: 'person-6', name: 'Odile Marsh' },
];

/** (title, person, role). Mara–Theo–Ines–Jun form a chain; Odile shares nothing with anyone. */
export const mockCredits: { titleId: string; personId: string; role: PersonRole }[] = [
  { titleId: 'mock-1', personId: 'person-1', role: PersonRole.DIRECTOR },
  { titleId: 'mock-1', personId: 'person-2', role: PersonRole.ACTOR },
  { titleId: 'mock-2', personId: 'person-1', role: PersonRole.DIRECTOR },
  { titleId: 'mock-2', personId: 'person-1', role: PersonRole.WRITER },
  { titleId: 'mock-3', personId: 'person-2', role: PersonRole.ACTOR },
  { titleId: 'mock-3', personId: 'person-3', role: PersonRole.ACTOR },
  { titleId: 'mock-4', personId: 'person-3', role: PersonRole.WRITER },
  { titleId: 'mock-4', personId: 'person-4', role: PersonRole.ACTOR },
  { titleId: 'mock-5', personId: 'person-5', role: PersonRole.ACTOR },
  { titleId: 'mock-5', personId: 'person-4', role: PersonRole.ACTOR },
  { titleId: 'mock-6', personId: 'person-6', role: PersonRole.DIRECTOR },
];
