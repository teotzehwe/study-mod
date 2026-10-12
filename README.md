# study-mode

A Claude Code mod: while Claude works, a side pane opens your own notes from Google Drive (GoodNotes backups, school PDFs, Google Docs). You read them, or work the practice questions out on paper. When Claude finishes, the pane closes and you go check its changes.

```
you prompt ──► Claude works ──► pane opens your notes at your bookmark (can't close it by hand)
                    │
                    ▼
            Claude finishes ──► pane closes: "3 pages of 07 Oscillations Notes, bookmarked."
```

## What you see

- **Files**: your Drive folder (default `GoodNotes`), folders first. Pick a subject, a topic, then a PDF.
- **The page itself**, drawn as an image. Landscape 2-up handouts are split into left and right halves so they're readable in a sidebar.
- **Notes** (any file not named like practice): "Read it, then look away and recall the key points." `Next ▶`.
- **Practice** (titles with PTQ, PLQ, tutorial, quiz, worksheet, paper, TYS, exam…): "Work each question out on paper before you move on." `Wrote it ▶`.
- Your place in every file is bookmarked. The next time Claude works, even in a new session, the notes reopen where they last closed: the same file at the same page, or the folder you were browsing.

Keys while the pane has focus: `n` next, `p` previous, `f` files, `u` up a folder. `Esc` hands the keyboard back to the prompt; the pane stays until Claude is done.

| Command | Does |
| --- | --- |
| `/study` | While Claude works: show the notes. Otherwise: status |
| `/study off` / `/study on` | Turn the mod off or on (works mid-turn) |
| `/study folder <name>` | Use another Drive folder as the top level |

## Where it works

The pane needs a Claude Code that draws on your own screen:

- **Claude desktop app, Code tab, local session**: pages show as images. Best option.
- **Terminal** (`claude`): pages show as images in kitty or Ghostty; other terminals show the file and page with a Drive link. Below 144 columns the pane waits until you type `/study`.
- **Not in cloud sessions** (claude.ai/code, or the app viewing a cloud session): those draw no mod panes, so the mod runs but nothing appears.

## Needs

1. **Google Drive connected to Claude** (claude.ai → Settings → Connectors). The mod reads Drive through it.
2. **GoodNotes auto-backup to Google Drive as PDF** (GoodNotes → Settings → Auto-Backup), which creates the `GoodNotes/<Subject>/…` folders.
3. **poppler** on the machine Claude Code runs on, to draw pages: `brew install poppler` (macOS), `apt install poppler-utils` (Linux). Cloud sessions already have it.
4. **rclone, for notes over 10 MB.** Drive's connector sends files up to 10 MB, and GoodNotes notes are often bigger. With rclone signed in to your Drive (read-only), the mod downloads any file by its Drive id instead:

   ```
   brew install rclone
   rclone config create gdrive drive scope=drive.readonly
   ```

   The second command opens your browser to sign in. Without rclone, files under 10 MB still open through the connector, and bigger ones say how to set it up. rclone's shared sign-in is being retired during 2026; if downloads start failing with a sign-in error, [make your own client id](https://rclone.org/drive/#making-your-own-client-id), add it with `rclone config update gdrive client_id=<id> client_secret=<secret>`, then sign in again with `rclone config reconnect gdrive:`.

## Install

In a Claude Code terminal session:

```
/plugin install study-mode --marketplace teotzehwe/study-mod
```

Answer `y` to add the marketplace, then pick the user scope (Enter).

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

`hooks/register.tsx` holds every hook and engine call; `hooks/drive.ts` (Drive queries and results) and `hooks/pages.ts` (page layout and rendering arguments) are pure helpers.
