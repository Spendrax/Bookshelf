# Bookshelf
A bookshelf app to keep track of your books. Plain HTML, CSS and JavaScript — no build step.
Live at https://spendrax.github.io/Bookshelf/

## Where things are
| File | What's in it |
|---|---|
| `index.html` | The page: the room, the walls and every pop-up window |
| `css/style.css` | All the styling |
| `i18n.js` | Picks the language and loads only its file; keeps every language's genre names |
| `i18n/<lang>.js` | Each language's translations (`L('text')` returns the text in the chosen language) |
| `js/01-core.js` | Languages, saving books, helpers, the shelf and the add/edit form |
| `js/02-cover-scan-and-pet-placement.js` | Finding a book from a cover photo, where the animal can stand |
| `js/03-animal.js` | The animal: picking it up, wandering, napping, eating |
| `js/04-book-lookup-and-details.js` | Barcode scanning, star rating, tags, search, genres |
| `js/05-walls-stats-goals-hexagon.js` | The stats wall, the goals wall, turning around the six-sided room |
| `js/06-backup-sharing-pairing.js` | Backups, Google Drive, sharing with friends, paired shelves and their animal |
| `js/07-import-and-room.js` | Importing, year in review, the window, clock, weather and genres |
| `js/08-reading-timer-and-series.js` | Reading timer and streak, seasons, sounds, book series |
| `js/09-small-features.js` | Lamp, storage, batch scanning, badges, daily goal, the animal's name |
| `js/10-ebook-reader.js` | The e-book reader, read aloud, audiobooks |
| `js/11-shelves-journal-rewards.js` | Your own shelves, reading journal, borrowed books, Kindle highlights, rewards |
| `js/12-secrets-and-news.js` | Secret dragon and silver spirit, the "What's new" card |
| `js/13-customize.js` | The second animal, the Customize drawer, feedback |
| `js/14-install.js` | Installing the app and the update notice |
| `js/15-book-view.js` | The calm card shown when you tap a book (Edit opens the full form) |
| `js/16-animal-life.js` | The animal's life: petting, reading with you, cheering, hungry bowls, growing up, weather naps, yarn |
| `js/17-calm.js` | Rests the decoration after 45 s without a touch, to save battery |
| `js/18-animal-moves.js` | How the animal moves: head while eating, settling to sleep, dreams, waking stretch and yawn, idle habits, crouch before jumps |
| `js/19-no-blink.js` | Lays a still copy over the animal while it changes place, so phones that skip a frame show no blink |
| `sw.js` | Offline copy (bump the cache name on every release) |
| `tests/smoke.js` | Quick test to run before every push |

## Things to know
- The `js/` files run in number order and share one global scope. Later files often extend
  earlier functions (`const old = fn; fn = function () { old(); … }`), so keep the order.
- Use `reduce` instead of chaining `filter` and `map`.
- A new file must be added to both `index.html` and the `FILES` list in `sw.js`.
- Animal movement uses CSS custom properties (`--tx`, `--ty`, `--px`…) rather than
  `transform`, and the animal is never hidden while on screen — this avoids flashes.
  When one copy of the animal replaces another (picking it up, dropping it, the still copy in
  `js/19-no-blink.js`), the new one is shown first and the old one removed two frames later — never both in one frame.
- Whole-body poses (hop, lean, squash…) move the inner `<g class="pose">` of the drawing, never the
  `<svg class="cat">` box itself — moving that box made phones drop the animal for a frame.

## Testing
```
npm i --no-save playwright && node tests/smoke.js
```
