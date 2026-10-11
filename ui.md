# 🎨 Stitch by Google — Master Design Prompts & Cross-Platform UI Blueprint

> **For Stitch (`stitch.withgoogle.com`)**: This document is engineered specifically as an input prompt and design specification for Google Stitch. It defines the complete capability set, responsive design rules (Desktop PC & Mobile Touch), and ready-to-copy prompts to generate state-of-the-art UI prototypes.

---

## 🚀 PART 1: READY-TO-PASTE PROMPTS FOR STITCH

### 📋 Option A: Complete Master Prompt (Paste this directly into Stitch)

```text
Design a modern, ultra-sleek, cross-platform Manga/Comic Translation & Typesetting Studio web application for both Desktop (1440px+) and Mobile (390px viewport). 

Visual Aesthetic:
- Dark theme inspired by professional creative suites (Figma, Linear, CapCut Web, Photoshop). 
- Primary surface colors: Deep neutral obsidian (#0f1117, #181b23) with subtle frosted glass (backdrop-blur), crisp borders (#2a2e3d), and glowing accents in Indigo/Violet (#6366f1) and Emerald for AI status.
- Typography: Clean sans-serif (Inter / Outfit / Plus Jakarta Sans). High information density without visual clutter.

Core Functional Requirements:
1. Workspace Canvas: Center stage displaying a manga page with zoom/pan controls, comparison toggle (Original vs. AI Cleaned artwork), and interactive bounding boxes representing dialogue bubbles.
2. In-Canvas Interaction: Ability to select, move, resize text bubbles, and directly edit translated dialogue over the art.
3. 6 Manga Balloon Shapes: Visual selector for Ellipse (standard dialog), Rounded Box, Rectangle (narration), Spiky Shout (yelling/action), Cloud (thought), and Borderless/Transparent (SFX/free text).
4. Typography & Styling: Font family selector (manga fonts), font size stepper/slider with "Auto-fit" toggle, text color, outline stroke color/width, background balloon fill & opacity, border color/width, padding.
5. AI Action Center: Prominent "1-Click Full Auto Translate" action, plus discrete granular triggers: "Detect Text", "Clean Art (LaMa Inpainting)", "Translate (Gemini)". Live status indicator for AI cloud backend.
6. Chapter Filmstrip / Page Navigator: Multi-page gallery with thumbnails, page counter, and batch export actions.

Responsive Adaptations:
- Desktop (PC): Expansive workspace with ergonomic floating toolbars (or collapsible sidebars), precision pointer controls, and split layout.
- Mobile (Phone): Fullscreen edge-to-edge canvas with thumb-friendly bottom floating dock, gesture pinch-zoom, and an expandable swipeable Bottom Sheet for bubble typography and editing.
```

---

### 📱 Option B: Mobile-Specific Screen Prompt (Phone Portrait 390px)

```text
Design the Mobile View of an AI Manga Translation & Typesetting App (iOS / Android web app, 390x844px).

Key Sections:
1. Top Bar (Minimal HUD): 
   - Compact page counter ("Page 3 of 24" with Prev/Next chevron buttons).
   - AI Engine status dot (glowing green/amber).
   - "Before/After" quick-peek hold icon.
   - Export icon button.

2. Main Canvas Area (Full Viewport):
   - Edge-to-edge manga page with smooth pinch-to-zoom and pan.
   - Interactive dialogue bubbles highlighted with sleek colored outlines and touch-friendly corner resize nodes.
   - Subtle floating zoom controls (Fit Screen, 100%, Zoom In/Out) tucked into the canvas corner.

3. Bottom Floating Action Dock (Thumb-zone):
   - Centered primary gradient button: "⚡ Auto Translate (1-Tap)".
   - Quick tool switches: [Select/Hand], [Draw Box], [Erase Brush], [Pages Sheet].

4. Swipeable Modal Bottom Sheet (Triggered when tapping a dialogue bubble):
   - Header with bubble shape icon selector (Ellipse, Spiky Shout, Cloud Thought, Narration Box).
   - Direct textarea for editing translated Vietnamese text + original OCR preview toggle.
   - Quick font size adjustment ([-] [+] buttons, direct number, Auto-fit toggle).
   - Visual chips for Font Selection and Color swatches.
   - Drag handle on top to dismiss or pull up to full screen.
```

---

### 💻 Option C: Desktop Studio Prompt (Widescreen 1440px+)

```text
Design the Desktop Studio View of an AI Manga Translation Suite (1440x900px+).

Layout Architecture:
1. Left Collapsible Filmstrip (Page Navigator):
   - Vertical list of page thumbnails showing status badges ("Cleaned", "Translated", "Raw").
   - Drag-and-drop file upload zone + Folder Import button at the top.
   - Batch Export Chapter button at the bottom.

2. Center Viewport (Manga Canvas):
   - Large dark canvas workspace with drop shadow on page.
   - Top-centered floating pill toolbar: Zoom percentage slider, Fit-to-screen, Before/After toggle, Undo/Redo history buttons.
   - Bottom-floating tool dock: Selection tool, Draw text box tool, AI Manual Inpaint eraser brush.
   - Selected speech bubble displays clean solid vector outline, 8 transform handles, and inline text editing.

3. Right Inspector (Floating or Docked Panel):
   - Text tab: Original OCR text box (copyable) and Translated text editor.
   - Bubble Shape Archetypes: 6 visual icon cards (Oval, Rounded, Rectangular, Spiky Shout, Thought Cloud, Invisible).
   - Typography Section: Font family dropdown with font previews, font size stepper with Auto-fit switch, text color & stroke outline sliders, line-height & alignment.
   - Container Styling Section: Fill background color + opacity slider, border thickness + color, padding.

4. Top App Bar:
   - App branding, project title, Google Colab / Hugging Face server connection pill with latency ping, Gemini API key settings modal trigger, and high-res Export button.
```

---

## 📐 PART 2: CROSS-PLATFORM ADAPTIVE MATRIX (PC VS. MOBILE)

| Feature / Action | Desktop PC Interaction (Mouse & Keyboard) | Mobile Phone Interaction (Touch & Gestures) |
|---|---|---|
| **Canvas Pan & Zoom** | Mouse wheel zoom, Spacebar + drag to pan, shortcut keys (`Ctrl + +/-`). | 2-finger pinch zoom, 1-finger pan with Hand tool, mini floating zoom buttons. |
| **Page Navigation** | Persistent or collapsible vertical thumbnail sidebar. | Swipe left/right, top nav chevrons, or pull-up thumbnail carousel sheet. |
| **Bubble Selection & Move** | Precise mouse drag, 8 cursor resize handles, arrow key nudging. | Touch-to-select, enlarged hitboxes on corner handles, drag to move. |
| **Text Editing** | Direct in-place editing on canvas or via Inspector side panel. | Tapping bubble smoothly opens the Bottom Sheet keyboard input. |
| **Bubble Typography & Shape** | Dedicated Inspector panel with persistent sliders and pickers. | Swipeable Bottom Sheet with segmented tabs or horizontal scrolling chips. |
| **AI Workflows (Inpaint / Translate)** | Top toolbar buttons + keyboard shortcuts (`Ctrl+Enter` to run auto). | Large sticky action pill in the bottom thumb zone. |
| **Manual Erase / Retouch** | Precise cursor circle brush with adjustable radius slider. | Touch-draw mask with stylus or finger + instant undo button. |
| **Exporting** | Download dropdown (PNG, WebP, ZIP archive, or save to disk folder). | Native share sheet trigger or direct image download button. |

---

## 🧩 PART 3: COMPLETE COMPONENT & FEATURE INVENTORY

Ensure any UI generated in Stitch includes these components and capabilities:

### 1. Document & Page Management
- Multi-file image uploader & directory folder picker.
- Page thumbnail strip with processing status badges (`Raw`, `Cleaned`, `Translated`).
- Quick navigation: Next / Previous, Page index indicator (`3 / 24`).
- Page actions: Delete page, clear workspace.

### 2. Viewport & Canvas Tools
- Image canvas supporting ultra-high resolution manga spreads.
- Instant "Before / After" comparison (toggle between original and AI-cleaned artwork).
- Active tool states:
  - 👆 **Select / Transform**: Move, resize, and rotate dialog boxes.
  - ➕ **Draw Box**: Click/drag to create new speech bubble regions.
  - 🖌️ **Inpaint Brush**: Paint over missed artifacts to trigger LaMa neural inpainting.
- Canvas viewport controls: Zoom In, Zoom Out, Fit to Screen, 100% scale.

### 3. Speech Bubble & Typography Customization
- **6 Speech Bubble Shapes**:
  1. `Ellipse`: Classic comic dialogue balloon.
  2. `Rounded`: Modern manhwa rounded rectangle.
  3. `Rectangle`: Narration box / system dialog.
  4. `Shout`: Spiky high-impact action bubble.
  5. `Thought`: Cloud-scalloped internal monologue.
  6. `Transparent`: Borderless container for SFX / floating dialogue.
- **Typography Engine**:
  - Manga font selector (collection of specialized manga typefaces + standard fonts).
  - Font size controls: numeric input, `[-]` `[+]` stepping buttons, slider, and `Auto-fit` toggle.
  - Text alignment: Left, Center, Right.
  - Text transforms: Bold, Italic, All-Caps.
  - Readability outline: Text stroke color and thickness slider.
  - Line height multiplier.
- **Bubble Fill & Border Styling**:
  - Background fill color picker & Opacity slider (0% to 100%).
  - Border stroke color picker & Border width slider (1px to 8px).
  - Corner radius slider (for box shapes).
  - Inner padding slider.

### 4. AI Engine & Pipelines
- **"1-Click Auto Translate"**: Sequentially executes text detection, neural inpainting (LaMa), LLM translation (Gemini), and intelligent font auto-fitting.
- **Granular AI Buttons**:
  - `Detect Text`: Bounding box detection on the active page.
  - `Clean Page / Inpaint`: Wipe artwork clean of original text.
  - `Translate`: Context-aware Vietnamese translation via Gemini.
- **Real-time Feedback**: Progress bar, active step label (`Erasing text...`, `Translating...`), and error toasts.

### 5. Backend Connectivity & Settings
- AI Server status indicator (Hugging Face / Google Colab endpoint status).
- Connection settings modal: Endpoint URL input, latency ping test.
- Translation configuration: Gemini API Key input, translation style/persona prompt (e.g., Shonen, Romcom, pronouns).
- History stack: Global Undo (`Ctrl+Z`) and Redo (`Ctrl+Y`).

### 6. Export Capabilities
- Single page high-resolution export (PNG / WebP).
- Chapter batch export (packaged `.zip` or direct folder write).

---

## 🎨 PART 4: DESIGN TOKENS & STYLING GUIDELINES

When building or iterating designs in Stitch, use these design tokens for maximum visual appeal:

- **Color Palette**:
  - Background Base: `#090a0f` (Deep space black)
  - Surface Primary: `#12151e` (Dark card surface)
  - Surface Secondary: `#1a1e2b` (Elevated panels / toolbars)
  - Border Subdued: `#262b3d` (Hairline dividing borders)
  - Primary Accent: `#6366f1` (Electric Indigo / Violet)
  - Success / AI Ready: `#10b981` (Emerald green)
  - Warning / In-progress: `#f59e0b` (Amber)
  - Text Primary: `#f8fafc` (Crisp high-contrast white)
  - Text Muted: `#94a3b8` (Slate secondary text)
- **Glassmorphism & Depth**:
  - Floating bars: `background: rgba(18, 21, 30, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08);`
  - Subtle glowing shadow on active AI buttons: `box-shadow: 0 0 20px rgba(99, 102, 241, 0.35);`
- **Border Radius**:
  - Floating docks & bottom sheets: `16px` to `24px`.
  - Buttons & input fields: `8px` to `12px`.
  - Icon buttons: `8px` or fully circular pill.
