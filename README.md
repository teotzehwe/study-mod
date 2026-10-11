# study-mode

A Claude Code mod: flashcards open in a side pane the moment Claude starts working, and close the moment it finishes. Study while it codes; review its changes when it's done; send it off again.

```
you prompt ──► Claude works ──► pane opens: flashcards (can't close it by hand)
                    │
                    ▼
            Claude finishes ──► pane closes, toast: "3 cards, 2 got. Go check the changes."
```

## Install

In a Claude Code terminal session:

```
/plugin install study-mode --marketplace teotzehwe/study-mod
```

Answer `y` to add the marketplace, then pick the user scope (Enter).

## Use

- Send Claude a prompt. The **Study** pane opens with a card.
- `r` reveal → `y` got it / `n` missed. Enter presses the highlighted button.
- `Esc` hands the keyboard back to the prompt; the pane stays until Claude is done.

| Command | Does |
| --- | --- |
| `/study` | Status: decks, cards due, your hit rate |
| `/study off` / `/study on` | Turn the mod off or on (works mid-turn) |
| `/study phys` | Only cards from the deck whose name contains "phys" |
| `/study all` | Back to every deck |

Cards are scheduled with Leitner boxes: a miss comes back in 2 minutes; each hit pushes the card out further (1, 3, 7, 21 days). Progress is kept across sessions.

## Your own decks

Drop Markdown files in `~/.claude/study/` (every project) or `<project>/.claude/study/` (that project):

```markdown
# H1 General Paper

Q: What makes an argument "balanced"?
A: It weighs the strongest opposing view, then evaluates it with evidence.
```

A line that doesn't start with `Q:` or `A:` continues the one above. See `examples/h1-gp.md`. Starter decks for H2 Physics, Chemistry, Mathematics and Economics are built in (`hooks/decks.ts`).

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
