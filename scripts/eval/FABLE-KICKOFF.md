# Fable E2E kickoff (copy into new chat)

Paste the block below as the first message in a fresh agent chat with Fable (or any frontier model).

---

```
You are running the DiffuseCut representative E2E eval in G:\CTM\DarkLabResearch\DiffuseCut.

Read doc/E2E-AGENT-PLAYBOOK.md completely before acting.

Hard rules:
1. Create a NEW isolated project only (name like "E2E Eval ..."). Never modify Lisa, Demon's Ascent, or other existing projects.
2. Do NOT test diptych/triptych panel split or "Use this design (front + back)". That workflow is in progress and is NOT a pass requirement. Use full-image select-sheet only: POST select-sheet with { "optionId": "..." }.
3. Run npm run doctor first, then npm run eval:journey -- --runner fable --model "Fable"
4. If a harness step fails, document it in the report and continue manually (API + browser MCP) until you have an export MP4.
5. Fill the quality rubric in the eval report after watching the export.

Environment (should already be up):
- App: http://localhost:3004 (npm run dev includes worker)
- ComfyUI: configured in Settings (LAN GPU host)
- Reports: ~/Documents/DiffuseCut/eval-runs/{runId}/

Pass = isolated project + character sheet + location ref + storyboard still + LTX render + export MP4 + rubric filled.
```

---

## Preflight snapshot (maintainer)

Last verified before Fable run:

- `npm run doctor`: all checks green including ComfyUI, LTX, SDXL, FFmpeg
- `npm run eval:journey -- --dry-run`: bootstrap OK
- Dev server: port 3004

If doctor fails on ComfyUI, start the workhorse ComfyUI before the full eval (not needed for dry-run).
