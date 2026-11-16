# Changelog

## 2.1.0

### New: never lose your drawings
- **Minimap:** a small overview of the whole board in the bottom-right corner. The blue box shows where you are, and every drawing shows as at least a coloured dot. Click or drag in the minimap to jump there, scroll on it to zoom, double-click it to show everything. The **map** button on the bottom bar turns it on or off, and TeachBoard remembers your choice.
- **"Show all"** button (now labelled) and shortcuts **Shift+1** and **Home**: zooms out to fit everything you drew, keeping clear of the minimap and toolbars.
- **"Your drawings are off screen"** message with a **Show all** button. It appears whenever you have moved to an empty part of the board.

### Fixed
- "Show all" couldn't zoom out far enough to fit a very spread-out board. The minimum zoom is now 0.5% (was 10%).
- Arrows now re-attach to a moved shape straight away, instead of on the next screen redraw.

## 2.0.0

### New: tools for software and AI architects
- **Smart connectors** (`C`): drag from one shape to another. The arrow stays attached when you move either shape. Choose elbow, straight or curved lines, arrows at either end, and dashed lines. Double-click an arrow to add a label such as "HTTPS" or "REST".
- **New shape libraries:**
  - **Software / UML:** class, interface, component, package, actor, use case, note, microservice, API, queue, cache, web app.
  - **Cloud & infrastructure:** load balancer, API gateway, container, Kubernetes, serverless function, storage, CDN, monitoring, auth.
  - **AI / LLM:** LLM, AI agent, vector database, embeddings, retriever, GPU, dataset, prompt, ML model, tool.
- **Frames:** labelled boundaries such as "VPC", "Backend" or "Kubernetes cluster". Moving a frame moves everything inside it.
- **Templates:** 3-tier web app, microservices, RAG pipeline, AI agent with tools, and a school LAN.
- **Selection toolbar:** align left / centre / right / top / middle / bottom, space evenly, bring to front, send to back, duplicate, delete.
- **Snap to grid** (magnet button on the board's bottom bar).

### Fixed
- **Export to PNG / PDF did nothing on large boards.** When a drawing covered a very wide area, the export image went over the browser's size limit and failed silently. Exports now scale down to fit, and any error is shown on screen.
- **Shaky handwriting with a touchpad.** New ink smoothing steadies the line while you draw and evens it out when you lift the pen. Adjust it with the new **Smoothing** slider (click the pen again).
- **White screen after using a PDF for a while.** Every page you had looked at stayed in memory until the window crashed. Now only the pages near the screen are kept, and the memory use stays flat.
- **A frozen window when inserting a diagram into a board that wasn't on screen yet** (an invalid zoom made the grid drawing loop forever).

### Added
- **Session restore:** open tabs, PDFs (on the same page), whiteboards and split view come back after closing, reloading or a crash. Whiteboards auto-save in the background.
- **Crash recovery:** if the window crashes or freezes, TeachBoard offers to reload, and everything comes back.
- **Refresh** button in the PDF toolbar, and **Reload** in the top bar (`Ctrl+Shift+R`).
- **"Save what's on screen as PNG"** in the export menu.
- **Auto-update** from GitHub Releases, plus **Check for updates** in the **?** menu.
- Network icons (computer, router, server…) now show their name underneath instead of inside the icon.

## 1.0.0
- First release: whiteboard with pens, shapes, flowcharts, logic gates and network icons; PDF tutes with annotation; built-in browser for Google and YouTube; split screen; screen ink; timer, student picker and spotlight.
