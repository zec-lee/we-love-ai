# SolWeig-URock Microclimate Decision Platform

A two-speed urban microclimate design and decision-support platform that separates **instant 3D geometric and shadow previews** from **physically modelled pedestrian thermal comfort assessments (MRT, Wind, PET, and UTCI)** for a tropical high-density housing estate.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and product choices incorporate your confirmed answers and establish the physics and interaction boundaries for the platform:

- **Confirmed Decision 1 — Tropical Housing Estate with Void Decks**: The playground represents a 5-block high-density tropical residential estate featuring designated pedestrian walkways, a central courtyard, a seating pavilion, a children's playground, and toggleable ground-floor **void decks** (open piloti passages). Total Gross Floor Area (GFA) is locked at **42,000 m²** across all block arrangements so the tool evaluates microclimate performance fairly without rewarding reduced development density.
- **Confirmed Decision 2 — Hybrid Scenario Cache + Live 2.5D Solver**: Standard discrete design combinations are pre-seeded in an indexed server-side scenario cache for **0 ms instant comfort-map switching**. When a user creates an uncalculated combination or drags/rotates a block directly in the 3D scene, the viewport updates shadows immediately, marks the comfort map as **Pending Assessment** (never showing stale heatmaps under modified geometry), and executes a benchmarked 2.5D SOLWEIG-inspired radiation + URock-inspired wind wake solver on demand, caching the output for subsequent visits.
- **Confirmed Decision 3 — Single 3D Viewport with Baseline, Proposal, and Delta Toggles + Point Probes**: The central 3D stage renders a pedestrian-level ($z = 1.5\text{ m}$) spatial grid with synchronized colour scales for **Baseline** and **Proposal**, a diverging **Delta ($\Delta = \text{Proposal} - \text{Baseline}$)** view, and 5 clickable spatial point probes (*Spine Walkway*, *Central Courtyard*, *Children's Playground*, *Seating Pavilion*, and *Block B Void Deck*).

---

## 1. Overview & Core Concept

- **What It Does**: Enables urban designers, architects, and planners to test how block orientation, building spacing/ventilation corridors, ground-floor void decks, overhead shade canopies, and tropical tree arrangements alter Mean Radiant Temperature ($T_{mrt}$), pedestrian airflow ($v_a$), Physiological Equivalent Temperature ($\text{PET}$), and Universal Thermal Climate Index ($\text{UTCI}$) relative to a baseline estate.
- **Target Audience / Persona**: Urban microclimate analysts, housing estate masterplanners, and sustainability teams evaluating heat-mitigation interventions under tight design deadlines.
- **Key Value**: Enforces methodological honesty in real-time environmental design—distinguishing between what can be shown instantaneously in the browser (geometry and direct solar shadow casting) and what requires spatial radiative and aerodynamic modelling ($T_{mrt}$, wind wakes, PET, and UTCI), while clearly declaring model assumptions (constant background air temperature $T_a$ and relative humidity $RH$).

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Milestone 1 Baseline vs. Intervention Inspection (Zero-State)**:
   - On launch, the platform loads the **Baseline Estate** alongside a pre-modelled **Walkway + Playground Shade Intervention** on a common $48 \times 48$ pedestrian grid ($2.5\text{ m}$ spatial resolution across a $120\text{ m} \times 120\text{ m}$ site).
   - Users toggle between **Baseline**, **Proposal**, and **Delta ($\Delta$)** maps across five layers (**UTCI**, **PET**, **MRT**, **Wind Speed**, and **Shade Coverage**) and click 3D point probes to inspect exact local improvements.
2. **Fast Cached Scenario Exploration (Speed 1 — Cached Assessment)**:
   - Selecting discrete presets in the Left Control Panel (e.g., *Orientation: +15° NE Wind Alignment*, *Layout: Staggered Courtyard*, *Greenery: Mature Rain Tree Cluster*) hits the scenario cache.
   - The comfort heatmap, spatial percentiles ($P_{50}$, $P_{90}$, Hotspot $P_{95}$), and Area Above Threshold ($\text{UTCI} > 32^\circ\text{C}$) update instantaneously with a `CACHE HIT` badge.
3. **Custom Geometry Manipulation & On-Demand Modelling (Speed 1 Preview $\rightarrow$ Speed 2 Assessment)**:
   - Rotating or translating an individual housing block in 3D or selecting an uncalculated custom combination immediately updates the 3D buildings, trees, canopies, and real-time WebGL solar shadows.
   - The pedestrian comfort heatmap immediately transitions to a wireframe grid with an explicit **`Assessment Pending — Geometry Modified`** banner so stale thermal data is never displayed under new geometry.
   - Clicking **Run Modelled Assessment** triggers the backend SOLWEIG + URock + PET/UTCI pipeline, displays the solver benchmark time (ms), renders the new comfort map, and stores the scenario in the cache.
4. **Grounded AI Design Advisor & One-Click Hypothesis Testing**:
   - The Right Panel includes a focused AI analysis module powered by Gemini (`gemini-3.8-flash`) that reads the actual calculated spatial percentiles, zone probes, and hotspot coordinates between Baseline and Proposal.
   - It explains *why* specific zones improved or remained thermally stressed and proposes the next logical intervention (labeled clearly as **`Cached`** or **`Untested Proposal`**) with a **`Test This Option`** action button that applies those exact parameters.

### Visual Identity & Theme

- **Aesthetic Direction**: **Precision Scientific & Architectural Instrument**—combining clinical cartographic authority with high-legibility tabular telemetry.
- **Color Palette & Mood (60-30-10 Distribution)**:
  - **60% Dominant Neutral Canvas**: Deep slate-obsidian workspace (`#0B0F17`) with subtle daytime sky atmosphere in the 3D viewport so thermal heatmaps and sun shadows read with maximum contrast.
  - **30% Structural Panels & Hairline Grids**: Matte instrument panels (`#111827`) separated by crisp `1px solid #1E293B` hairline dividers, primary text in `#F8FAFC`, and muted labels in `#94A3B8`.
  - **10% Precision Telemetry Accents**: Calibrated cyan (`#06B6D4`) for active controls and wind vectors, amber (`#F59E0B`) for solar/radiant metrics, emerald (`#10B981`) for cooling reductions ($\Delta < 0^\circ\text{C}$), and standardized scientific colour ramps (Inferno/Turbo for absolute UTCI/PET/MRT; Viridis/Cyan for Wind; Coolwarm Blue-to-Red for Delta $\Delta$).
- **Typography & Hierarchy**:
  - **Display & UI Labels**: `Plus Jakarta Sans` (600 SemiBold for headers, 400 Regular for controls).
  - **Telemetry, Coordinates & Comfort Metrics**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` so fluctuating values, percentiles, and $\Delta$ comparisons align vertically without layout jitter.
- **Decision-Oriented Screen Architecture**:
  - **Top Bar Contract**: Single-line brand title (`SolWeig-URock Studio`), concise section links (*Scope & Physics*, *Scenario Cache*, *Benchmark Log*, *Export GeoJSON*), and primary action (*Run Assessment*).
  - **Left Panel (Design Controls, 320px)**: Controlled options for Orientation, Layout & Void Decks (with live GFA conservation meter locked at $42,000\text{ m}^2$), Shading Canopies, and Tropical Greenery (crown diameter, height, leaf transmissivity $\tau$).
  - **Centre Stage (3D Estate Viewport, Flex-1)**: Interactive Three.js scene with composite procedural housing blocks (with visible ground-floor void deck piloti), multi-tier tree canopies, tensile/pergola shade structures, pedestrian-level heatmap mesh, wind streamline arrows, and 5 clickable spatial probes.
  - **Right Panel (Baseline vs. Proposal Decisions, 380px)**: Synchronized comparison cards, Area Above Stress Threshold bar ($\text{UTCI} > 32^\circ\text{C}$ / $> 38^\circ\text{C}$), $P_{50}$ / $P_{90}$ / Hotspot Max readout, probe comparison table, and the Grounded AI Advisor card.
  - **Bottom Tray (Weather, Time & Two-Speed Status)**: Fixed weather scenario selector, solar time buttons (`10:00`, `14:00`, `16:30`), explicit model scope disclosure banner, and cache/solver status indicator.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Explicit Stale-Map Invalidation on Geometry Edit**
  - *Chosen Approach*: Any uncalculated change to block position, angle, or design parameters immediately hides the thermal colour fill on the pedestrian grid and displays a clean geometric shadow preview with a `Pending Assessment` state until calculated.
  - *Why*: Prevents misleading users into believing that WebGL shadow casting is a full MRT/wind/UTCI calculation.
  - *Alternatives Considered*: Keeping the previous heatmap visible while editing (rejected—violates physical credibility).
- **Decision 2: Void Deck & Block Spacing Aerodynamic Resolution (URock-Inspired)**
  - *Chosen Approach*: Represent buildings with both 2.5D footprints/heights and explicit ground-floor permeability ($0\text{–}3.5\text{ m}$ void deck clearance). In the wind solver, solid ground floors create an upwind displacement zone and a downwind recirculation cavity + wake deficit, whereas open void decks permit venturi-accelerated under-building flow ($1.15\times$ channel acceleration) that ventilates downstream courtyards.
  - *Why*: Directly addresses the requirement that ground-floor openings and void decks must be resolved by the wind model rather than flattened into simple solid footprints.
- **Decision 3: Constant GFA Constraint Across Ventilation Layouts**
  - *Chosen Approach*: All layout alternatives (*Baseline Parallel*, *Staggered Courtyard*, *Wind-Corridor Widened*, and *Perimeter Void-Deck Cluster*) maintain an identical total floor area ($42,000\text{ m}^2$) by automatically adjusting block storeys or footprint proportions when spacing changes.
  - *Why*: Ensures ventilation or shading gains are genuinely caused by urban form rather than deleting floor space.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT: REACT 19 + THREE.JS VIEWPORT                          │
│                                                                                      │
│  ┌─────────────────────┐  ┌────────────────────────────────┐  ┌───────────────────┐  │
│  │ Left Design Panel   │  │ Central 3D Estate Stage        │  │ Right Decision    │  │
│  │ • Orientation       │  │ • Composite Blocks + VoidDecks │  │ Panel             │  │
│  │ • Layout & Spacing  │  │ • Canopy & Tree InstancedMesh  │  │ • Base vs Prop    │  │
│  │ • Shade Canopies    │  │ • Real-Time Sun Shadow Rig     │  │ • P50/P90/Hotspot │  │
│  │ • Greenery Species  │  │ • Pedestrian Grid (z = 1.5m)   │  │ • Stress Area %   │  │
│  │ • GFA Lock Meter    │  │ • 5 Interactive Point Probes   │  │ • AI Advisor Card │  │
│  └─────────┬───────────┘  └───────────────▲────────────────┘  └─────────▲─────────┘  │
│            │                              │                             │            │
│            ▼                              │                             │            │
│  ┌────────────────────────────────────────┴─────────────────────────────┴─────────┐  │
│  │ Two-Speed State Coordinator & Scenario Hash Engine                             │  │
│  │ • Speed 1 (0ms): Update 3D transforms + sun shadows; check Scenario Cache      │  │
│  │ • If Uncached: Invalidate heatmap -> Show "Pending Assessment" wireframe       │  │
│  │ • Speed 2: Dispatch /api/simulate or load cached grid -> Render PET/UTCI/Delta │  │
│  └────────────────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────────────────┼──────────────────────────────────────────┘
                                            │ HTTP JSON (/api/*)
┌───────────────────────────────────────────▼──────────────────────────────────────────┐
│                     SERVER: EXPRESS + MICROCLIMATE PHYSICS ENGINE                    │
│                                                                                      │
│  ┌──────────────────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ Scenario Cache Store (In-Memory)     │   │ 2.5D Microclimate Solver Pipeline   │  │
│  │ • Pre-seeded Milestone Scenarios     │   │ 1. SOLWEIG-Lite Radiation Solver    │  │
│  │ • O(1) Lookup by Scenario Hash       │   │    (Solar raycast + SVF + T_mrt)    │  │
│  │ • Stores 48x48 grids + Probe stats   │   │ 2. URock-Lite Wind Field Solver     │  │
│  └──────────────────────────────────────┘   │    (Cavity/Wake + Void Deck Venturi)│  │
│                                             │ 3. Comfort Module (PET & UTCI)      │  │
│  ┌──────────────────────────────────────┐   └─────────────────────────────────────┘  │
│  │ Grounded AI Advisor (/api/ai-advise) │                                            │
│  │ • @google/genai (gemini-3.8-flash)   │                                            │
│  │ • Grounded in actual grid deltas     │                                            │
│  │ • Emits testable parameter proposals │                                            │
│  └──────────────────────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Physics Pipeline

1. **Estate Geometry & Scenario Parameters (`ScenarioConfig`)**:
   - `orientationDeg`: `0° (N-S)` | `15° (NE Wind Aligned)` | `30° (Oblique)` | `45° (E-W Canyon)` (plus custom block angle override).
   - `layoutPreset`: `'baseline-parallel'` | `'staggered-courtyard'` | `'wind-corridor'` | `'void-deck-cluster'`.
   - `voidDecksEnabled`: `boolean` (opens $3.6\text{ m}$ ground-floor piloti passages beneath blocks).
   - `shadingConfig`: independent toggles for `walkwayCanopy`, `playgroundShadeSails`, and `courtyardPergola`.
   - `greeneryConfig`: `'none'` | `'sparse-palms'` | `'courtyard-raintrees'` | `'dense-canopy-avenue'` (each with explicit trunk height $H$, crown radius $R$, and shortwave transmissivity $\tau \in [0.12, 0.45]$).
   - `weatherScenario`: `'peak-tropical'` ($T_a = 32.0^\circ\text{C}, RH = 68\%, v_{ref} = 2.8\text{ m/s NE}$) | `'monsoon-breeze'` ($T_a = 30.0^\circ\text{C}, RH = 75\%, v_{ref} = 4.2\text{ m/s NE}$) | `'calm-heatwave'` ($T_a = 34.0^\circ\text{C}, RH = 62\%, v_{ref} = 1.2\text{ m/s E}$).
   - `timeOfDay`: `'10:00'` | `'14:00'` | `'16:30'`.
2. **Spatial Grid Outputs (`SimulationResult`, $48 \times 48 = 2,304$ cells at $z = 1.5\text{ m}$)**:
   - **SOLWEIG-Inspired Mean Radiant Temperature ($T_{mrt}$)**: Computes solar altitude/azimuth for the selected time, casts rays against 3D building volumes, shade structures ($\tau = 0.08$), and tree crowns ($\tau = 0.18$), estimates Sky View Factor ($\psi_{sky}$) from surrounding building solid angles, and combines direct shortwave ($K_{dir}$), diffuse sky ($K_{diff}$), and longwave wall/ground radiation ($L_{\uparrow}, L_{\downarrow}$) into $T_{mrt}$ ($^\circ\text{C}$).
   - **URock-Inspired Wind Speed ($v_a$)**: Rotates the approach wind profile to the incident wind direction, identifies upwind displacement zones, street-canyon channelling, downwind leeward recirculation cavities, and 3D wake velocity deficits behind each block and tree crown, while explicitly modelling under-building void-deck throughflow when `voidDecksEnabled` is active.
   - **Comfort Indicators (UTCI & PET)**: Evaluates the 6th-order UTCI polynomial approximation $f(T_a, T_{mrt} - T_a, v_{10m}, e_a)$ and the MEMI energy-balance PET approximation at every grid cell, plus summary statistics ($P_{50}$ median, $P_{90}$, $P_{95}$ hotspot, % area with $\text{UTCI} > 32^\circ\text{C}$ Strong Heat Stress, and % shade coverage).

### Interactive Component & State Mapping

- **Baseline Pinning & Instant Comparison**: Users can lock any calculated scenario as the **Baseline** (defaults to the unshaded parallel estate) and toggle the 3D surface between `Baseline`, `Proposal`, and `Delta (Proposal - Baseline)`. Baseline and Proposal always share a locked colour scale ($26^\circ\text{C}\text{–}44^\circ\text{C}$ for UTCI/PET, $28^\circ\text{C}\text{–}62^\circ\text{C}$ for MRT, $0\text{–}5\text{ m/s}$ for Wind) so visual comparisons are never distorted by auto-scaling.
- **3D Block Manipulation Mode**: An interactive "Custom Block Edit" toggle lets users select one of the 5 housing blocks in the 3D viewport and nudge its position or rotation. This immediately demonstrates the **Uncalculated Arrangement** workflow: 3D shadows update in real time, the comfort map enters `Pending Assessment`, and clicking **Run Modelled Assessment** computes and caches the custom arrangement.
- **Grounded AI Advisor (`POST /api/ai-advise`)**: Sends the active Baseline vs. Proposal summary metrics, 5 zone probe readings, and available parameter options to `gemini-3.8-flash` with a strict JSON schema returning an empirical diagnosis and 2 concrete next-step recommendations (each tagged as `Cached` or `Untested Proposal`) with a working **Test This Option** handler.
