# Storyboard shot placeholder (dual IP-Adapter)

Used when a shot has **both** a character sheet reference and a location angle reference.

- Node **10**: character casting reference (identity, wardrobe)
- Node **11**: location / background reference (set, lighting, environment)
- Nodes **13** and **14**: chained `IPAdapterAdvanced` passes (character first, then location)

Requires ComfyUI_IPAdapter_plus on the render server.
