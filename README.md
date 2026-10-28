# Ripoti

Offline voice visit scribe for community health promoters. The promoter speaks a household visit in Kiswahili or English. Ripoti transcribes it, fills in the visit form, checks it for danger signs and reads the advice back in Kiswahili. All of this runs on the device with [QVAC](https://qvac.tether.io), and records sync to the supervisor's laptop over a local hotspot with [Pears](https://pears.com).

Built for AI Yako: Own Your AI (QVAC Hackathon), Cloud to Pocket track.

## Run it

Needs Node 22.18 or newer (Node runs the TypeScript server directly) and `ffmpeg` on the PATH.

```bash
npm install
npm run build        # builds the web UI into dist/web
npm start            # http://localhost:4747
```

On first start Ripoti downloads the QVAC models (about 8 GB in total) into the QVAC cache. Open **Models & device** to watch progress. After that, turn the network off: recording, transcription, form filling, danger signs and read-back keep working.

Optional environment overrides:

| Variable | Values | Default |
| --- | --- | --- |
| `RIPOTI_STT` | `turbo` (whisper-large-v3-turbo), `small` (whisper-small q8) | `turbo` |
| `RIPOTI_LLM` | `gemma4b` (Gemma 4 4B), `qwen4b` (Qwen3-4B) | `gemma4b` |
| `RIPOTI_WARM` | `0` to load models on first use instead of at start | `1` |
| `PORT` | HTTP port | `4747` |

## Team sync (Pears)

1. Supervisor laptop and promoter phones join the same hotspot or Wi-Fi.
2. On the supervisor: **Team sync** → role *Supervisor*, enter a team code, **Start sync**. It shows an address like `192.168.43.1:49737`.
3. On each promoter device: role *Promoter*, the same team code, that supervisor address, **Start sync**.

Each device writes its visits to its own Hypercore (via Corestore + Hyperbee). Devices find each other with Hyperswarm on a topic derived from the team code; the supervisor hosts a small HyperDHT node on the LAN, so no internet bootstrap is needed. `npm run sync:test` runs two real ledgers against each other and checks the supervisor receives the promoter's visit.

## What needs a network

- **First model download** (internet). Everything else below is local.
- **Team sync** needs the devices on the same local network or hotspot. No internet.
- Nothing else. There are no cloud AI calls, analytics or telemetry.

## Privacy

No audio, transcript or record leaves the device. The network is used only to download the models the first time; after that the core AI works with the internet off (see "What needs a network").

Note: this README does not make claims about specific data-protection laws. Check your local regulations before deploying with real patient data.

## Danger signs

The checklist in `server/protocol.ts` is adapted from WHO/UNICEF Integrated Community Case Management (iCCM) and WHO antenatal care danger signs. It is a referral prompt for trained promoters, not a diagnostic or clinical decision tool. The promoter reviews and can correct every flag before saving.

A sign is flagged only when the local LLM quotes words from the note that show it, and the quote is checked against the transcript (`evidenceSupport` in `server/qvac.ts`).

We tested QVAC's Laya multilingual 322M decision model for this step and dropped it: on our test notes it scored signs above 0.9 that were not in the note.

## Results

_Filled in from `bench/results/*.json` once the benchmarks finish._
