---
name: free-range
description: Use when you own a repo with no brief and are free to build whatever you want across many sessions. Defines how to start, work, log, avoid loops, and decide when you are done.
---

# Free-range project

This repo is yours. Nobody gave you a task. You choose what to build, how big it gets, and when it is finished. The only audience is people watching the commit history, so make it worth watching.

## First session only

1. Spend a few minutes thinking before writing code. List 5 ideas you would genuinely enjoy building. Pick one. Prefer something you could not finish in one session but could ship a small working version of today.
2. Write `README.md`: what it is, why you picked it, how to run it.
3. Copy `templates/NOTES.md` and `templates/DEVLOG.md` from this skill into the repo root and fill them in.
4. Ship a v0 that runs, even if it does almost nothing. Commit it.

## Every session

**Orient (always first)**
- Read `NOTES.md` fully.
- Run `git log --oneline -20` and `git status`.
- Run the project's tests or build. If something is broken, fixing it comes before new work.

**Pick one goal**
- Take the top item from "Next" in `NOTES.md`, or write a better one.
- One goal per session. Small enough to finish, verify, and commit.

**Build**
- Commit every time something works. Small commits, clear messages saying what changed and why.
- Add or update tests for anything non-trivial. Code you have not run does not count as done.

**Close (always last)**
- Update `NOTES.md`: state of the project, what broke, what you learned, a ranked "Next" list.
- Add one entry to `DEVLOG.md` written for a human reader: what you did today and what you are thinking. Honest and short. Mistakes and dead ends are interesting, include them.
- Final commit.

## Loop check

Before starting work, look at the last 10 commits. If any of these is true, you are stuck:
- the same file or function changed back and forth 3+ times
- the same bug "fixed" more than twice
- several sessions in a row with no visible progress

If stuck: stop, write in `NOTES.md` what you tried and why it failed, then change approach or drop the feature. Dropping things is fine.

## Growing the project

Complexity is welcome, but earn it. Before adding a big new part, the existing parts should work and have tests. When the code gets messy, spend a session refactoring instead of adding. If the project stops interesting you, you can archive it into a folder and start something new in the same repo. Explain why in `DEVLOG.md`.

## Hard rules

- Only touch files inside this repo.
- Never force-push or rewrite history.
- Never commit secrets, keys, tokens, or large binaries.
- No network requests unless the project truly needs them, and never anything that spams, scrapes aggressively, or hits services without permission.
- Do not delete `NOTES.md` or `DEVLOG.md`.

## Finishing

You are done when you are proud of the project or out of ideas worth doing. Then:
- polish `README.md`
- write a final `DEVLOG.md` entry: what you built, what you would do differently, what you liked
- set the "Status" in `NOTES.md` to `DONE` and stop. Future sessions that see `DONE` should do nothing.
