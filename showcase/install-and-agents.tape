# VHS showcase: build + live terminal demo (path injected by render-showcase-vhs.sh)
Output docs/images/showcase_vhs.gif

Set Shell "bash"
Set FontSize 16
Set Width 1100
Set Height 720
Set Theme "Dracula"
Set Padding 20
Set MarginFill "#181818"

Hide
Type "cd REPO_PLACEHOLDER"
Enter
Sleep 500ms
Show

Type "npm run build"
Enter
Sleep 12s

Type "node scripts/showcase-live-demo.mjs --auto"
Enter
Sleep 22s

Sleep 1s