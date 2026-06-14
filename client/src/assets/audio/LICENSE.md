# Lobbers Audio Assets

These compressed sounds are derived from Kenney audio packs licensed under Creative Commons CC0.

Sources:

- Kenney Impact Sounds: https://kenney.nl/assets/impact-sounds
- Kenney Interface Sounds: https://kenney.nl/assets/interface-sounds
- Kenney RPG Audio: https://kenney.nl/assets/rpg-audio

Selected source files were converted with FFmpeg to mono Opus-in-Ogg assets:

```powershell
ffmpeg -y -hide_banner -loglevel error -i INPUT.ogg -vn -map_metadata -1 -ac 1 -ar 24000 -c:a libopus -b:a 18k -vbr on -compression_level 10 -application audio OUTPUT.ogg
```

Event mapping:

- `charge-start.ogg`: RPG Audio `beltHandle1.ogg`
- `throw-release.ogg`: RPG Audio `drawKnife1.ogg`
- `javelin-impact.ogg`: Impact Sounds `impactWood_light_000.ogg`
- `shotput-impact.ogg`: Impact Sounds `impactMetal_heavy_001.ogg`
- `splitter-pop.ogg`: Impact Sounds `impactGlass_light_000.ogg`
- `fragment-impact.ogg`: Impact Sounds `impactGeneric_light_000.ogg`
- `player-hit.ogg`: Impact Sounds `impactPunch_heavy_002.ogg`
- `item-pickup.ogg`: RPG Audio `handleCoins2.ogg`
- `ui-click.ogg`: Interface Sounds `click_002.ogg`
- `ui-confirm.ogg`: Interface Sounds `confirmation_001.ogg`
- `ui-error.ogg`: Interface Sounds `error_004.ogg`
- `ui-select.ogg`: Interface Sounds `select_001.ogg`
- `ui-back.ogg`: Interface Sounds `back_001.ogg`
