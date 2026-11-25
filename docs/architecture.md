# Architecture

```mermaid
flowchart LR
  subgraph Device["Owner's device (browser, no account)"]
    IDB[(IndexedDB<br/>one Project: entries, room,<br/>website draft + snapshot, media)]
    Home[3D Home] --- Journal[Journal] --- Atelier[Web Atelier]
    IDB <--> Home & Journal & Atelier
    Gen["generateSite(project)<br/>public projection + one design"]
    Atelier -->|live preview: same renderer| Gen
  end
  Gen -->|ZIP, public only| Export[(Website ZIP<br/>static host / offline)]
  Gen -->|PUT with owner key| Server
  IDB -->|private backup ZIP| Backup[(Backup file)]
  subgraph Server["Little Internet server (Node 22, SQLite)"]
    Check["validate site.json, public only,<br/>image magic bytes, size limits"]
    Sites["/@slug/ static files<br/>CSP sandbox"]
    Ring["/ring/ directory<br/>prev / next / random"]
    GB["guestbook: pending → approved"]
    Door["close door = delete files"]
  end
  Server --> Visitor[Visitor browser]
  Visitor -->|signs guestbook| GB
```

## Rules that hold the design together
1. **One data source.** The Project holds entries, recordings, keepsakes, room and the website design. Widgets store
   ids, never copies of diary text.
2. **Draft vs published.** `web.draft` is edited; `web.published` is a frozen copy. `publicProjection(p)` keeps exactly one
   design (the snapshot), drops hidden widgets and private references, and ships only the media a public entry, that
   design or a friend badge uses.
3. **One renderer.** `generateSite` builds publishing, export and (inlined, no scripts) the Atelier preview.
4. **Server trusts nothing.** It re-validates the uploaded `site.json`, refuses private entries and non-images, and
   serves pages in a sandbox with no access to the editor origin. Owner keys are stored as SHA-256 hashes only.
5. **Privacy follows content.** When something stops being public the editor republishes; Close the Door deletes the
   published copy. The service worker never caches the API, published sites or the webring.
6. **Portable.** Website ZIP runs on any static host; the private backup restores everything including the design.
