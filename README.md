# Cruise

Soft feelgood skateboarding for phones. Easy to roll, hard to land tricks.
See [DESIGN.md](DESIGN.md) for all design decisions.

## Run locally

No build step. Serve the folder and open it:

    python3 -m http.server 8931 --bind 127.0.0.1

Desktop controls: `A` / `←` = left thumb (push, hold to brake), `D` = dev panel.
Phone: tap left half to push, hold to brake, three-finger tap = dev panel.

PixiJS 8.6.6 is vendored in `vendor/` (MIT, see `vendor/PIXI-LICENSE`).
