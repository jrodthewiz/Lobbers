# Lobbers Audio Assets

These compressed sounds are derived from Kenney audio packs licensed under Creative Commons CC0.

Sources:

- Kenney Impact Sounds: https://kenney.nl/assets/impact-sounds
- Kenney Interface Sounds: https://kenney.nl/assets/interface-sounds
- Kenney RPG Audio: https://kenney.nl/assets/rpg-audio
- Kenney UI Audio: https://kenney.nl/assets/ui-audio
- Kenney Casino Audio: https://kenney.nl/assets/casino-audio
- Kenney Digital Audio: https://kenney.nl/assets/digital-audio
- Kenney Music Jingles: https://kenney.nl/assets/music-jingles
- Kenney Sci-fi Sounds: https://kenney.nl/assets/sci-fi-sounds

The shipped files are curated variants for Lobbers events:

- `ui-*`: hover, focus, click, host lobby, practice bot, browse, join, ready, rematch, confirm, back, error, and selection cues.
- `ammo-*`: ammo-specific selection and handling cues.
- `charge-*` and `throw-*`: charge start and throw release variants.
- `javelin-*`, `shotput-*`, `splitter-*`, and `fragment-*`: projectile impact and split variants.
- `player-*`: hit, jump, and step cues.
- `round-*`: countdown, start, win, and loss stingers.
- `item-*`: placeholder pickup sounds for future item work.

Selected source files were converted with FFmpeg to mono Opus-in-Ogg assets. Short second-pass effects use `14k`; earlier cues use `18k`:

```powershell
ffmpeg -y -hide_banner -loglevel error -i INPUT.ogg -vn -map_metadata -1 -ac 1 -ar 24000 -c:a libopus -b:a 14k -vbr on -compression_level 10 -application audio OUTPUT.ogg
```
