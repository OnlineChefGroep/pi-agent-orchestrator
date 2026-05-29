# TUI Learning: Beautiful Modals and Explicit Keyboard Shortcuts

- Instead of using `content.split("\n")` for modal dialogs (like Permissions/Scope), framing the text using `borderLine`, `framedRow`, and drawing borders natively with the theme colors creates a much more polished look.
- Always use specific keyboard shortcuts (`matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "enter")`) rather than allowing any keystroke to close an overlay window. This provides clear intent and prevents accidental closing when the user types while unaware they are focused on a modal.
