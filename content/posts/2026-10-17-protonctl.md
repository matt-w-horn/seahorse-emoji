+++
title = "protonctl: a local, read-only MCP server for Proton"
date = 2026-10-17
author = "Matt Horn"
+++

[protonctl](https://github.com/matt-w-horn/protonctl) is a local, read-only MCP server and command-line tool in Rust that lets Claude Code, Claude Desktop, and Cowork search and read your Proton Mail, Proton Drive, and Proton Calendar on macOS and Linux. It is an independent open-source project and is unaffiliated with Proton AG.

Before you install it, be very careful about what you let it read. You use Proton because your mail, files, and calendar are end-to-end encrypted. The moment Claude calls a `protonctl` tool to read a message, event, or file, that content is decrypted on your machine and handed to the host app in plaintext. From there it is no longer encrypted: the host writes it to local session transcripts on your disk and sends it to Anthropic's servers under your account's terms. Other tools in the same session, like web search, a shell, or another connector, can also pass it along. Treat reading anything into Claude through `protonctl` the same as forwarding it in cleartext to an untrusted third party. If you wouldn't forward a thread or document outside Proton, don't read it into an assistant.

## How it reads without your Proton password

Proton has no general cloud API for mail or files because the server only holds ciphertext. `protonctl` runs on your computer and reads through the local Proton clients that already hold your keys:

| Service | How `protonctl` reads it |
|---|---|
| Mail | Connects to Proton Mail Bridge over local IMAP (`127.0.0.1`) with Bridge's TLS certificate pinned on first setup. |
| Drive | Searches filenames in the Proton Drive app's local folder and reads file bytes through a signature-checked copy of the official `proton-drive` CLI. |
| Calendar | Pipes a Full-view share link to `/usr/bin/curl` on stdin so the URL never shows up in process arguments. |

`protonctl` never sees your Proton password or private keys. Mail uses the local password that Bridge generates, Drive uses the CLI's own sign-in, and both the Bridge password and the calendar link live in the macOS Keychain (or the Linux Secret Service over D-Bus), never in `~/.config/protonctl/config.toml`.

## Why it has no write tools

An inbox is full of untrusted text written by other people. If a mail tool can send, reply, forward, share, or delete, an instruction hidden inside an incoming email only has to talk the model into calling it. Confirmation prompts don't save you when people approve more than ninety percent of them from habit.

So `protonctl` has no code that writes. It opens IMAP mailboxes read-only (`EXAMINE`), has no SMTP client, and cannot send, draft, move, label, share, or delete across Mail, Drive, or Calendar.

## Closing the routes around the server

A read-only server doesn't help much if a parser bug or a shell tool can walk around it.

Mail attachments and Drive files are often PDFs or Word, RTF, and OpenDocument files. When `protonctl` extracts text from one, it runs the reader (`PDFKit` and `textutil` on macOS, `poppler` and `pandoc` on Linux) inside an OS sandbox (`sandbox-exec` on macOS, Landlock and a `seccomp` filter on Linux) that can read system libraries, write nothing, reach no network, and read no Keychain item. Before it runs `proton-drive`, it copies the binary to a private folder and checks Proton's Apple Developer ID signature on that copy (or a pinned SHA-256 on Linux) right before exec, so nothing on `PATH` can swap the binary between check and use. `scripts/install.sh` builds `protonctl` with `#![forbid(unsafe_code)]` and signs it with the macOS hardened runtime so another user process can't inject a library with `DYLD_INSERT_LIBRARIES` and inherit its Keychain approval.

In Claude Code the model also has a shell. Without a fence, a bash command could read `~/Library/CloudStorage/ProtonDrive-*`, talk straight to Bridge's IMAP port, or edit `config.toml` to drop folder exclusions. These settings in `~/.claude/settings.json` close those paths for commands Claude runs:

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false,
    "filesystem": {
      "denyRead": ["~/Library/CloudStorage/ProtonDrive-*", "~/bin/proton-drive"],
      "denyWrite": ["~/.config/protonctl"]
    },
    "network": {
      "deniedDomains": ["proton.me", "*.proton.me"],
      "strictAllowlist": true,
      "allowLocalBinding": false
    }
  }
}
```

## Why it doesn't try to redact names locally

I also considered having `protonctl` scrub names, organizations, and places with a local named-entity model before returning tool results to Claude, replacing matches with tokens like `PERSON_001` or `ORG_004`.

The problem is that a local entity model still misses a few percent of names, and even when every name is replaced, a model can usually tell who or what an email is about from the rest of the thread. A redaction mode that looks like a privacy shield while still leaking names and context makes it too easy to point the tool at mail you shouldn't expose at all.

Leaving redaction out keeps the rule clear: anything `protonctl` reads goes to the host model in the clear, the same as forwarding it to a third party. For Drive folders you never want read, put them in `[drive] exclude` in `config.toml` so `protonctl` hides them before a result is built.

The code, the RFC, and the threat model are at [matt-w-horn/protonctl](https://github.com/matt-w-horn/protonctl).

