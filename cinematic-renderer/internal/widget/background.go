// Package widget provides a plasma-style animated background for Bubbletea TUIs.
//
// This is a vendored/self-contained implementation that replaces the external
// github.com/OnlineChef/bubbletea-cinematic/widget dependency.
package widget

import (
	"math"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

// BackgroundWidget renders an animated plasma gradient background.
type BackgroundWidget struct {
	width  int
	height int
	frame  int
}

// NewPlasmaBackground creates a new plasma background with the given dimensions.
func NewPlasmaBackground(width, height int) *BackgroundWidget {
	return &BackgroundWidget{width: width, height: height}
}

// Init returns a tick command to start the animation loop.
func (w *BackgroundWidget) Init() tea.Cmd {
	return nil
}

// Update handles window resize and tick messages.
func (w *BackgroundWidget) Update(msg tea.Msg) (*BackgroundWidget, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		w.width = msg.Width
		w.height = msg.Height
	}
	w.frame++
	return w, nil
}

// View renders the plasma background as an ANSI-colored string.
func (w *BackgroundWidget) View() string {
	if w.width <= 0 || w.height <= 0 {
		return ""
	}

	var buf strings.Builder
	t := float64(w.frame) * 0.05

	for y := 0; y < w.height; y++ {
		for x := 0; x < w.width; x++ {
			fx := float64(x) / float64(w.width)
			fy := float64(y) / float64(w.height)

			// Simple plasma function combining sine waves
			v := math.Sin(fx*6.0+t) +
				math.Sin(fy*4.0+t*0.7) +
				math.Sin((fx+fy)*3.0+t*0.5) +
				math.Sin(math.Sqrt(fx*fx+fy*fy)*4.0+t*0.8)

			// Normalize to 0..1
			v = (v + 4.0) / 8.0

			// Map to dark blue/purple/cyan palette
			r := int(math.Max(0, math.Min(255, v*60+10)))
			g := int(math.Max(0, math.Min(255, v*40+5)))
			b := int(math.Max(0, math.Min(255, v*180+40)))

			// Use 24-bit ANSI background color
			buf.WriteString("\033[48;2;")
			buf.WriteString(itoa(r))
			buf.WriteByte(';')
			buf.WriteString(itoa(g))
			buf.WriteByte(';')
			buf.WriteString(itoa(b))
			buf.WriteByte('m')
			buf.WriteByte(' ')
		}
		buf.WriteString("\033[0m")
		if y < w.height-1 {
			buf.WriteByte('\n')
		}
	}

	return buf.String()
}

// itoa is a fast int-to-string for small non-negative ints (0-255).
func itoa(i int) string {
	if i < 10 {
		return string(rune('0' + i))
	}
	if i < 100 {
		return string([]byte{byte('0' + i/10), byte('0' + i%10)})
	}
	return string([]byte{byte('0' + i/100), byte('0' + (i/10)%10), byte('0' + i%10)})
}
