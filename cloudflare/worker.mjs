import { DurableObject } from 'cloudflare:workers';
import roomModule from '../multiplayer.js';
import Poker from '../engine.js';
import { randomInt } from 'node:crypto';
const { Rooms } = roomModule;
// One coordinator for this six-player prototype. All private cards stay server-side.
export class PokerRooms extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = new Rooms({externalTimers:true});
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('rooms');
      for (const data of saved || []) {
        const game = Object.assign(Object.create(Poker.Game.prototype), data.game, {rng:()=>randomInt(0,0x100000000)/0x100000000});
        const room = {...data, game, submitted:new Set(data.submitted), timer:null};
        this.rooms.rooms.set(room.code, room);
      }
      for (const ws of ctx.getWebSockets()) {
        const session = ws.deserializeAttachment();
        ws.session = session;
        const member = session && this.rooms.rooms.get(session.code)?.members[session.index];
        if (member) { member.ws = ws; member.offlineAt = null; }
      }
    });
  }
  async save() {
    const data = [...this.rooms.rooms.values()].map(room => ({
      ...room, game:{...room.game, rng:undefined}, timer:null, submitted:[...room.submitted],
      members:room.members.map(m => m ? {...m, ws:undefined} : null)
    }));
    await this.ctx.storage.put('rooms', data);
    const now = Date.now();
    const deadlines = [...this.rooms.rooms.values()].flatMap(room => [
      ...(room.deadline ? [room.deadline] : []),
      ...(!room.members.some(m => m && !m.bot && m.ws?.readyState===1) ? [room.lastActive+this.rooms.roomTtl] : [])
    ]);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(now+1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required',{status:426});
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(null);
    return new Response(null,{status:101,webSocket:pair[0]});
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 8192) return this.rooms.send(ws,{type:'error',message:'请求过大'});
    const now=Date.now();
    if (!ws.rateStart || now-ws.rateStart>1000) {ws.rateStart=now;ws.rateCount=0;}
    if (++ws.rateCount>20) return this.rooms.send(ws,{type:'error',message:'操作太频繁，请稍后再试'});
    try {this.rooms.message(ws,JSON.parse(raw)); ws.serializeAttachment(ws.session||null);}
    catch (error) {this.rooms.send(ws,{type:'error',message:error.message});}
    await this.save();
  }
  async webSocketClose(ws,code,reason) { this.rooms.disconnect(ws); try {ws.close(1000,'Connection closed');} finally {await this.save();} }
  async webSocketError(ws) { this.rooms.disconnect(ws); await this.save(); }
  async alarm() {
    const now=Date.now();
    for (const room of this.rooms.rooms.values()) if (room.deadline && room.deadline<=now) this.rooms.advance(room);
    this.rooms.sweep();
    await this.save();
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(url.pathname==='/healthz') return Response.json({ok:true});
    if(url.pathname==='/ws') {
      if(request.headers.get('Origin') && request.headers.get('Origin')!==url.origin) return new Response('Forbidden',{status:403});
      return env.POKER_ROOMS.get(env.POKER_ROOMS.idFromName('six-city-v1')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
