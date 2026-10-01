# Calenne homepage design bible

## Direction

The opening portrait sets the rule for the entire page: one clear idea per section, human subjects at a useful scale, photographs with real depth, restrained type placed in deliberate negative space, and room to breathe. The page moves from the problem directly into a large, inspectable product example, then a short process index and photographic stories about actual creative work: a person, a brief, a version, and a decision.

Calenne is for owner-led visual studios. Event styling and planning, interiors and spatial work, and brand or campaign studios are the first audience stories. NAY DÉCOR is a sample studio in the product preview, not the visual identity of every studio.

## Typography

- **One family:** Instrument Sans, with Arial and system sans as fallbacks.
- **Weights:** 400 for display and reading text; 500 or 600 for small controls and labels.
- **No italic display type.** Emphasis comes from placement, scale and contrast.
- **Desktop display:** 64–86 px with tight letter spacing and a line height near 1.04. Phone display: 42–54 px.
- **Body:** 15–18 px, line height 1.5–1.65. Small labels: 9–11 px, spaced capitals.
- Keep line lengths short enough to read on a photograph. Avoid mixing serif, script, or additional display faces.

## Colour and surface

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#111816` | Primary text on light sections |
| Night | `#060908` | Problem and closing sections |
| Paper | `#f5f4f0` | Quiet solution and product sections |
| Mist | `#e6eae5` | Secondary light surface |
| Sage | `#6c8070` | Small labels and restrained accents |
| White | `#f9faf7` | Text over dark photography |

Photographs provide the colour. Avoid decorative gradients in light sections. Use a dark overlay only where text needs it.

## Layout and components

- Use one primary column and a consistent outer gutter: `clamp(20px, 3.2vw, 56px)`.
- Full-bleed photographic chapters use a wide image, a left-side readable zone, a small index label, one headline, and one short paragraph. Keep the subject and final work visible.
- On a desktop hero around 930 px tall, start the headline roughly one third of the way down the portrait. Keep the action and supporting line anchored near the bottom. Preserve the photograph between them.
- The black problem section contains one sentence. Give it space and align it with the hero headline.
- Put the product directly after the problem. Use a large framed interface, readable sample content, and a clear stage change between brief, design and decision. This is the first visual proof of the product claim.
- The three-stage overview is a short thin-rule editorial index. Each row links to its photographic chapter.
- The product preview is the one place for detailed interface illustration. Label sample content clearly and keep each tab in the same sample project.
- Studio examples use image-led tiles with short audience labels and outcomes. Do not imply the images are customer work.
- Buttons are plain rectangles; text links have no underline or icon. Use a visible focus outline for keyboard access.
- Avoid rounded feature cards, ornamental shadows, decorative arrows, and competing CTA styles.
- Keep a distinct section rhythm: portrait, black statement, product proof over a working-surface photograph, short paper index, pinned photographic chapters, paper studio examples, quiet access explanation, photographed invitation, structured footer.

## Photography

- Show **the profession and its result** in the same image where possible: a stylist at an event installation, a designer with a finished space, or a creative team with a campaign set.
- Represent women from a range of racial and ethnic backgrounds across the page. Keep their roles clear and their expressions natural, rather than staging diversity as the subject of the photograph.
- Use candid editorial framing, believable people, tactile materials and natural light. Leave negative space for text.
- Do not repeat the same photograph in multiple marketing sections. NAY imagery belongs only in the labelled sample product preview.
- The final invitation uses an editorial photograph of women enjoying the completed work, with dark space on the left for the copy. It is concept imagery, not a customer testimonial.
- No text, logos, watermarks or fake interface elements inside generated photographs.

## Footer

The footer has a clear product introduction and three navigation groups: Platform, For studios, and Working together. Every link leads to a real section of this local site or the local workspace. Keep the lower bar compact with copyright, preview status and a return-to-top action. Do not add pricing, legal, status, social or customer links until those destinations exist.

## Content and product truth

Write to the studio owner and their client. Name real current jobs: enquiry, relationship, shared brief, visual version, feedback and recorded decision. Keep each section to one claim and one consequence. Do not claim public availability, payments, bookings, contracts, email delivery, time savings, customer counts or proven industry demand. The local interface sample is illustrative.

## Responsive and motion

On phones, keep the headline and copy in the image's dark zone, then stack the editorial index and product UI. Never crop the person or finished work beyond recognition. Keep every action at least 44 px tall. The three photographs change while the section stays pinned during scrolling; show them as regular stacked sections for `prefers-reduced-motion`. Use actual video only when suitable footage exists.
