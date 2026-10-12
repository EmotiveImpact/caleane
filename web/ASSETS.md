# Calenne imagery

The sign-in panel rotates four concept photographs: the existing event image (`candlelit-table.webp`) plus generated interiors, hospitality and wellness images. The front page uses a separately generated worktable hero, plus event, interiors and campaign concept images. The shared industry files have independent copies in `app/public/assets/` and `web/assets/` so each surface runs on its own. These images illustrate creative disciplines; they are not a portfolio of completed client work. Hospitality and wellness are atmospheric sign-in imagery, not a claim that Calenne supports booking or clinical workflows.

## Generation prompts

### Front-page hero — `studio-worktable.webp`

A single photorealistic editorial architectural photograph to serve as the full-width hero background of a premium creative-studio software website. Landscape 16:9 or wider, composed for 1440px desktop website cover crop and a separate narrow mobile crop. A real creative studio worktable in warm directional late afternoon light: material swatches, a few neutral paper floor plans and project sketches with no legible text, linen, one sculptural stone sample, a ceramic vessel with delicate branches, restrained flowers, a pencil, layered off-white papers. Sophisticated London interiors / event design mood, believable lived-in texture, quiet high-end editorial photography. Make the LEFT 45 percent dark, calm and visually uncluttered so large white headline text placed by the webpage will be clearly legible. Place the table, materials and beautiful visual detail mainly to the RIGHT, with subtle architectural wall and pinboard behind it. Rich warm charcoal, olive, walnut and stone colors. No people, no computer, no screens, no logos, no readable words, no watermark, no text overlaid on the image.


### Interiors — `interiors-studio.webp`

Create a photorealistic editorial photograph for the left panel of a premium creative-business software sign-in page. Industry: interior design. A completed high-end residential living room in London, tactile limestone, warm walnut joinery, softly sculptural off-white seating, a single branch arrangement, layered linen and subtle art. Late afternoon into dusk, rich chiaroscuro, believable lived-in detail, restrained neutral palette, cinematic but natural. Vertical 4:5 composition with calm darker space at the upper-left for a small white brand wordmark and at the lower-left for large white editorial headline. Subject remains legible as an interiors project even with a dark gradient overlay. No people, no computers, no screens, no logos, no text, no watermark.

### Hospitality — `hospitality-studio.webp`

Create a photorealistic editorial photograph for the left panel of a premium creative-business software sign-in page. Industry: boutique hospitality. A beautifully composed intimate boutique hotel lobby and dining lounge in London at early evening, warm amber wall lamps, dark walnut, olive velvet seating, honed stone bar, crisp linen tables, one understated floral arrangement, subtle architectural depth. Rich natural shadows, sophisticated muted neutral palette, cinematic but believable. Vertical 4:5 composition with darker calm space upper-left for a small white brand wordmark and lower-left for a large white editorial headline. It must clearly communicate hospitality even under a dark gradient overlay. No people, no computers, no screens, no logos, no text, no watermark.

### Wellness — `wellness-studio.webp`

Create a photorealistic editorial photograph for the left panel of a premium creative-business software sign-in page. Industry: wellness and spa. A refined contemporary wellness retreat treatment room opening onto a small private courtyard, sculpted plaster walls, travertine, warm timber, soft linen treatment bed, filtered daylight, one stone basin, single leafy branch. Restrained, tactile, grounded and calming; high-end architectural photography with natural shadows and no overly clinical or generic stock-photo feel. Vertical 4:5 composition with calm darker space upper-left for a small white brand wordmark and lower-left for a large white editorial headline. It must clearly communicate a wellness studio even under a dark gradient overlay. No people, no computers, no screens, no logos, no text, no watermark.

The industry originals were generated as PNG and converted with `cwebp -q 82`; the hero used `cwebp -q 84`. `campaign-set.webp` is existing NAY concept imagery reused with a conceptual-image label. The landing page uses the Calenne app's bundled Instrument Sans font under the included SIL Open Font License.

## Source PNGs and compression

Full-size PNG masters live in `frontpage-design/source-images/`, outside `web/`, so they are not deployed with the site. Pages only load the WebP and JPEG files in `web/assets/`. Those files were re-encoded on 2026-10-09 (WebP method 6, quality picked per image so it matches the previous file to SSIM 0.99, or the PNG master where one exists). `campaign-set.webp`, `interiors-studio.webp` and `candlelit-table.webp` were scaled down to the largest size any page draws them at, including 3x phone screens. When adding a new image, export WebP from the master and keep the master here, not in `web/assets/`.

## Platform page phone captures

`platform-app-*-phone.webp` are 390 × 760 captures (2x) of the local app demo (`npm run dev` in `app/`, Studio view and Client view), shown in place of the desktop screens on phones via `<picture>` in `platform.html`. Masters are in `frontpage-design/source-images/`; WebP quality 82, method 6.
