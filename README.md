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
| `RIPOTI_LLM` | `gemma4b` (Gemma 4 4B), `gemma2b` (Gemma 4 2B), `qwen4b` (Qwen3-4B) | `gemma4b` |
| `RIPOTI_LIVE_STT` | Live-caption model: `small`, `turbo` | `small` |
| `RIPOTI_MEMORY` | `lean` (one model in memory at a time) or `full` (keep models loaded) | `lean` under 24 GB RAM, else `full` |
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

Test machine: Ubuntu 22.04 VM, 8 vCPU (x86-64, no GPU), 31 GB RAM, Node 24, `@qvac/sdk` 0.22.0. The VM had 20–35% CPU steal from the host during these runs, so treat times as an upper bound for this CPU class.

### Kiswahili speech to text (real human speech)

Google FLEURS `sw_ke` test split, first 30 distinct utterances (7.7 min of read speech by Kenyan speakers). Run with `bench/get-fleurs.sh` then `npm run bench:stt -- 30`. Full per-utterance output: `bench/results/stt-turbo.json`.

| Model | WER | CER | Load | Inference / audio length |
| --- | --- | --- | --- | --- |
| whisper-large-v3-turbo | 38.7% | 11.5% | 42.8 s | 1.08× (503 s for 464 s of audio) |

Looking at the transcripts, most errors are near-miss spellings and joined words (`wakarne` for `wa karne`, `kunachui` for `kuna chui`), plus numbers written out as words (`elfu moja miya tisa sitini na sita` for `1966`). In one clip of 30 Whisper repeated a sentence, which pushed that clip's WER above 100%. The promoter reviews the form before saving because of these errors.

### Visit form and danger signs

`npm run bench:extract -- text` runs the 16 Kiswahili visit notes in `bench/cases.json` through extraction and the danger-sign check (Gemma 4 4B). Per-case output: `bench/results/extract-text.json`.

| Measure | Result |
| --- | --- |
| Household number, pregnancy, months pregnant, vaccines | 16/16 correct each |
| Danger signs | 13 true positives, 0 false positives, 0 missed |
| Refer / don't refer decision | 16/16 correct |
| Mean time per visit | 32 s form + 12 s danger check (Gemma load 31 s, once) |
| QVAC worker memory | 7.3 GB peak RSS with Gemma 4 4B loaded |
| Gemma 4 2B on the same notes | danger signs 11/13 found, 1 false alarm; vaccines 81%; refer decision 15/16; 27 s form + 8 s danger check. Kept as an option, not the default |

Read these numbers with care:
- We wrote the notes ourselves (neutral household numbers, no real patients). They are clean text, not speech, so this measures the LLM step alone. Real recordings add the speech errors measured above.
- The first run on cases v01–v12 had 3 false positives, all "fever for 7 days or more" flagged for a fever that started yesterday or the day before. We then added a rule: a sign defined by a duration needs that duration stated in the note (`server/duration.ts`). The 0 false positives come after that fix, measured on the same 12 cases plus 4 new ones (v13–v16). That is not a held-out test.
- Two more guards came after the speech test showed the model inventing numbers: ages and months pregnant are dropped unless that number is in the note (`server/ground.ts`), and for fever and cough a stated long duration flags the sign directly (`durationEvidence` in `server/duration.ts`), so a missed LLM answer cannot hide it. The table is the re-run on the same 16 notes with both guards.
- 16 cases is a small sample. Treat this as a smoke test, not a clinical validation.

### Offline check

The core AI was run with the network fully removed: `sudo unshare -n` gives the process a network namespace with no interfaces at all, not even loopback. Under that, with models already cached, Ripoti transcribed a FLEURS clip (Whisper), filled in the form and flagged `cannot_feed` for case v01 (Gemma 4), and spoke "Kaya namba 0142." (Chatterbox, 2.6 s of audio). No step tried to reach the network.

### Kiswahili read-back (Chatterbox, CPU)

| Text | Synthesis time | Audio length |
| --- | --- | --- |
| "Kaya 0142. Dalili za hatari: hawezi kunywa wala kunyonya. Mpe rufaa kwenda kituo cha afya leo." (before digits were spoken as words) | 213 s | 5.6 s |
| "Kaya namba 0142." | 59 s | 2.4 s |
| "Mama ni mjamzito wa miezi saba." | 43 s | 2.0 s |

Model load: 12.5 s. On this CPU, read-back runs 20–40× slower than real time, so it is generated only when the promoter taps **Play read-back**, never as part of saving a visit. One earlier run of the first sentence took 15 s; we could not reproduce that and report the slower figure.


## Live transcription and 16 GB laptops

**Live captions.** Tap record and speak. The browser streams 16 kHz audio to the local server, which feeds QVAC `transcribeStream` with Silero VAD (`VAD_SILERO_5_1_2`) and Whisper small. Each phrase appears when the speaker pauses (first phrase about 8 s after starting in the browser test, including model load). Whisper large-v3-turbo ran about 2x slower than speech on this CPU, so it is not used for captions. When you stop, the full recording is transcribed again with large-v3-turbo and that transcript fills the form.

**Memory.** Below 24 GB RAM, Ripoti runs in lean mode: it loads only the model for the current step (speech, form, or read-back) and unloads it before the next. On start it only downloads/caches models; it does not keep them loaded. Measured: one live visit (stream, re-transcribe, form, danger check) ran under a hard 12 GB cgroup limit with no swap (`systemd-run -p MemoryMax=12G -p MemorySwapMax=0`, page cache dropped first) and finished; peak resident memory of the Ripoti processes was 7.8 GB, mostly Gemma 4 4B. That leaves about 4 GB of a 16 GB laptop for the OS and browser. Not tested on a physical 16 GB laptop.

**Fit check.** **Models & device** shows memory mode, RAM, QVAC worker memory, CPU/GPU, and QVAC `assessModelFit` (via `getSystemResources`). The verdict is advisory; on the test VM (no GPU) QVAC returns `unknown`, shown as "QVAC can't say yet", which does not confirm or rule out a fit.

## QVAC integration

`@qvac/sdk` 0.22.0. All QVAC calls are in `server/qvac.ts`; `server/pipeline.ts` chains them for one visit.

| Job | QVAC model constant | Download size | Upstream licence |
| --- | --- | --- | --- |
| Speech to text (default) | `WHISPER_LARGE_V3_TURBO` | 1.6 GB | MIT (openai/whisper-large-v3-turbo) |
| Speech to text (light) | `WHISPER_SMALL_Q8_0` | 0.25 GB | Apache-2.0 (openai/whisper-small) |
| Form filling + danger-sign evidence (default) | `GEMMA4_4B_MULTIMODAL_Q4_K_M` | 5.4 GB | Apache-2.0 (google/gemma-4-E4B-it) |
| Form filling (alternative) | `QWEN3_4B_INST_Q4_K_M` | 2.5 GB | Apache-2.0 (Qwen/Qwen3-4B) |
| Kiswahili read-back | `TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0` + `TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0` | 0.35 + 0.79 GB | MIT (ResembleAI/chatterbox) |

Licences were read from each model's Hugging Face card. QVAC downloads the models from its registry on first use and caches them; later runs load from the cache with no network.

How each call is used:
- `loadModel` + `transcribe` — Whisper, with the language (`sw`/`en`) set at load time. Audio is first converted to 16 kHz mono WAV with ffmpeg (`server/audio.ts`).
- `completion` with a JSON schema — turns the transcript into the visit form, then lists danger signs with a quote from the note. Spoken Kiswahili numbers are turned into digits first (`server/swnum.ts`).
- `textToSpeech` — Chatterbox in `sw`, one sentence at a time.

## Built during the hackathon vs reused

Everything in this repo was written during the event. Reused: `@qvac/sdk` and its models, Pears modules (`corestore`, `hyperbee`, `hyperswarm`, `hyperdht`, `protomux`), Hono, React, Vite, Lucide icons, the Inter font, ffmpeg, and Google FLEURS (CC BY 4.0) for the speech benchmark.

## Licence

Apache-2.0. See `LICENSE`.
