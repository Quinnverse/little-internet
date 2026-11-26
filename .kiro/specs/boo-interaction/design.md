# Design: Boo interaction

`OwnerGhost.tsx` mounts `CameraControl mode="boo"`. `ContextRouter` returns `{kind:'boo', reaction}`; `Home.tsx` maps it to `pet.set('greet' | 'react')`. Mail polling in `Home.tsx` compares the server's unread count to the last known one before reacting. Offline keeps the last count and shows nothing new.
