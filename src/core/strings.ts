import type { Lang } from './schema.ts'

/** Fixed words in generated pages. Everything the owner writes is shown as written. */
const en = {
  home: 'Home',
  friends: 'Friends',
  latest: 'Latest',
  answering: 'Answering machine',
  noFriends: 'No friends linked yet.',
  noMessages: 'No messages yet.',
  nothing: 'Nothing here yet.',
  aMessage: 'A message',
  forDate: 'for {date}',
  prev: '← Prev',
  next: 'Next →',
  webring: 'Webring',
  random: 'Random',
  rss: 'RSS',
  madeWith: 'Made with Little Internet',
  readTitle: 'Read “{title}”',
  listen: 'Listen to my voice',
  meet: 'Meet my friends',
  randomSite: 'Visit a random site',
  followRss: 'Follow with RSS',
  greeting: 'Hi, I’m {name}. Welcome to {site}!',
  fallbackName: 'the ghost',
  video: 'Video',
  // 3D room (visitor)
  someonesHome: 'Someone’s home',
  ring: 'Ring the doorbell',
  skip: 'Skip to website',
  website: 'Website',
  welcomeFrom: 'A message from the owner',
  play: 'Play',
  pause: 'Pause',
  recordedOn: 'Recorded {date}',
  entries: 'Entries',
  noEntries: 'Nothing public yet.',
  guestbook: 'Guestbook',
  guestHint: 'Leave a short note. The owner reads it first, then decides whether to show it here.',
  yourName: 'Your name',
  yourNote: 'Your note',
  send: 'Send',
  thanks: 'Thank you. The owner will see it first.',
  sendFail: 'Could not send. Try again later.',
  close: 'Close',
  light: 'Switch light',
  petHello: '{name} runs over to say hello.',
  hotDiary: 'Diary',
  hotComputer: 'Computer',
  hotVoice: 'Answering machine',
  hotPet: 'Pet',
  hotWindow: 'Window',
  hotShelf: 'Shelf',
  hotDoor: 'Front door',
  hotBell: 'Doorbell',
  drag: 'Drag to look around. Tap things to explore.',
} as const

export type SiteKey = keyof typeof en

const zh: Record<SiteKey, string> = {
  home: '首页',
  friends: '友情链接',
  latest: '最新',
  answering: '答录机',
  noFriends: '还没有链接朋友。',
  noMessages: '还没有留言。',
  nothing: '这里还空着。',
  aMessage: '一段留言',
  forDate: '给 {date}',
  prev: '← 上一个',
  next: '下一个 →',
  webring: '网站环',
  random: '随机',
  rss: 'RSS',
  madeWith: '由 Little Internet 制作',
  readTitle: '读读《{title}》',
  listen: '听听我的声音',
  meet: '认识我的朋友',
  randomSite: '随机逛一个网站',
  followRss: '用 RSS 订阅',
  greeting: '嗨，我是{name}。欢迎来到{site}！',
  fallbackName: '小幽灵',
  video: '视频',
  someonesHome: '有人的家',
  ring: '按门铃',
  skip: '直接看网站',
  website: '网站',
  welcomeFrom: '主人留下的话',
  play: '播放',
  pause: '暂停',
  recordedOn: '录于 {date}',
  entries: '日记',
  noEntries: '还没有公开的内容。',
  guestbook: '留言簿',
  guestHint: '留一句话吧。主人会先看到，再决定是否显示在这里。',
  yourName: '你的名字',
  yourNote: '你的留言',
  send: '发送',
  thanks: '谢谢你。主人会先看到。',
  sendFail: '发送失败，请稍后再试。',
  close: '关闭',
  light: '切换灯光',
  petHello: '{name}跑过来跟你打招呼。',
  hotDiary: '日记本',
  hotComputer: '电脑',
  hotVoice: '答录机',
  hotPet: '宠物',
  hotWindow: '窗户',
  hotShelf: '书架',
  hotDoor: '大门',
  hotBell: '门铃',
  drag: '拖动环顾四周，点击物件探索。',
}

const DICT = { en, zh } as const

export function siteStrings(lang: Lang): Record<SiteKey, string> {
  return DICT[lang] ?? en
}

export function fmt(s: string, vars: Record<string, string | number>): string {
  let out = s
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

export const htmlLang = (lang: Lang) => (lang === 'zh' ? 'zh-CN' : 'en')
