# AI Group Photo Selector - Design Guidelines

## Design Approach: Photo-Centric Utility Interface

**Primary Reference**: Google Photos meets Linear - Clean, efficient interface with photo-first visual hierarchy and subtle AI intelligence indicators

**Core Principle**: Confidence through clarity - Users should feel the AI is working intelligently while maintaining full control and transparency

---

## Color System

### Light Mode
- **Primary Brand**: 245 75% 55% (Vibrant blue-purple, conveying AI intelligence)
- **Surface**: 0 0% 100% (Pure white backgrounds)
- **Surface Elevated**: 220 15% 98% (Subtle gray for cards)
- **Text Primary**: 222 47% 11% (Near-black)
- **Text Secondary**: 215 16% 47% (Slate gray)
- **Success (Best Photo)**: 142 76% 36% (Green)
- **Warning (Issues)**: 38 92% 50% (Amber)
- **Border**: 214 20% 90% (Light gray)

### Dark Mode
- **Primary Brand**: 245 75% 65% (Brighter blue-purple)
- **Surface**: 222 47% 11% (Deep charcoal)
- **Surface Elevated**: 217 33% 17% (Elevated dark)
- **Text Primary**: 210 20% 98% (Off-white)
- **Text Secondary**: 215 14% 71% (Light slate)
- **Success**: 142 76% 45% (Brighter green)
- **Warning**: 38 92% 60% (Brighter amber)
- **Border**: 217 19% 27% (Dark border)

---

## Typography

**Font Stack**: 
- Primary: 'Inter' (UI elements, headers, body text)
- Monospace: 'JetBrains Mono' (quality scores, technical data)

**Scale**:
- Hero/Display: 3xl (36px), font-bold
- Section Headers: 2xl (24px), font-semibold  
- Card Titles: lg (18px), font-medium
- Body Text: base (16px), font-normal
- Captions/Metadata: sm (14px), font-normal
- Data Points: xs (12px), font-mono

---

## Layout System

**Spacing Units**: Tailwind scale of 4, 6, 8, 12, 16 (consistent rhythm)

**Grid Structure**:
- Max container width: `max-w-7xl mx-auto`
- Dashboard layout: Sidebar (260px) + Main content (flex-1)
- Photo grid: 2 columns mobile, 3 columns tablet, 4 columns desktop
- Analysis view: 60/40 split (photo preview / analysis panel)

**Responsive Breakpoints**: sm: 640px, md: 768px, lg: 1024px, xl: 1280px

---

## Component Library

### Navigation
- **Top Header**: Logo left, user avatar right, height h-16, border-b with primary action (Upload Photos)
- **Sidebar Navigation** (Desktop): Fixed left, icons + labels, active state with primary background, subtle hover transitions

### Upload Interface
- **Dropzone**: Large dashed border, hover state with primary/10 background, accept state with success color
- **Upload Progress**: Linear progress bars per photo, with thumbnail preview and filename
- **Photo Grid**: Cards with aspect-ratio-square, overlay on hover showing quality score

### Analysis Dashboard
- **Photo Card**: Image with overlay gradient (bottom), quality score badge (top-right), checkmark for "Best Photo"
- **Face Detection Visualization**: Bounding boxes in primary color with 2px stroke, landmark dots at 3px diameter
- **Quality Indicators**: Circular progress rings for eye detection/smile scores, color-coded (green >80%, amber 50-80%, gray <50%)
- **Analysis Panel**: Stats grid (2 columns), issue badges with warning colors, recommendation card with CTA

### Buttons & Actions
- **Primary CTA**: Solid primary background, white text, px-6 py-3, rounded-lg, hover:brightness-110
- **Secondary**: Outline variant, primary border, hover:bg-primary/5
- **Icon Buttons**: Square with hover:bg-surface-elevated, rounded-lg, p-2

### Data Visualization
- **Quality Score Display**: Large numerals (text-4xl font-mono), with circular progress ring, label below
- **Face Metrics Table**: Two-column layout, metric name left-aligned, value/bar right-aligned
- **Issue Indicators**: Icon + count in warning color, grouped in flex row

### Feedback & States
- **Loading**: Skeleton screens with shimmer animation for photo analysis
- **Empty States**: Centered icon (text-6xl), heading, subtext, primary CTA
- **Success Toast**: Slide-in from top-right, green accent border-l-4, auto-dismiss
- **Error States**: Inline error messages with warning color, retry button

---

## Interaction Patterns

### Photo Upload Flow
1. Drag-drop zone fills viewport (empty state)
2. Photos appear in grid as they upload (thumbnails)
3. Progress indicators per photo
4. Auto-navigate to analysis when upload completes

### Analysis Experience  
1. Photos displayed in grid with loading skeletons
2. Face detection overlays appear progressively
3. Quality scores populate with count-up animation
4. Best photo highlights with subtle pulse effect
5. Recommendation card slides in from bottom

### Photo Selection & Download
1. Click photo to expand lightbox view
2. Face detection overlays toggle on/off
3. Download button in top-right with format options
4. Share button generates public link

---

## Visual Language

**Imagery**: User-uploaded photos are the hero content - minimal decorative imagery. Use abstract gradient meshes only in empty states (primary + analogous colors)

**Iconography**: Heroicons outline style, 24px default size, stroke-width-2

**Elevation**: Subtle shadows - `shadow-sm` for cards, `shadow-lg` for modals, `shadow-xl` for dropdowns

**Borders & Radius**: 
- Cards: rounded-xl (12px)
- Buttons: rounded-lg (8px)  
- Inputs: rounded-md (6px)
- Overlays: rounded-2xl (16px)

**Animations**: 
- Micro-interactions only: hover scale (scale-105), fade-ins (opacity), loading spinners
- Analysis results: Stagger appearance with 100ms delay between items
- NO page transitions, NO excessive motion

---

## Key Screens

### 1. Dashboard (Authenticated)
- Top header with "Upload Photos" CTA
- Session list: Card grid showing past analyses, thumbnail + date + photo count
- Quick stats: Total sessions, photos analyzed, time saved

### 2. Upload Flow
- Full-viewport dropzone when empty
- Grid of uploading photos with progress
- "Analyze" button appears when upload complete

### 3. Analysis Results
- Photo grid with quality scores overlaid
- "Best Photo" highlighted with green border-2 and badge
- Expandable analysis panel showing face metrics
- Download/Share actions in sticky footer

### 4. Auth Pages
- Centered card (max-w-md), minimal branding
- Email/password fields with validation states
- Social login options (if using Replit Auth)
- Clean illustration or gradient background

---

## Accessibility & Responsiveness

- Color-coded indicators MUST have icon/text alternatives
- Face detection overlays have descriptive labels (screen readers)
- Touch targets minimum 44x44px on mobile
- Mobile: Stack analysis panel below photo, collapsible sections
- Keyboard navigation: Focus rings in primary color, logical tab order

---

## Brand Personality

**Tone**: Intelligent but approachable - "Your smart photo assistant"

**Voice**: Confident recommendations ("This is your best photo"), transparent explanations ("2 faces detected, all eyes open, 3 smiling")

**Trust Signals**: Show confidence scores, explain why a photo was selected, allow user override