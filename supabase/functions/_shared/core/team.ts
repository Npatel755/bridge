import { askNetwork, parseGoal, type AskOptions, type Recommendation } from './ask.ts';
import { cleanText, normalizeTag, relatedTags, tagLabel } from './normalize.ts';
import type { ContactEdge, ContactRecord } from './types.ts';

export interface TeamRole {
  id: string;
  title: string;
  description: string;
  tags: string[];
  /** true when added or edited by the user rather than suggested. */
  custom?: boolean;
}

export interface RoleMatch {
  role: TeamRole;
  candidates: Recommendation[];
  filled: boolean;
}

export interface TeamPlan {
  project: string;
  roles: RoleMatch[];
  unfilled: TeamRole[];
  mode: 'deterministic' | 'llm';
}

interface RoleTemplate {
  id: string;
  title: string;
  description: string;
  tags: string[];
  when: (text: string, tags: Set<string>) => boolean;
}

const has = (tags: Set<string>, ...want: string[]) => want.some((t) => tags.has(t));
const HARDWARE = /\b(device|hardware|light|lamp|sensor|gadget|wearable|robot|prototype|bike|helmet|lock|drone|electronics)\b/;
const SOFTWARE = /\b(app|platform|website|web|saas|software|dashboard|api)\b/;

const TEMPLATES: RoleTemplate[] = [
  { id: 'embedded', title: 'Embedded electronics', description: 'Circuit, microcontroller, and firmware work for the device.', tags: ['embedded-systems', 'firmware', 'pcb-design', 'electrical-engineering'], when: (t, g) => HARDWARE.test(t) || has(g, 'embedded-systems', 'iot', 'hardware-prototyping') },
  { id: 'industrial-design', title: 'Industrial design', description: 'Form factor, enclosure, mounting, and CAD.', tags: ['industrial-design', 'product-design', 'cad', '3d-printing'], when: (t, g) => HARDWARE.test(t) || has(g, 'hardware-prototyping') },
  { id: 'manufacturing', title: 'Manufacturing advice', description: 'Design for manufacturing, sourcing, and small production runs.', tags: ['manufacturing', 'injection-molding', 'supply-chain', 'sourcing'], when: (t, g) => HARDWARE.test(t) || has(g, 'manufacturing') },
  { id: 'computer-vision', title: 'Computer vision / ML', description: 'Models and pipelines for perception or prediction.', tags: ['computer-vision', 'machine-learning', 'deep-learning'], when: (_t, g) => has(g, 'computer-vision', 'machine-learning', 'ai', 'llms') },
  { id: 'mobile', title: 'App development', description: 'Companion or standalone mobile/web app.', tags: ['mobile-development', 'frontend', 'react', 'backend'], when: (t, g) => SOFTWARE.test(t) || has(g, 'mobile-development', 'frontend', 'backend') },
  { id: 'ux', title: 'UX & user research', description: 'Interviews, flows, and usability.', tags: ['ux-design', 'user-research', 'design-thinking'], when: (t) => SOFTWARE.test(t) || /\b(users?|customers?)\b/.test(t) },
  { id: 'gtm', title: 'Go-to-market', description: 'Positioning, early customers, and launch.', tags: ['marketing', 'sales', 'branding'], when: (t, g) => /\b(startup|launch|sell|customers?|market|business|company)\b/.test(t) || has(g, 'startups') },
  { id: 'fundraising', title: 'Fundraising advice', description: 'Pitching, investors, and grants.', tags: ['fundraising', 'venture-capital'], when: (t, g) => /\b(raise|funding|investors?|seed|grant)\b/.test(t) || has(g, 'fundraising', 'venture-capital') },
];

/** Domain interest → testers role, e.g. cyclists for a bike product. */
const TESTER_DOMAINS: { tag: string; title: string }[] = [
  { tag: 'cycling', title: 'Cyclists to test it' },
  { tag: 'running', title: 'Runners to test it' },
  { tag: 'climbing', title: 'Climbers to test it' },
  { tag: 'outdoors', title: 'Outdoor enthusiasts to test it' },
  { tag: 'gaming', title: 'Gamers to test it' },
  { tag: 'healthcare', title: 'Clinicians or patients to give feedback' },
  { tag: 'fitness', title: 'Fitness enthusiasts to test it' },
];

/** Break a project description into the kinds of help it needs (deterministic fallback). */
export function decomposeProject(project: string): TeamRole[] {
  const text = cleanText(project);
  const goal = parseGoal(project);
  const tags = new Set(goal.tags);
  const roles: TeamRole[] = TEMPLATES.filter((t) => t.when(text, tags)).map(({ id, title, description, tags }) => ({ id, title, description, tags }));
  for (const d of TESTER_DOMAINS) {
    if (tags.has(d.tag)) roles.push({ id: `testers-${d.tag}`, title: d.title, description: `People who care about ${tagLabel(d.tag).toLowerCase()} and can give real-world feedback.`, tags: [d.tag, 'user-testing'] });
  }
  if (!roles.length) {
    for (const tag of goal.tags.slice(0, 4)) roles.push({ id: `skill-${tag}`, title: tagLabel(tag), description: `Someone with ${tagLabel(tag).toLowerCase()} experience.`, tags: [tag] });
  }
  return roles;
}

export function customRole(title: string, tags: string[], description = ''): TeamRole {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  return { id: `custom-${normalizeTag(title)}`, title, description: description || `Custom role: ${title}`, tags: normalized.length ? normalized : [normalizeTag(title)], custom: true };
}

export function buildTeam(
  project: string,
  roles: TeamRole[],
  contacts: ContactRecord[],
  edges: ContactEdge[],
  opts: AskOptions & { perRole?: number; minScore?: number } = {},
): TeamPlan {
  const perRole = opts.perRole ?? 3;
  const results: RoleMatch[] = roles.map((role) => {
    const related = [...new Set(role.tags.flatMap(relatedTags))].filter((t) => !role.tags.includes(t));
    const res = askNetwork(`${role.title}: ${project}`, contacts, edges, { ...opts, overrideTags: { tags: role.tags, related }, limit: perRole });
    // A role is only "filled" by someone with an exact, non-rejected skill/interest match.
    const candidates = res.recommendations.filter((r) => r.matchedTags.some((m) => m.exact) && r.score >= (opts.minScore ?? 0));
    return { role, candidates, filled: candidates.length > 0 };
  });
  return { project, roles: results, unfilled: results.filter((r) => !r.filled).map((r) => r.role), mode: 'deterministic' };
}
