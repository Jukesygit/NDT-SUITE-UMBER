"""
Matrix NDT Companion dark theme — mirrors NDT Suite web app styling.

Colors sourced directly from:
  - src/styles/glassmorphic.css  (glass effects, base accents)
  - src/styles/design-tokens.css (surfaces, text, borders)
  - src/themes.ts                (Cyber Teal theme overrides)
"""

from tkinter import ttk


# ── Surface colors (design-tokens.css) ──
SURFACE_BASE = "#0a0f1a"
SURFACE_RAISED = "#121825"
SURFACE_ELEVATED = "#1a2332"
SURFACE_OVERLAY = "#222b3d"

# ── Glass effect backgrounds (glassmorphic.css) ──
GLASS_PRIMARY = "#141923"      # rgba(20, 25, 35, 0.75) over dark
GLASS_SECONDARY = "#1e232d"    # rgba(30, 35, 45, 0.65) over dark
GLASS_TERTIARY = "#232832"     # rgba(35, 40, 50, 0.7) over dark

# ── Accent — periwinkle blue (glassmorphic.css base layer) ──
ACCENT_BLUE = "#6496ff"        # rgba(100, 150, 255, 0.9)
ACCENT_BLUE_LIGHT = "#78aaff"  # rgba(120, 170, 255, 0.9)
ACCENT_BLUE_DIM = "#4a6fbf"    # rgba(100, 150, 255, 0.5) approx
ACCENT_BLUE_SUBTLE = "#1c2a4d" # rgba(100, 150, 255, 0.15) over dark

# ── Accent — Cyber Teal (themes.ts active theme for interactive elements) ──
ACCENT_TEAL = "#06b6d4"
ACCENT_TEAL_LIGHT = "#22d3ee"
ACCENT_TEAL_DIM = "#0e7490"

# ── Semantic ──
SUCCESS = "#22c55e"
WARNING = "#f97316"
DANGER = "#ef4444"
INFO = "#3b82f6"

# ── Text (glassmorphic.css) ──
TEXT_PRIMARY = "#ffffff"
TEXT_SECONDARY = "#d9d9d9"     # rgba(255,255,255,0.85)
TEXT_TERTIARY = "#b3b3b3"      # rgba(255,255,255,0.70)
TEXT_DIM = "#8c8c8c"           # rgba(255,255,255,0.55)
TEXT_ACCENT = "#96b4ff"        # rgba(150, 180, 255, 1)
TEXT_DISABLED = "#404040"      # rgba(255,255,255,0.25)

# ── Borders (glassmorphic.css) ──
GLASS_BORDER = "#2a2d36"      # rgba(255,255,255,0.12) over dark
GLASS_BORDER_STRONG = "#3a3d46"  # rgba(255,255,255,0.18)
CARD_BORDER = "#2d4080"        # rgba(100, 150, 255, 0.3) over dark

# ── Tray icon ──
TRAY_ACTIVE = (6, 182, 212, 255)     # Teal accent
TRAY_IDLE = (148, 163, 184, 255)     # Slate-400


def apply_theme(root):
    """Apply the NDT Suite dark theme to a tkinter root and its ttk.Style."""

    root.configure(bg=SURFACE_BASE)
    root.option_add("*Background", SURFACE_BASE)
    root.option_add("*Foreground", TEXT_PRIMARY)
    root.option_add("*Font", ("Segoe UI", 10))
    root.option_add("*selectBackground", ACCENT_BLUE_DIM)
    root.option_add("*selectForeground", TEXT_PRIMARY)

    style = ttk.Style(root)
    style.theme_use("clam")

    # ── TFrame ──
    style.configure("TFrame", background=SURFACE_BASE)
    style.configure("Card.TFrame", background=GLASS_PRIMARY)

    # ── TLabel ──
    style.configure("TLabel",
                     background=SURFACE_BASE,
                     foreground=TEXT_PRIMARY,
                     font=("Segoe UI", 10))
    style.configure("Secondary.TLabel", foreground=TEXT_SECONDARY)
    style.configure("Dim.TLabel", foreground=TEXT_DIM)
    style.configure("Accent.TLabel", foreground=TEXT_ACCENT)
    style.configure("Title.TLabel",
                     font=("Segoe UI", 14, "bold"),
                     foreground=TEXT_PRIMARY)

    # ── TLabelframe — mimics glass cards with blue-tinted border ──
    style.configure("TLabelframe",
                     background=GLASS_PRIMARY,
                     foreground=TEXT_TERTIARY,
                     bordercolor=CARD_BORDER,
                     darkcolor=GLASS_PRIMARY,
                     lightcolor=GLASS_PRIMARY,
                     relief="solid",
                     borderwidth=1)
    style.configure("TLabelframe.Label",
                     background=GLASS_PRIMARY,
                     foreground=TEXT_ACCENT,
                     font=("Segoe UI", 10, "bold"))

    # ── TEntry — glass-bg-secondary style ──
    style.configure("TEntry",
                     fieldbackground=GLASS_SECONDARY,
                     foreground=TEXT_PRIMARY,
                     insertcolor=TEXT_PRIMARY,
                     bordercolor=GLASS_BORDER,
                     lightcolor=GLASS_BORDER,
                     darkcolor=GLASS_BORDER,
                     selectbackground=ACCENT_BLUE_DIM,
                     selectforeground=TEXT_PRIMARY,
                     padding=(8, 6))
    style.map("TEntry",
              fieldbackground=[("focus", GLASS_TERTIARY), ("disabled", SURFACE_BASE)],
              bordercolor=[("focus", ACCENT_BLUE_DIM)],
              lightcolor=[("focus", ACCENT_BLUE_DIM)],
              foreground=[("disabled", TEXT_DISABLED)])

    # ── TButton — gradient-blue primary style ──
    style.configure("TButton",
                     background=GLASS_SECONDARY,
                     foreground=TEXT_SECONDARY,
                     bordercolor=GLASS_BORDER,
                     darkcolor=GLASS_SECONDARY,
                     lightcolor=GLASS_SECONDARY,
                     focuscolor=ACCENT_BLUE_DIM,
                     padding=(16, 8),
                     font=("Segoe UI", 10))
    style.map("TButton",
              background=[("active", GLASS_TERTIARY), ("pressed", GLASS_TERTIARY),
                          ("disabled", SURFACE_BASE)],
              foreground=[("active", TEXT_PRIMARY), ("disabled", TEXT_DISABLED)],
              bordercolor=[("active", ACCENT_BLUE_DIM), ("focus", ACCENT_BLUE_DIM)])

    # Primary — matches .btn--primary gradient blue
    style.configure("Primary.TButton",
                     background=ACCENT_BLUE,
                     foreground="#ffffff",
                     bordercolor=ACCENT_BLUE_DIM,
                     darkcolor=ACCENT_BLUE,
                     lightcolor=ACCENT_BLUE_LIGHT,
                     padding=(20, 8),
                     font=("Segoe UI", 10, "bold"))
    style.map("Primary.TButton",
              background=[("active", ACCENT_BLUE_LIGHT), ("pressed", ACCENT_BLUE_LIGHT),
                          ("disabled", SURFACE_ELEVATED)],
              foreground=[("disabled", TEXT_DISABLED)])

    # Danger — matches .btn--danger
    style.configure("Danger.TButton",
                     background=DANGER,
                     foreground="#ffffff",
                     bordercolor=DANGER,
                     darkcolor=DANGER,
                     lightcolor=DANGER)
    style.map("Danger.TButton",
              background=[("active", "#dc2626"), ("disabled", SURFACE_ELEVATED)])

    # Success
    style.configure("Success.TButton",
                     background=SUCCESS,
                     foreground="#ffffff",
                     bordercolor=SUCCESS,
                     darkcolor=SUCCESS,
                     lightcolor=SUCCESS)

    # ── TRadiobutton ──
    style.configure("TRadiobutton",
                     background=GLASS_PRIMARY,
                     foreground=TEXT_PRIMARY,
                     indicatorcolor=GLASS_SECONDARY,
                     focuscolor=GLASS_PRIMARY,
                     font=("Segoe UI", 10))
    style.map("TRadiobutton",
              indicatorcolor=[("selected", ACCENT_BLUE)],
              background=[("active", GLASS_PRIMARY)])

    # ── TCombobox ──
    style.configure("TCombobox",
                     fieldbackground=GLASS_SECONDARY,
                     background=GLASS_PRIMARY,
                     foreground=TEXT_PRIMARY,
                     arrowcolor=TEXT_DIM,
                     bordercolor=GLASS_BORDER,
                     lightcolor=GLASS_BORDER,
                     darkcolor=GLASS_BORDER,
                     selectbackground=ACCENT_BLUE_DIM,
                     selectforeground=TEXT_PRIMARY,
                     padding=(8, 6))
    style.map("TCombobox",
              fieldbackground=[("focus", GLASS_TERTIARY), ("readonly", GLASS_SECONDARY)],
              bordercolor=[("focus", ACCENT_BLUE_DIM)],
              lightcolor=[("focus", ACCENT_BLUE_DIM)],
              arrowcolor=[("focus", ACCENT_BLUE)])
    root.option_add("*TCombobox*Listbox.background", GLASS_SECONDARY)
    root.option_add("*TCombobox*Listbox.foreground", TEXT_PRIMARY)
    root.option_add("*TCombobox*Listbox.selectBackground", ACCENT_BLUE_DIM)
    root.option_add("*TCombobox*Listbox.selectForeground", TEXT_PRIMARY)

    # ── TSpinbox ──
    style.configure("TSpinbox",
                     fieldbackground=GLASS_SECONDARY,
                     background=GLASS_PRIMARY,
                     foreground=TEXT_PRIMARY,
                     arrowcolor=TEXT_DIM,
                     bordercolor=GLASS_BORDER,
                     lightcolor=GLASS_BORDER,
                     darkcolor=GLASS_BORDER,
                     insertcolor=TEXT_PRIMARY,
                     padding=(8, 6))
    style.map("TSpinbox",
              fieldbackground=[("focus", GLASS_TERTIARY)],
              bordercolor=[("focus", ACCENT_BLUE_DIM)],
              lightcolor=[("focus", ACCENT_BLUE_DIM)])

    # ── Treeview — dark card bg with blue-accented selection ──
    style.configure("Treeview",
                     background=GLASS_PRIMARY,
                     foreground=TEXT_PRIMARY,
                     fieldbackground=GLASS_PRIMARY,
                     bordercolor=CARD_BORDER,
                     font=("Segoe UI", 10),
                     rowheight=28)
    style.configure("Treeview.Heading",
                     background=SURFACE_RAISED,
                     foreground=TEXT_DIM,
                     bordercolor=GLASS_BORDER,
                     font=("Segoe UI", 9, "bold"))
    style.map("Treeview",
              background=[("selected", ACCENT_BLUE_SUBTLE)],
              foreground=[("selected", TEXT_PRIMARY)])
    style.map("Treeview.Heading",
              background=[("active", SURFACE_ELEVATED)])

    # ── TScrollbar ──
    style.configure("TScrollbar",
                     background=SURFACE_RAISED,
                     troughcolor=SURFACE_BASE,
                     bordercolor=SURFACE_BASE,
                     arrowcolor=TEXT_DIM,
                     darkcolor=SURFACE_BASE,
                     lightcolor=SURFACE_BASE)
    style.map("TScrollbar",
              background=[("active", ACCENT_BLUE_DIM), ("pressed", ACCENT_BLUE)])

    # ── Horizontal.TProgressbar — blue accent bar ──
    style.configure("Horizontal.TProgressbar",
                     background=ACCENT_BLUE,
                     troughcolor=SURFACE_RAISED,
                     bordercolor=GLASS_BORDER,
                     darkcolor=ACCENT_BLUE,
                     lightcolor=ACCENT_BLUE_LIGHT)

    # ── TSeparator ──
    style.configure("TSeparator", background=GLASS_BORDER)

    return style
