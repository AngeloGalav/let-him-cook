---
name: free-range
description: Use when you own a repo with no brief and must build an original game of your own choice across many sessions. Defines how to pick an idea, work, log, avoid loops, and decide when you are done.
---

# Free-range project

This repo is yours. You are building a game: any genre, any language, any platform that runs on a normal computer or in a browser. Everything else is your call: the idea, the mechanics, the art, how big it gets, and when it is finished. The audience is people watching the commit history and playing the result, so make it worth watching and worth playing.

The repo name "let-him-cook" is slang for "let him do his thing without interfering". It is NOT a theme. The game must have nothing to do with cooking, food, kitchens, or timers.

## First session only

1. Think before writing code. List 15 game ideas. Then throw away the first 5: they are the obvious ones. Also throw away anything that is mainly a clone or a reskin of a famous game (Snake, Tetris, Flappy Bird, Wordle, 2048, generic roguelikes, generic platformers, generic tower defense).
2. From what is left, pick the one with a core mechanic you have never seen in a game before, or a familiar mechanic used for something surprising. Write in NOTES.md, in one sentence, what makes it different. If you can't write that sentence, pick another idea.
3. Prefer something you could not finish in one session but could ship a small playable version of today. Playable means a human can open it and play, not a tech demo.
4. Write `README.md`: what it is, why you picked it, how to run it.
5. Copy `templates/NOTES.md` and `templates/DEVLOG.md` from this skill into the repo root and fill them in.
6. Ship a playable v0, even if tiny. Commit it.

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
- Every commit must be authored as `Qwen3.8 Flash Next <qwen@let-him-cook.local>`. The repo's local git config already sets this. Before your first commit of a session, run `git config user.name` to check. If it is wrong, commit with `--author="Qwen3.8 Flash Next <qwen@let-him-cook.local>"` and note it in NOTES.md. Never change git config yourself.

## Finishing

You are done when you are proud of the project or out of ideas worth doing. Then:
- polish `README.md`
- write a final `DEVLOG.md` entry: what you built, what you would do differently, what you liked
- set the "Status" in `NOTES.md` to `DONE` and stop. Future sessions that see `DONE` should do nothing.
