package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/OnlineChef/bubbletea-cinematic/widget"
)

// AgentState represents the JSON structure we expect from the Node.js extension.
type AgentState struct {
	Agents            []AgentInfo `json:"agents"`
	ShowActivityStream bool        `json:"showActivityStream"`
	ShowTokenUsage     bool        `json:"showTokenUsage"`
	ShowTurnProgress   bool        `json:"showTurnProgress"`
}

type AgentInfo struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	Role               string `json:"role"`
	Status             string `json:"status"`
	Tokens             int    `json:"tokens"`
	Progress           int    `json:"progress"`
	Activity           string `json:"activity,omitempty"`
}

// CinematicDashboard integrates the plasma background and overlays agent info.
// For now, it just wraps PlasmaBackground and logs how many agents it receives.
type CinematicDashboard struct {
	bg     *widget.BackgroundWidget
	state  AgentState
	width  int
	height int
}

func initialModel() CinematicDashboard {
	return CinematicDashboard{
		bg: widget.NewPlasmaBackground(80, 24),
	}
}

// We need a custom message to signal stdin updates.
type stateUpdateMsg AgentState

func (m CinematicDashboard) Init() tea.Cmd {
	return tea.Batch(
		m.bg.Init(),
		listenForStateUpdates(),
	)
}

func (m CinematicDashboard) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "q" || msg.String() == "ctrl+c" {
			return m, tea.Quit
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.bg, _ = m.bg.Update(msg)
	case stateUpdateMsg:
		m.state = AgentState(msg)
		return m, listenForStateUpdates() // Wait for next
	}

	var cmd tea.Cmd
	m.bg, cmd = m.bg.Update(msg)
	return m, cmd
}

func (m CinematicDashboard) View() string {
	bgView := m.bg.View()

	// Build status lines based on display settings
	var lines []string
	lines = append(lines, fmt.Sprintf("\n\n  Pi Cinematic TUI Dashboard - %d Active Agents", len(m.state.Agents)))

	for _, a := range m.state.Agents {
		line := fmt.Sprintf("\n  [ %s ] %s - %s", a.ID, a.Role, a.Status)

		if m.state.ShowTokenUsage && a.Tokens > 0 {
			line += fmt.Sprintf(" (%d tokens)", a.Tokens)
		}

		if m.state.ShowTurnProgress && a.Progress > 0 {
			line += fmt.Sprintf(" [%d%%]", a.Progress)
		}

		if m.state.ShowActivityStream && a.Activity != "" {
			line += fmt.Sprintf("\n    ↳ %s", a.Activity)
		}

		lines = append(lines, line)
	}

	return bgView + strings.Join(lines, "")
}

func listenForStateUpdates() tea.Cmd {
	return func() tea.Msg {
		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() {
			line := scanner.Text()
			var state AgentState
			if err := json.Unmarshal([]byte(line), &state); err == nil {
				return stateUpdateMsg(state)
			}
		}
		// If scanner fails or EOF, we just return nil or handle it.
		// For now, return nothing so it doesn't spin wildly.
		return nil
	}
}

func main() {
	p := tea.NewProgram(initialModel())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v", err)
		os.Exit(1)
	}
}
