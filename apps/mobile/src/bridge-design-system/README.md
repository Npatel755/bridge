# Bridge design system

Everything needed to make Bridge look and feel consistent: tokens, fonts, ready-made React Native components, and the rules for combining them. It does not prescribe specific screens. Design every screen by composing these pieces and following these rules.

Style in one line: **a pocket notebook shaped like a Rolodex.** Every person is an index card, every claim quotes its source, and the only thing that buzzes is someone nearby worth meeting.

---

## 1. Using this package

- Put this folder wherever fits the project's structure and import from its `index.ts`. Keep file and token names so the rules here still apply.
- **Dependencies:** `react-native-svg`, `lucide-react-native`, `expo-haptics`, `expo-font`, `@expo-google-fonts/literata`, `@expo-google-fonts/inter-tight`. Install with `npx expo install` so versions match the Expo SDK.
- **Fonts:** call `useBridgeFonts()` at the app root and hold the splash screen until it returns `true`.
- **Theme:** call `useTheme()` for `colors` (switches automatically for dark mode), `layout`, `type`, `radius`, `sizes`. **Never hardcode** a hex color, font size, spacing value, or radius anywhere in the app.
- **Tabs:** pass `tabBarOptions(colors)` to Expo Router's `<Tabs screenOptions>`.
- The components are a starting point. Extend them or add new ones, but build new ones from the same tokens and rules. If a rule can't be followed on a platform, use the closest equivalent and leave a comment.

**Components at a glance**

| Component | Use it for |
| --- | --- |
| `Screen`, `ScreenHeader` | Every screen: background, gutter, title, pinned footer button |
| `Section`, `Group`, `Row` | All lists and grouped information |
| `PersonCard` | The one person in focus on a screen |
| `PersonRow` | Every other person |
| `Evidence`, `MarkedText` | Showing why Bridge believes something |
| `RouteLine` | How the user would reach someone (also graph edges) |
| `Tag`, `TagList` | Skills, interests, filters, picker chips |
| `Button`, `IconButton`, `Toggle` | Actions |
| `SearchField`, `AskField` | Text entry |
| `NearbyMatchCard`, `NearbyDot`, `distanceBand` | Nearby discovery |
| `ProgressBar`, `EmptyRow` | Multi-step flows, empty or unmet slots |
| `BText` | Any text, in a named type style |

---

## 2. Principles

1. **People are index cards.** The person in focus is a `PersonCard`: a card with a letter tab, like a Rolodex entry. Everyone else is a `PersonRow` that opens their card. Use `front` on a card when more cards follow it, so two card edges peek behind. No avatar bubbles or profile-photo-first layouts.
2. **Claims carry receipts.** Anything Bridge says about a person (a skill, a reason they match, a connection) shows its source and date via `Evidence`, with the matching words marked. No source, no claim. Old or AI-suggested info is visibly flagged (`stale`, `Tag variant="suggested"`, a dashed route line).
3. **Reserved colors mean one thing each.**
   - `highlight` (lime): only for marking evidence words.
   - `nearby` (rose): only for Nearby (match card, status dot, toggle, tab badge). Never for errors or promotion.
   - `action` (ink blue): the only color that means "do something"; also confirmed relationship lines.
   - `caution`: only for stale or uncertain info.
4. **Two typefaces with clear roles.** Literata for anything a person wrote or would write: names, notes, quotes, questions, screen titles, the ask field. Inter Tight for everything the app says: buttons, labels, captions, settings. If the user typed it, it's Literata.
5. **Clean, not empty.** Fill screens with useful information, organized so nothing competes (section 4).
6. **Honest by design.** Intros are possibilities, never promises. Followers aren't friends. Fallback search is never labelled AI. Location is always coarse. Simulated matches say so.

---

## 3. Foundations

**Color roles** (values in `theme.ts`, light and dark)
- Surfaces: `paper` is the screen. `card` is any container. `tab` is chips, card tabs, and pressed rows.
- Lines: `cardEdge` borders containers (dashed = suggested, empty, or unconfirmed). `rule` is the hairline between rows.
- Text: `ink` primary, `inkSoft` secondary (roles, sources, dates, section labels), `inkFaint` placeholders only.
- Accents: `action`, `highlight`, `nearby` / `nearbyInk` / `nearbyWash`, `cautionInk` / `cautionWash`, `confirmInk`, `dangerInk`.
- At most two accent colors visible on one screen.

**Type** (use `BText variant=…`)
- Titles: `display` (screen title), `title` (sheet or section heading).
- Names: `name` (person card), `rowName` (person row).
- Writing: `note` (quotes, notes).
- Interface: `body` and `rowText` (UI text), `secondary` (supporting line), `label` (section labels, small buttons), `caption` (tiny metadata).
- At most three text sizes per screen besides the title. Sentence case everywhere. No all-caps labels.

**Layout rhythm** (`layout`)
- 20px screen gutter. 24px between groups. 10px from a section label to its group.
- Rows: 13px vertical and 16px horizontal padding, at least 48px tall.
- Person card padding 18px. Touch targets at least 44×44.

**Shape**
- Radius 6 for cards, inputs, buttons, and card tabs (top corners only).
- Radius 4 for chips and marks. Fully round only for toggles and dots.
- No pill-shaped buttons.

**Depth.** Flat. The only resting depth is the Rolodex peek (`front`). A soft lift (`elevated`) is only for something that just appeared or is being dragged.

**Iconography.** Lucide outline icons, strokeWidth 1.75, 20px in content and 22px in the tab bar, colored `ink`, `inkSoft`, or `action`. No filled icons, no emoji.

**Motion**
- Movement only answers an action: card flip 180ms ease-out, sheets rising, rows expanding.
- The only looping animation is `NearbyDot` breathing.
- Respect Reduce Motion: use crossfades instead of movement, and no loop.

**Haptics.** Already wired into components:
- Light impact on primary buttons.
- Selection tick on toggles. Also add it on A–Z scrubbers.
- Success notification when a Nearby match appears.

Always pair a haptic with a visible change. In the background, haptics come from OS notifications, not JS.

**Accessibility**
- Text contrast is at least 4.5:1 in both themes; the tokens already pass, so don't lighten text below `inkSoft`.
- Every icon-only control has a label.
- A person card reads as one label ("Maya Chen, direct").
- Support Dynamic Type: containers grow, and names wrap rather than truncate.

**Dark mode.** Supported from day one through `useTheme()`. Check every screen in both modes.

---

## 4. Clean, not empty: composition rules

Minimal means every element earns its place inside a clear structure. It does not mean blank space.

1. **One primary button per screen.** Usually pinned in `Screen footer` for flows, or inside the focused `PersonCard`. Everything else is secondary, ghost, a tappable row, or an `IconButton`.
2. **Group, then list.** Organize content into a few `Section`s, each with a short label and one `Group`. Never put a Group or card inside another Group.
3. **One row pattern.** Use `Row` / `PersonRow`:
   - a primary line;
   - an optional one-sentence secondary line;
   - at most one trailing element (route line, status word, chevron, or ghost button).

   Don't invent a new layout per section.
4. **One expanded item per list.** The top result or selected person is a `PersonCard`; the rest are rows.
5. **Every line helps the user decide or act.**
   - Keep: why someone matches, when info is from, what's left to do, what happens next.
   - Cut: decorative badges, duplicate counts, labels that restate the obvious, explanations of how the system works.
6. **Progressive disclosure.** Long notes, every tag, settings, and moderation actions (mute, block, report) live one tap away: a detail screen, a sheet, or an overflow `IconButton`.
7. **Fill in rhythm.** Lay out real content in the standard spacing. Leftover space belongs only above a pinned footer button.
8. **Limits per screen:** one primary button, two accent colors, three text sizes besides the title, and up to two tags on a person card.

---

## 5. Components: rules of use

**PersonCard**
- Order inside: name with route on the right, role, then children. Children are one `Evidence` (or a one-line summary), up to two `Tag`s, and one action.
- `tab` is the surname's first letter.
- `tabTone`: "highlight" for the currently selected letter or card; "nearby" only via `NearbyMatchCard`.
- `front` adds the Rolodex peek when more cards follow. `elevated` adds a lift for newly risen cards.

**PersonRow.** Name, a reason or role, and a `RouteLine`. Pass `stale` when the reason relies on old info. Pass `overline` for a slot label (for example, the role a person fills).

**Evidence / MarkedText**
- Mark 1 to 3 short phrases, never a whole sentence.
- `source` is always present ("Your note, Oct 12", "LinkedIn export, Mar 2024", "Their Bridge profile").
- Imported text renders as plain text only.

**RouteLine**
- `direct`: a confirmed personal relationship.
- `intro`: a possible introduction through a confirmed contact. The label names the contact ("Via Jordan").
- `suggested`: everything else (followers, same school or company, unconfirmed). Labels like "Unconfirmed" or "Follows you".

**Tag**
- `stated` for confirmed info. `suggested` for extracted, unconfirmed info; tapping should offer Confirm or Remove. `selected` for pickers and filters.
- Normalize synonyms before display ("CV" becomes "Computer vision").

**Button**
- Labels are verb-first: "Request intro", "Save note", "Import 309 cards".
- The same action keeps the same name through a flow, and its confirmation uses the past tense ("Intro requested").
- `danger` actions always confirm in a sheet.

**AskField / SearchField**
- Placeholders are real examples, not instructions.
- Ask for the microphone only when Dictate is tapped.

**NearbyMatchCard**
- Shows only the other person's chosen public fields.
- `summary` is one plain sentence naming the shared topics, and `sharedTopics` are marked inside it.
- Distance is always `distanceBand()`. Never a map, pin, exact distance, direction, or trail.
- Mute, Block, and Report go in `onMore`. Blocking confirms in a sheet.
- Pass `simulated` for demo-simulator matches.

**Toggle.** `tone="nearby"` only for the Nearby on/off switch.

**EmptyRow.** Use for an unmet need or empty list: what's missing plus one way forward ("No one yet for testing with cyclists" with "Plan the full team").

---

## 6. Patterns

**Screen anatomy.** Within `Screen`:
- a `ScreenHeader`: back, Edit, or Skip on the top row, a Literata title, and at most one short subtitle line;
- then 1 to 4 `Section`s;
- then an optional pinned primary button.

Tab screens put their single main action in the content, not a footer.

**Lists of people.** Optionally one `PersonCard` (the best or selected one), then a `Section` with a `Group` of `PersonRow`s, then an `EmptyRow` for anything unmet.

**Browsing everyone (Rolodex).** Cards stack with their letter tab, name, and role visible. Tabs stagger right as you go down, like a real card file. The selected card expands in place with `tabTone="highlight"`. Add an A–Z scrubber on the right edge: full alphabet in Literata 10px `inkFaint`, current letter marked with `highlight`, and a selection haptic per letter. Search sits under the title.

**Relationship graph.** Nodes are small index-card tabs with initials. Edges use the `RouteLine` styles: solid `action` for confirmed, solid `ink` with a hollow midpoint for intro paths, dashed `inkSoft` for unconfirmed. Highlight a supported path in `action`. Always offer the list view as an alternative.

**Review before saving.** Anything Bridge extracted or imported is shown for confirmation first: the source text with marks, then a "Bridge found" style group of proposed changes, each removable. Ambiguous identities get an inline choice ("Which Jordan?") and are never merged silently. Use one primary save button.

**Import and connectors.**
- Name the support level honestly in the subtitle (export file, live connection, or demo).
- Show what the source includes and lacks in one line.
- Show a summary group (ready vs needs review), a short preview list with "See all", and "Private to you" by the import button.

**Multi-step flows.** One question per screen, a `ProgressBar` at the top, Back and Skip in the header row, and the primary button pinned in the footer. Group pickable chips by category with section labels.

**Status.** One status line under the title ("On for 42 more minutes, within 100 m") with a Settings link. Detailed settings live on a sheet.

**Empty states** invite action: name the space, say one sentence on what to do, and offer one button. Never "Nothing here."

**Loading** uses rows shaped like the content that's coming (`tab`-colored blocks), not spinners in the middle of the screen.

**Errors** say what happened and what to do, in one sentence, in the product's voice ("Couldn't read that file. Export it again as CSV."). No "Error:" prefix, no raw exceptions.

**Permissions**
- Ask only when the user turns on the feature that needs it, with one sentence on why, right before the system prompt.
- If permission is denied, show the status line with the reason and a Settings button. Never fake success.

**Privacy language.** Always coarse and calm: "Only rough distance is shared, never your location." Private notes are "private to you."

---

## 7. Voice

- Plain, specific, warm. Sentence case. Contractions are fine.
- Use the user's own words when explaining a match ("From your note on Oct 12").
- Name uncertainty instead of hiding it ("Info from 2024, worth checking").
- Skip "successfully", "please", "simply", exclamation marks, and "Click here".
- Buttons say exactly what happens. Empty and error states point to the next step.

---

## 8. Review checklist

Before shipping a screen, check:
- [ ] All colors, sizes, spacing, and radii come from `theme.ts`.
- [ ] One primary button. At most two accent colors.
- [ ] Lime appears only on evidence; rose only on Nearby.
- [ ] The person in focus is a `PersonCard` with a tab; others are `PersonRow`s.
- [ ] Every claim about a person shows a source and date.
- [ ] Content is grouped in labelled sections, uses one row pattern, and has no nested boxes.
- [ ] Every line helps the user decide or act; nothing decorative.
- [ ] Literata for human-written content, Inter Tight for UI.
- [ ] Works in dark mode, with Dynamic Type, and with a screen reader. Touch targets are at least 44.
- [ ] Location is coarse, intros are "possible", followers aren't warm intros, and simulated matches are labelled.
