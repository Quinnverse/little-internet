// Credentials and endpoint are deployment settings. Only the configured home's authenticated owner can spend this quota.
export async function chatWithBoo(input: unknown): Promise<string> {
  const cfg = process.env
  if (!cfg.BOO_CHAT_URL || !cfg.BOO_CHAT_MODEL) throw Error('Model unavailable')
  const data = input as {messages?: unknown; sources?: unknown}
  if (!Array.isArray(data?.messages) || !data.messages.length || data.messages.length>13) throw Error('Invalid conversation')
  const messages = data.messages.map(m=>{
    if (!m || !['user','assistant'].includes(m.role) || typeof m.content!=='string' || m.content.length>2000) throw Error('Invalid message')
    return {role:m.role,content:m.content}
  })
  const sources = typeof data.sources==='string' ? data.sources.slice(0,2400) : ''
  const response = await fetch(cfg.BOO_CHAT_URL, {method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),
    headers:{'Content-Type':'application/json',...(cfg.BOO_CHAT_KEY?{Authorization:'Bearer '+cfg.BOO_CHAT_KEY}:{})},
    body:JSON.stringify({model:cfg.BOO_CHAT_MODEL,temperature:0.65,max_tokens:500,messages:[{role:'system',content:'You are Boo, a friendly companion in a personal home. Reply naturally in the user’s language. Follow the thread of this conversation. When asked an ordinary question answer it directly, without forcing a reference to the home. Ask only if you need clarification. Never claim to change the home or send mail. Letters opens the mailbox; Friends exchanges codes. Cite source titles and dates only if supplied. For private material rely only on explicitly supplied excerpts.'},...messages,...(sources?[{role:'user',content:'Authorized reference excerpts:\n'+sources}]:[])]})})
  if (!response.ok) throw Error('Model unavailable')
  const answer=(await response.json()).choices?.[0]?.message?.content
  if(typeof answer!=='string'||!answer.trim())throw Error('Empty answer')
  return answer.trim()
}
