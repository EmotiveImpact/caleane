# Caleane navigation proposal

**29 September 2026 · Design proposal, not implemented**

## Current structure and problem

The studio rail currently lists **Home, Clients, Pipeline, Work, Tasks, Mail, Calendar, Library**, with **Settings** at the bottom. The client rail shows **Home, Work, Mail**. A client record exposes ten tabs; a project has seven. The navigation has the right material, but several labels obscure the actual job:

- **Mail** contains in-app correspondence. External email sending/sync is not implemented. The label creates the wrong expectation.
- **Work** means projects, while **Tasks** also sounds like work. A new user must guess which contains a client decision.
- **Home** does not say that the screen is intended to surface follow-ups, due actions and decisions.
- Ten peer-level client tabs make the relationship record feel like separate products. Designs and estimates primarily belong to projects, while a client's overview should connect them.
- The left rail and the public website mock should use the same vocabulary. The rebuilt website's illustrative product panel uses the proposed labels; the live app rail still uses **Work/Mail** until a later navigation implementation.

## Recommended studio rail

Keep a labelled rail. Put the five daily destinations together; place reference tools below a divider. Do not hide key routes behind an unlabeled “More” icon.

| Position | Label | Meaning and landing view | Current backing | Rule |
| --- | --- | --- | --- | --- |
| 1 | **Today** | Due follow-ups, waiting client decisions, unread conversations and the owner's next actions. | `overview` plus relevant task summaries | Rename Home. Show only items that need action; provide a path to all tasks. |
| 2 | **Inbox** | In-app client conversations with unread and Open/Waiting/Resolved states. | `inbox` | Rename Mail now. Use “Email” only when a real connected channel exists and its delivery state is visible. |
| 3 | **Clients** | Relationship directory, contacts, organisations and account history. | `clients` | Keep the client as the durable record; do not make every enquiry a booked client. |
| 4 | **Pipeline** | Sales opportunities in Board/List/Insights. | `pipeline` | Keep the current familiar label until first-class leads exist. Make clear that stages are manually managed. |
| 5 | **Projects** | Shared delivery work and project status. | `projects` | Rename Work. A project is not itself an opportunity, booking or payment. |
| utility | **Calendar** | Project dates and task deadlines. | `calendar` | Display a brief date as a date, never as confirmed availability. |
| utility | **Library** | Studio-wide files and references. | `library` | Distinguish the studio library from files attached to a project. |
| footer | **Studio & connections** | Studio brand, intake connection, allowed origins and account settings. | `settings` | Keep account switch and sign-out separately under the profile control. |

**Tasks:** surface a clear “All tasks” view or filter from Today and contextually inside the relevant client/project. Keep `tasks` as an addressable route for deep links, but remove its equal-weight rail item during the first simplification. If owner research shows that task lists are the primary daily destination, restore it explicitly; do not add a duplicate “To-do” nav item without evidence.

When a first-class lead object exists, add **Enquiries** before Pipeline or provide an Enquiries segment inside Pipeline. Until then, do not relabel the current project-created public intake as a full lead inbox.

### Hierarchy sketch

```text
Caleane / [studio name]
  Today
  Inbox
  Clients
  Pipeline
  Projects
  ─────────────
  Calendar
  Library
  ─────────────
  Studio & connections
  [profile / switch studio / sign out]
```

The rail should display the active destination's text, not icon alone. Icons can help scanning inside the app, but each needs a visible label and consistent size. Badges should count only actionable items, with accessible text for screen readers. On mobile, use the same destinations and order in a drawer; keep the menu button's expanded state and close on navigation/Escape.

## Within a client relationship

The current record tabs are Overview, People, Opportunities, Activity, Correspondence, Projects, Designs, Estimates, Files and Notes. Retain all underlying records, but present fewer peer-level choices:

| Proposed area | Contains | Visibility |
| --- | --- | --- |
| **Overview** | Account summary, next follow-up, current opportunities, active projects, latest message and recent activity. | Studio only. |
| **People** | Organisation, contacts, roles and invitations. | Studio only; explicit project access remains authoritative. |
| **Projects** | Projects for this relationship, with a clear link to each project workspace. | Studio only in this record; permitted projects appear in client portal. |
| **Messages** | General and project conversations, with project context visible. | Studio and invited participants according to existing access checks. |
| **History** | Activity, owner notes, opportunity updates and decisions in a filterable timeline. | Internal events and notes remain owner/staff-only; shared events only for eligible clients. |
| **Documents** | Cross-project view of estimates and files, each linked back to its project and version. | Studio; client sees only permitted project documents. |

Opportunities should be accessible from the client Overview and global Pipeline; they need not occupy a permanent client tab. Design versions and estimates should stay anchored to their project, with client-level summaries linking to that source. Do not merge private notes into a shared timeline without server-enforced visibility.

## Within a project

The current project tabs are Brief, Plan, Inspiration, Designs, Estimate, Conversation and Activity. A simpler task-based set is:

1. **Overview** — project state, next requested decision and who can act.
2. **Brief** — working revision, past revisions and change requests.
3. **Design** — inspiration, immutable versions, pinned feedback and approvals.
4. **Plan** — shared tasks and planning estimates, clearly labelled as planning.
5. **Messages** — project correspondence.
6. **History** — decisions and activity, available from a secondary tab or overflow link.

This grouping is a design proposal. Before implementing it, test whether interior and brand studios expect inspiration inside Design and whether estimates belong under Plan. Preserve deep links to existing tabs and never change server authority because a tab moved.

## Client portal menu

Use **Overview, Projects, Messages** and **Account**. The portal should open on an actionable overview: which project has a requested decision, what changed since the last visit, and what has already been approved. A participant with access to one project should not see the full client account by default. “Messages” is accurate for in-app correspondence; do not call it Mail. Profile/account settings should not be a top-level peer of the work on narrow screens.

## Public website menu

Keep the current three-link pattern, with shorter labels if user testing supports it: **Product, For studios, How it works**. The primary action can be **Explore preview** while the product is local; **Sign in** is appropriate for a live service later. Do not show Pricing before pricing exists, or Request access without a working request flow. Every link needs a real destination. Remove decorative outbound/arrow icons from ordinary text links and navigation links; let typography, underline and hover/focus states indicate interaction. The website's product illustration should reflect actual app labels and should be identified as an illustration if it is not a screenshot.

## Migration and acceptance checks

- Map old keys to new labels without breaking the current views: `overview` → Today, `inbox` → Inbox, `projects` → Projects, `settings` → Studio & connections. Keep route keys or redirects until any saved links are checked.
- Check the sidebar, page heading, browser title, breadcrumbs, website illustration and empty states for a single vocabulary. Client copy must say Messages, not Mail.
- A new studio owner can locate an unanswered client message, a due task, a client record, an opportunity and an active project without guessing between two synonymous labels.
- An invited client can locate their project and pending decision without seeing owner-only notes, tasks or opportunities. Test Viewer, Collaborator and Approver separately.
- Keyboard navigation, active state, focus visibility and mobile drawer operation remain usable. Labels must remain visible or have accessible names at all responsive sizes.
