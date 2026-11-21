# NEXUS // DAG — Interactive 2D Node-Graph & Topological Pipeline Engine

[![CI](https://github.com/Nannidan/nexus-dag/actions/workflows/ci.yml/badge.svg)](https://github.com/Nannidan/nexus-dag/actions)
**Live Demo:** [https://nannidan.github.io/nexus-dag/](https://nannidan.github.io/nexus-dag/)

Interactive 2D spatial workflow canvas engineered with **React 19**, **TypeScript**, **SVG Cubic Bézier Routing**, and **Tailwind CSS v4**.

## Key Engineering Highlights
- **60fps Pointer-Captured Spatial Canvas:** Drag nodes across a zoomable 2D coordinate grid with real-time cubic Bézier wire recalculation.
- **DFS Cycle Detection & Port-to-Port Wiring:** Interactive wire linking validates graph acyclicity before committing directed edges.
- **Kahn's Level-Order Topological Execution Solver:** Computes parallel execution levels and animates active data-flow stages with live latency and token telemetry.
