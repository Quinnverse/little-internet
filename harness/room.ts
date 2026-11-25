import { defaultRoom } from '../src/core/room.ts'
import { RoomView } from '../src/room3d/view.ts'
import { preloadModels } from '../src/room3d/models.ts'
const q = new URLSearchParams(location.search)
await preloadModels()
const room = defaultRoom()
const view = new RoomView({
  container: document.getElementById('stage')!,
  label: (id) => id,
  onPick: (id) => ((window as any).__picked = id),
  onCell: (x, z) => ((window as any).__cell = [x, z]),
  hotspots: ['diary', 'computer', 'voice', 'pet', 'window', 'door', 'shelf'],
  reduceMotion: q.get('still') === '1',
})
;(window as any).view = view
const data = {
  house: (q.get('house') as 'cabin' | 'villa') ?? 'cabin',
  wall: (q.get('wall') as any) ?? 'cream',
  floor: (q.get('floor') as any) ?? 'oak',
  light: (q.get('light') as any) ?? 'day',
  get decor() { return room.decor },
  memory: [
    { id: 'm1', kind: 'shell', slot: 'shelf-1', title: 'Sea' },
    { id: 'm2', kind: 'candle', slot: 'desk-1', title: 'Night' },
    { id: 'm3', kind: 'book', slot: 'shelf-5', title: 'Book' },
    { id: 'm4', kind: 'postcard', slot: 'wall-1', title: 'Kyoto' },
    { id: 'm5', kind: 'photo', slot: 'wall-2', title: 'Us' },
    { id: 'm6', kind: 'cassette', slot: 'shelf-3', title: 'Mix' },
    { id: 'm7', kind: 'flower', slot: 'sill-1', title: 'Spring' },
    { id: 'm8', kind: 'ticket', slot: 'wall-3', title: 'Concert' },
  ],
  welcome: true,
  pet: { enabled: true, name: 'Boo', color: 'white' },
}
if (q.get('bookcase') === '1') room.decor.push({ id: 'bk', kind: 'bookcase', x: 5, z: 3, rot: Number(q.get('rot') ?? 0) })
view.setData(data as never)
view.jump(Number(q.get('az') ?? Math.PI / 4), Number(q.get('pol') ?? 1.0), view.defaultRadius * Number(q.get('r') ?? 1), (view as any).tgt)
if (q.get('ext') === '1') {
  view.showExterior((q.get('house') as 'cabin' | 'villa') ?? 'cabin', (q.get('wall') as any) ?? 'cream')
  if (q.get('open') === '1') view.openFrontDoor()
}
;(window as any).ready = true
