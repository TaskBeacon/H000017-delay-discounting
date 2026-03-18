# H000017 Delay Discounting

HTML/browser preview of the MCQ-27 style Delay Discounting task built with `psyflow-web`.
Trial planning (deterministic item reconstruction), key mapping (`F/J`), and stage flow are aligned to local `T000017-delay-discounting`; trial count is shortened for preview.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: MCQ planning and summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000017-delay-discounting
```
